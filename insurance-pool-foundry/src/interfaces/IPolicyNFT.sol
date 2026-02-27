// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IPolicyNFT {
    function mint(address to) external returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}
