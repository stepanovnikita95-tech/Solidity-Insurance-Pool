// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "openzeppelin-contracts/contracts/token/ERC721/utils/ERC721Holder.sol";
import "../src/InsurancePool.sol";
import "../src/PolicyNFT.sol";
import "../src/Treasury.sol";
import "../src/Oracle.sol";
import "../src/ReentrancyAttacker.sol";

contract InsurancePoolTest is Test, ERC721Holder {
    InsurancePool pool;
    PolicyNFT nft;
    Treasury treasury;
    SimpleOracle oracle;
    ReentrancyAttacker attacker;

    address owner = address(this);
    address user1 = makeAddr("user1");
    address user2 = makeAddr("user2");
    address attackerAddr;

    event LiquidityProvided(address indexed provider, uint256 ethAmount, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 shares);

 
    function setUp() public {
        nft = new PolicyNFT(owner);
        treasury = new Treasury(owner); 
        oracle = new SimpleOracle(owner);
        attacker = new ReentrancyAttacker(user1);

        pool = new InsurancePool(
            owner,
            address(nft),
            address(oracle),
            address(treasury),
            2000,
            300,
            500
        );
        nft.setInsurancePool(address(pool));

        vm.deal(user1, 1000 ether);
        vm.deal(user2, 1000 ether);

        attacker = new ReentrancyAttacker(address(pool));
        attackerAddr = address(attacker);
        vm.deal(attackerAddr, 100 ether);
    }

    function test_Deposit() public {
        vm.startPrank(user1);
        vm.expectEmit(true, true, true, false);
        emit LiquidityProvided(address(user1), 50 ether, 50 ether );
        pool.deposit{value: 50 ether}();
        uint256 share1 = pool.sharesOf(user1);
        assertEq(share1, 50 ether);
        vm.stopPrank();
        
        vm.startPrank(user2);
        vm.expectEmit(true, true, true, false);
        emit LiquidityProvided(address(user2), 20 ether, 20 ether );
        pool.deposit{value: 20 ether}();
        uint256 share2 = pool.sharesOf(user2);
        assertEq(share2, 20 ether);
        vm.stopPrank();
    }
    function testFuzz_DepositMultiple(uint256 amount1, uint256 amount2) public {
        vm.assume(amount1 >= 0.001 ether && amount1 < 100 ether);
        vm.assume(amount2 >= 0.001 ether && amount2 < 100 ether);

        vm.prank(user1);
        pool.deposit{value: amount1}();

        uint256 shares1 = pool.sharesOf(user1);

        vm.prank(user1);
        pool.deposit{value: amount2}();

        uint256 shares2 = pool.sharesOf(user1);
        assertEq(shares2 - shares1, amount2);
    }

    function test_Deposit2Users() public {
        uint256 dep1 = 50 ether;
        uint256 dep2 = 30 ether;
        vm.startPrank(user1);
        pool.deposit{value: dep1}();
        uint256 share1 = pool.sharesOf(user1);
        vm.stopPrank();
        vm.startPrank(user2);
        pool.deposit{value: dep2}();
        uint256 share2 = pool.sharesOf(user2);

        assertEq(share1, dep1);
        assertEq(share2, dep2);
        assertEq(pool.totalAssets(), dep1 + dep2);
        vm.stopPrank();
    }

    function test_Withdrawal() public {
        uint256 depAmount = 50 ether;
        uint256 wthdrAmount = 20 ether;
        
        vm.startPrank(user1);
        pool.deposit{value: depAmount}();
        
        vm.expectEmit(true, true, true, false);
        emit LiquidityRemoved(address(user1), 30 ether, 20 ether);
        pool.withdrawal(wthdrAmount);
        assertEq((depAmount - wthdrAmount), pool.sharesOf(user1));
        vm.stopPrank();
    }
    function test_Fuzzing_Withdrawal(uint256 amount) public {
        uint256 depAmount = 70 ether;
        vm.assume(amount > 0 && amount <= 70 ether);
        vm.startPrank(user1);
        pool.deposit{value: depAmount}();
        pool.withdrawal(amount);
        assertEq(depAmount - amount, pool.sharesOf(user1));
        vm.stopPrank();
    } 

    function test_Revert_DepositAmountZero() public {
        vm.startPrank(user1);
        vm.expectRevert(InsurancePool.ZeroValue.selector);
        pool.deposit{value: 0}();
        vm.stopPrank();
    }
    function test_Revert_DepositAmountNotEnough() public {
        vm.startPrank(user1);
        vm.expectRevert(InsurancePool.AmountNotEnough.selector);
        pool.deposit{value: 0.00001 ether}();
        vm.stopPrank();
    }
    function test_Revert_WithdrawAmountZero() public {
        vm.startPrank(user1);
        pool.deposit{value: 50 ether}();
        vm.expectRevert(InsurancePool.ZeroValue.selector);
        pool.withdrawal(0);
        vm.stopPrank();
    }

    function test_Revert_WithdrawAmountMoreThenDeposit() public {
        vm.startPrank(user1);
        pool.deposit{value: 50 ether}();
        uint256 share1 = pool.sharesOf(user1);
        vm.expectRevert(InsurancePool.NoLiquidity.selector);
        pool.withdrawal(share1 + 0.0001 ether);
    }

    function testFuzz_BuyPolicyPremium(uint256 coverage, uint256 duration) public {
        coverage = bound(coverage, 1 ether, 100 ether);
        duration = bound(duration, 1 days, 30 days);
        
        uint256 premium = (coverage * pool.premiumRateBps()) / pool.BPS();
        
        vm.assume(premium > 0);
        
        vm.startPrank(user1);
        pool.deposit{value: 1000 ether}();
        vm.stopPrank();

        vm.startPrank(user2);
        vm.expectRevert(InsurancePool.WrongPremium.selector);
        pool.buyPolicy{value: premium - 1 }(coverage, duration);
        
        pool.buyPolicy{value: premium}(coverage, duration);
        vm.stopPrank();
    }
    function testFuzz_Revert_BuyPolicy_ZeroPremium() public {
        vm.startPrank(user1);
        pool.deposit{value: 1000 ether}();
        vm.stopPrank();

        vm.startPrank(user2);
        vm.expectRevert(InsurancePool.TransferFailed.selector);
        pool.buyPolicy{value: 0}(1 wei, 1 days);
    }

    function invariant_TotalAssets_AlwaysGTE_Locked() public view {
        assertGe(pool.totalAssets(), pool.totalLockedCoverage());
    }
    function invariant_SharesSupplyMatchesTotalAssets() public view {
        uint256 totalShares = pool.totalShares();
        if(totalShares == 0 ) return;
        
        uint256 expectedAssets = (totalShares * pool.totalAssets()) / pool.totalShares();

        assertApproxEqAbs(pool.totalAssets(), expectedAssets, 1e9);
    }
    function test_Reentrancy_Withdrawal() public {
        vm.prank(attackerAddr);
        pool.deposit{value: 10 ether}();
        
        uint256 attackerShares = pool.sharesOf(attackerAddr);
        assertGt(attackerShares, 0);

        vm.prank(attackerAddr);
        vm.expectRevert(InsurancePool.TransferFailed.selector);
        attacker.attackWithdr(attackerShares);

        uint256 balanceAfter = attackerAddr.balance;
        assertEq(balanceAfter, 100 ether - 10 ether);
    }
    function test_Warp_PolicyExpired_NoPayout() public {
        vm.startPrank(user1);
        pool.deposit{value: 500 ether}();
        vm.stopPrank();
        uint256 coverage = 1 ether;
        uint256 duration = 15 days;

        uint256 premium = (coverage * pool.premiumRateBps()) / pool.BPS();

        vm.startPrank(user2);
        pool.buyPolicy{value: premium}(coverage, duration);
        uint256[] memory policiesID = nft.policiesOfOwner(user2);

        vm.warp(block.timestamp + duration + 1 days);

        vm.startPrank(owner);
        for (uint256 i = 0; i < policiesID.length; ++i) {
            pool.resolvePolicy(policiesID[i]);
        }
        vm.stopPrank();

        assertEq(user2.balance, 1000 ether - premium);
    }
    function testFuzz_PolicyExpired_NoPayouts(uint256 coverage, uint256 duration) public {
        coverage = bound(coverage, 1 ether, 100 ether);
        duration = bound(duration, 1 days, 30 days);

        vm.startPrank(user1);
        pool.deposit{value: 1000 ether}();
        vm.stopPrank();
        
        uint256 premium = (coverage * pool.premiumRateBps()) / pool.BPS();
        
        vm.startPrank(user2);
        pool.buyPolicy{value: premium}(coverage, duration);
        uint256[] memory policiesID = nft.policiesOfOwner(user2);
        
        vm.warp(block.timestamp + duration + 1 days);
        vm.startPrank(owner);
        for (uint256 i = 0; i < policiesID.length; ++i) {
            pool.resolvePolicy(policiesID[i]);
        }
        vm.stopPrank();

        assertEq(user2.balance, 1000 ether - premium);
    }

    function test_Oracle_Payout_onlyOwner(uint256 duration) public {
        duration = bound(duration, 1 days, 30 days);
        
        vm.startPrank(user1);
        pool.deposit{value: 500 ether}();
        vm.stopPrank();
        uint256 coverage = 1 ether;

        uint256 premium = (coverage * pool.premiumRateBps()) / pool.BPS();

        vm.startPrank(user2);
        pool.buyPolicy{value: premium}(coverage, duration);
        uint256[] memory policiesID = nft.policiesOfOwner(user2);
        vm.expectRevert();
        for (uint256 i = 0; i < policiesID.length; ++i){
            pool.resolvePolicy(policiesID[i]);
        }
        vm.stopPrank();

        vm.startPrank(owner);
        for (uint256 i = 0; i < policiesID.length; ++i){
            oracle.setEvent(policiesID[i], true);
            pool.resolvePolicy(policiesID[i]);
        }
        assertEq(user2.balance, 1000 ether - premium + coverage);
    }

}
