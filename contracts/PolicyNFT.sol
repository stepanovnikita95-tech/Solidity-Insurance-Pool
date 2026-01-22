// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PolicyNFT is ERC721Enumerable, Ownable {
    uint256 private _nextTokenId = 1;
    address public insurancePool;

    error NotInsurancePool();
    error ZeroAddress();

    constructor(address initialOwner) 
        ERC721("Insurance Policy NFT", "PLC") Ownable(initialOwner) {}

    modifier onlyInsurancePool() {
        if (msg.sender != insurancePool) revert NotInsurancePool();
        _;
    }
    
    function setInsurancePool(address _pool) external onlyOwner {
        if (_pool == address(0)) revert ZeroAddress();
        insurancePool = _pool;
    }

    function mint(address to) external onlyInsurancePool returns (uint256 tokenId) {
        tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(to, tokenId);
    }

    function policiesOfOwner(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory ids = new uint256[](balance);

        for (uint256 i = 0; i < balance; i++) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
        return ids;
    }
}
