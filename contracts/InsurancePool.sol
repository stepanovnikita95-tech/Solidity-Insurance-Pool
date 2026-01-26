// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IPolicyNFT.sol";
import "./interfaces/IOracle.sol";
import "./Treasury.sol";

/// @title InsurancePool - simple insurance pool with NFT-policies
/// @notice LPs contribute ETH, users buy coverage, and the owner decides on payouts through an oracle.
/// @dev Trusted owner model (centralized Oracle). A share system has been added to ensure fair distribution of profits.
contract InsurancePool is Ownable, ReentrancyGuard, Pausable {
    IPolicyNFT public immutable policyNFT;
    IOracle public immutable oracle;
    address public immutable treasury;

    uint256 public totalShares;
    uint256 public totalLockedCoverage;

    uint256 public constant BPS = 10_000; // BASIS_POINTS
    uint256 public constant MAX_DURATION = 30 days;

    uint256 public maxCoverageBps; // % от пула // maxCoveragePerPolicy = 2000 (20%) 
    uint256 public premiumRateBps;          // в bps // premiumRate = 300 (3%)
    uint256 public protocolFeeBps;          // в bps // protocolFee = 500 (5%)

    mapping(address => uint256) public sharesOf;
    mapping(uint256 => PolicyData) public policies;

    struct PolicyData {
        uint256 coverage;
        uint256 premium;
        uint256 start;
        uint256 end;
        bool resolved;
    }
    // Errors
    error ZeroValue();
    error InvalidBPS();
    error AmountNotEnough();
    error ZeroAddress();
    error NoLiquidity();
    error DurationOutOfRange();
    error CoverageLimitExceeded();
    error WrongPremium();
    error PolicyNotFound();
    error AlreadyResolved();
    error PolicyNotExpired();
    error TransferFailed();
    
    // Events
    event LiquidityProvided(address indexed provider, uint256 ethAmount, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 shares);
    event PolicyCreated(address indexed buyer, uint256 indexed policyId, uint256 coverage, uint256 premium);
    event PolicyResolved(uint256 indexed policyId, bool paid, uint256 payoutAmount);
    event ParametersUpdated(uint256 maxCoverageBps, uint256 premiumRateBps, uint256 protocolFeeBps);
    
    constructor(
        address initialOwner, 
        address _policyNFT, 
        address _oracle, 
        address _treasury, 
        uint256 _maxCoverageBps, 
        uint256 _premiumRateBps, 
        uint256 _protocolFeeBps
        ) 
        Ownable (initialOwner) 
        {
        require(_policyNFT != address(0), ZeroAddress());
        require(_oracle != address(0), ZeroAddress());
        require(_treasury != address(0), ZeroAddress());
        
        policyNFT = IPolicyNFT(_policyNFT);
        oracle = IOracle(_oracle);
        treasury = _treasury;

        maxCoverageBps = _maxCoverageBps;
        premiumRateBps = _premiumRateBps;
        protocolFeeBps = _protocolFeeBps;
    }

    // === LP functions ===

    /// @notice Provide liquidity
    function deposit() external payable whenNotPaused nonReentrant{
        require(msg.value > 0, ZeroValue());
        require(msg.value >= 0.001 ether, AmountNotEnough());

        uint256 shareToMint;

        if (totalShares == 0) { 
            shareToMint = msg.value;
        }
        else {
            uint256 assetsBefore = totalAssets() - msg.value;
            shareToMint = (msg.value * totalShares) / assetsBefore;
        }
        require (shareToMint > 0, ZeroValue());
        totalShares += shareToMint;
        sharesOf[msg.sender] += shareToMint;

        emit LiquidityProvided(msg.sender, msg.value, shareToMint);
    }

    /// @notice Withdraw liquidity
    function withdrawal(uint256 amount) external nonReentrant{
        require(amount > 0, ZeroValue());

        uint256 userShares = sharesOf[msg.sender];
        require(amount <= userShares, NoLiquidity());
        
        uint256 ethAmount = (amount * totalAssets()) / totalShares;
        require(ethAmount <= address(this).balance, NoLiquidity());        
        sharesOf[msg.sender] = userShares - amount;
        totalShares -= amount;

        (bool success,) = payable(msg.sender).call{value: ethAmount}("");
        require(success, TransferFailed());

        emit LiquidityRemoved(msg.sender, ethAmount, amount);
    }

    // === Purchase and resolve policy ===

    /// @notice Buy a coverage policy for a duration of seconds
    function buyPolicy(uint256 coverageAmount, uint256 duration) 
        external payable 
        whenNotPaused nonReentrant 
        returns (uint256 policyId) {
        
        require(coverageAmount > 0 , ZeroValue());
        require(duration > 0 && duration <= MAX_DURATION, DurationOutOfRange());
        
        uint256  freeLiquidity = availableLiquidity();
        uint256 maxCoverageAllowed = (freeLiquidity * maxCoverageBps) / BPS;
        require(coverageAmount <= maxCoverageAllowed, CoverageLimitExceeded());
        
        uint256 premiumRequired = (coverageAmount * premiumRateBps) / BPS;
        require(msg.value == premiumRequired, WrongPremium());

        uint256 protocolFee = (premiumRequired * protocolFeeBps) / BPS;

        (bool success,) = treasury.call{value: protocolFee}("");
        require(success, TransferFailed());

        policyId = policyNFT.mint(msg.sender);

        policies[policyId] = PolicyData({
            coverage: coverageAmount,
            premium: premiumRequired,
            start: block.timestamp,
            end: block.timestamp + duration,
            resolved: false
        }); 

        totalLockedCoverage += coverageAmount; 

        emit PolicyCreated(msg.sender, policyId, coverageAmount, premiumRequired);
    }
    
    function resolvePolicy(uint256 policyId) external onlyOwner nonReentrant{
        PolicyData storage policy = policies[policyId];
        require(policy.coverage > 0, PolicyNotFound());
        require(!policy.resolved, AlreadyResolved());

        policy.resolved = true;
        totalLockedCoverage -= policy.coverage;
        
        bool eventHappened = oracle.isEventHappened(policyId);

        if (eventHappened){
            address payoutReceiver = policyNFT.ownerOf(policyId);

            (bool success,) =  payable(payoutReceiver).call{value: policy.coverage}("");
            require (success, TransferFailed());
            emit PolicyResolved(policyId, eventHappened, policy.coverage);
        } else { 
            emit PolicyResolved(policyId, false, 0);
        }
    }
    
    /// @notice Release liquidity on an expired policy (if not resolved earlier)
    function expirePolicy(uint256 policyId) external onlyOwner nonReentrant {
        PolicyData storage policy = policies[policyId];
        require(policy.coverage > 0, PolicyNotFound());
        require(!policy.resolved, AlreadyResolved());
        require(block.timestamp > policy.end, PolicyNotExpired());

        policy.resolved = true;
        totalLockedCoverage -= policy.coverage;

        emit PolicyResolved(policyId, false, 0);
    }

    // === Assistant view ===
    function totalAssets() public view returns (uint256) {
        return address(this).balance;
    }
    function availableLiquidity() public view returns (uint256) {
        return (address(this).balance-totalLockedCoverage);
    }
    function sharedBalance(address user) external view returns (uint256) {
        return sharesOf[user];
    }
    function ethBalance(address user) external view returns (uint256) { 
        if(totalShares == 0) { return 0;}
        return sharesOf[user] * totalAssets() / totalShares; 
    }
    
    // === Control (owner) ===
    function updateParameters(uint256  newMaxCoverageBps, uint256 newPremiumRateBps, uint256 newProtocolFeeBps) external onlyOwner {
        require(newMaxCoverageBps > 0 && newMaxCoverageBps < BPS, InvalidBPS());
        require(newPremiumRateBps > 0 && newPremiumRateBps < BPS , InvalidBPS());
        require(newProtocolFeeBps > 0 && newProtocolFeeBps < BPS, InvalidBPS());
        
        maxCoverageBps = newMaxCoverageBps;
        premiumRateBps = newPremiumRateBps;
        protocolFeeBps = newProtocolFeeBps;

        emit ParametersUpdated(newMaxCoverageBps, newPremiumRateBps, newProtocolFeeBps);
    }
    function pause() external onlyOwner {
        _pause();
    }
    function unpause() external onlyOwner {
        _unpause();
    }
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), ZeroAddress());
        require(amount > 0, ZeroValue());
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, TransferFailed());
    }

}

