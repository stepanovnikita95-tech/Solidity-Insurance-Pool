// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPool.sol";

contract RejectTransfer is Ownable {
    
    IPool public pool;
    bool public acceptETH = true;
    
    constructor(address initialOwner, address _pool) 
        Ownable(initialOwner) {
            pool = IPool(_pool);
        }
    uint256 public constant BPS = 10_000; // BASIS_POINTS

    event PolicyOrdered(uint256 policyId, uint256 coverage, uint256 duration);

    function depositFor() external payable{
        require(msg.value > 0);
        (bool success,) = address(pool).call{value: msg.value}(abi.encodeWithSignature("deposit()"));
        require(success, "Failed");
    }
    function withdrawFor(uint256 amount) external {
        require(amount > 0);
        (bool success, ) = address(pool).call(abi.encodeWithSignature("withdraw(uint256)", amount));
        require(success, "Withdrawal from pool failed");
    }
    function buyPolicyFor(uint256 coverageAmount, uint256 duration) external payable returns(uint256 policyId){
        require(coverageAmount > 0);
        require(duration > 0);
        require(msg.value > 0, "Zero Value");

        policyId = pool.buyPolicy{value: msg.value}(coverageAmount, duration);
        emit PolicyOrdered(policyId, coverageAmount, duration);
    }
    
    function acceptFalse() external onlyOwner returns (bool) {
        return acceptETH = false;
    }
    receive() external payable {
        require(acceptETH, "Not accept ETH!");
    } 
    fallback() external payable {
        require(acceptETH, "Not accept ETH!");
    }
}