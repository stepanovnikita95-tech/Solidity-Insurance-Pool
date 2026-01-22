// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IOracle {
    function isEventHappened(uint256 policyId) external view returns(bool);
}