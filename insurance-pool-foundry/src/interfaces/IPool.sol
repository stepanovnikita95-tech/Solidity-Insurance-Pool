// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IPool {
    function deposit() external payable;
    function withdrawal(uint256 amount) external;
    function buyPolicy(uint256 coverageAmount, uint256 duration) external payable returns(uint256 policyId);
    function premiumRateBps() external view returns(uint256);
}
