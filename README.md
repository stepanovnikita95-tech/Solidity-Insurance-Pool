# Protection Pool

A simple insurance pool built on Solidity with NFT-based policies and share-based accounting for liquidity providers (LPs).

[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.30-black?logo=solidity)](https://docs.soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-orange)](https://hardhat.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests & Coverage](https://github.com/stepanovnikita95-tech/Solidity-Insurance-Pool/actions/workflows/test.yml/badge.svg)](https://github.com/stepanovnikita95-tech/Solidity-Insurance-Pool/actions)
[![Coverage](https://codecov.io/gh/stepanovnikita95-tech/Solidity-Insurance-Pool/branch/main/graph/badge.svg)](https://codecov.io/gh/stepanovnikita95-tech/Solidity-Insurance-Pool)


## What is this?

A prototype decentralized insurance pool where:

- Liquidity providers deposit ETH and earn a share of collected premiums  
- Users buy coverage by minting an NFT policy  
- The contract owner (via a trusted oracle) decides whether an insured event occurred  
- Premiums (minus protocol fee) increase the value of LP shares

**Project goal**: Demonstrate core mechanics of an insurance pool with NFT policies and fair profit distribution for LPs.

## Core Contracts

- **InsurancePool**  
  Main logic: deposits, withdrawals, buying policies, resolving claims, emergency controls.

- **PolicyNFT**  
  ERC-721 token for insurance policies. Minted only by the pool. NFT ownership determines payout receiver.

- **Treasury**  
  Isolated contract for protocol fees. Receives ETH via `receive()` and allows owner-only withdrawals.

- **SimpleOracle**  
  Mock trusted oracle. Returns boolean: did the insured event happen?

## Design Choices

- Internal share accounting (no ERC-20 LP token)  
  → Simpler code, lower gas, easier to audit

- Trusted (centralized) oracle  
  → Focus on pool mechanics rather than oracle decentralization

- Custom errors  
  → Gas-efficient and easy to test

- ReentrancyGuard + Pausable  
  → Protection against reentrancy and emergency pause

- Mian tests in one file   
  → >90% coverage of success paths, reverts, and edge cases
  → scripts for running tests separately
  → Reverts check tests for low-level calls

 ## Deployment

Network: Sepolia

→ PolicyNFT deployed to: 0x231dC00765985aB852D5d623F901bC9BF9eCb4A6
Contract verification: https://repo.sourcify.dev/contracts/full_match/11155111/0x231dC00765985aB852D5d623F901bC9BF9eCb4A6/

Etherscan: https://sepolia.etherscan.io/address/0x231dC00765985aB852D5d623F901bC9BF9eCb4A6#code

→ Treasury deployed to: 0xC28c9408fE94ea98cD4976Fa04382C480A5d272E
Contract verification: https://repo.sourcify.dev/contracts/full_match/11155111/0xC28c9408fE94ea98cD4976Fa04382C480A5d272E/

Etherscan: https://sepolia.etherscan.io/address/0xC28c9408fE94ea98cD4976Fa04382C480A5d272E#code

→ Oracle deployed to: 0x5EaF2673a0124e39b65eFf406C7E83aB155a09C8
Contract verification: https://repo.sourcify.dev/contracts/full_match/11155111/0x5EaF2673a0124e39b65eFf406C7E83aB155a09C8/

Etherscan: https://sepolia.etherscan.io/address/0x5EaF2673a0124e39b65eFf406C7E83aB155a09C8#code

→ InsurancePool deployed to: 0xCd3F58808a942247fe8848EBcf4f59fa29e3a9b5
Contract verification: https://repo.sourcify.dev/contracts/full_match/11155111/0xCd3F58808a942247fe8848EBcf4f59fa29e3a9b5/

Etherscan: https://sepolia.etherscan.io/address/0xCd3F58808a942247fe8848EBcf4f59fa29e3a9b5#code

→ PolicyNFT linked to InsurancePool

## Installation & Testing

```bash
git clone https://github.com/stepanovnikita95-tech/Solidity-Insurance-Pool
cd protection-pool
npm install
npx hardhat test
npm run test:deposit
npm run test:withdraw
npm run test:emergency
npm run test:buy
npm run test:resolve
npm run test:expire
npm run test:upgreat
npm run test:treasury