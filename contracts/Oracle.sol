// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleOracle is Ownable {
    
    mapping(uint256 => bool) public eventHappened;

    event EventSet(uint256 indexed policyId, bool happened);

    constructor(address initialOwner) Ownable(initialOwner){}

    function setEvent(uint256 policyId, bool happened) external onlyOwner {
        eventHappened[policyId] = happened;
        emit EventSet(policyId, happened);
    }
    
    function isEventHappened(uint256 policyId) external view returns(bool){
        return eventHappened[policyId];
    }
}