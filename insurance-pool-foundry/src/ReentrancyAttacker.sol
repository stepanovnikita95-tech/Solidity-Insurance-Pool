// test/InsurancePool.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "openzeppelin-contracts/contracts/token/ERC721/utils/ERC721Holder.sol";

import "../src/InsurancePool.sol";
import "../src/PolicyNFT.sol";
import "../src/Treasury.sol";
import "../src/Oracle.sol";

contract ReentrancyAttacker {
    InsurancePool public pool;

    constructor(address _pool) {
        pool = InsurancePool(_pool);
    } 
    function attackWithdr(uint256 amount) external payable {
        pool.withdrawal(amount);
    }
    receive() external payable {
        pool.withdrawal(1 ether);
    }
}
