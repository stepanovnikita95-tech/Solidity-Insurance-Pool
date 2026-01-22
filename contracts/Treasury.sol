// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Treasury is Ownable {

    error ZeroAmount();
    error InsufficientFunds();
    error Failed();

    event FundsReceived(address indexed from, uint256 amount);
    event FundsWithdrawn(address to, uint256 amount);

    constructor (address initialOwner) Ownable(initialOwner){}
    
    receive() external payable {
        require(msg.value > 0, ZeroAmount());
        emit FundsReceived(msg.sender, msg.value);
    }

    function withdrawal(address to, uint256 amount) external onlyOwner {
        require(amount > 0, ZeroAmount());
        require(address(this).balance > 0, InsufficientFunds());

        (bool success, ) = payable(to).call{value: amount}("");
        require(success, Failed());

        emit FundsWithdrawn(to, amount);
    }
    
    function balance() external view returns(uint256){
        return address(this).balance;
    }
}