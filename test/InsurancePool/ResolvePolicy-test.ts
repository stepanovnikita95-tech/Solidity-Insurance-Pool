import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SimpleOracle } from "@typechain-types/contracts/Oracle.sol";
import {
    InsurancePool, 
    PolicyNFT } from "@typechain-types/contracts";

    let user1: SignerWithAddress;
    let policyNFT: PolicyNFT;
    let oracle: SimpleOracle;
    let pool: InsurancePool;
    
    describe("InsurancePool - Resolve Policy", function() {
        let coverage: bigint;
        let policyId: bigint;
        beforeEach( async function() {
            ({pool,policyNFT, oracle, user1} = await deployFixture());

            await policyNFT.setInsurancePool(pool.target);

            await pool.connect(user1).deposit({value: ethers.parseEther("100")});

            coverage = ethers.parseEther("1");
            const duration = 7 * 24 * 60 * 60;
            const premium = coverage * (await pool.premiumRateBps()) / 10_000n;

            const tx = await pool.connect(user1).buyPolicy(coverage, duration, {value: premium});
            const receipt = await tx.wait(); 

            if (!receipt) throw new Error("Tx not mined");

            const event = receipt.logs
                .map(log => pool.interface.parseLog(log))
                .filter(Boolean).find(e => e!.name === "PolicyCreated");
            
            policyId = event!.args.policyId;
        })
        describe("Policy Resolve - success cases", function() {
            it("Successfully resolves policy when oracle returns false", async function() {
                
                const liquidityBeforeLocked = await pool.totalLockedCoverage();
                const balanceUserBefore = await ethers.provider.getBalance(user1.address);

                await pool.resolvePolicy(policyId);
                const policy = await pool.policies(policyId);
                const liquidityAfterLocked = await pool.totalLockedCoverage();
                const balanceUserAfter = await ethers.provider.getBalance(user1.address);

                expect(policy.resolved).to.eq(true);
                expect(policy.coverage).to.be.gt(0);
                expect(liquidityAfterLocked).to.eq(liquidityBeforeLocked - coverage);
                expect(balanceUserAfter).to.eq(balanceUserBefore);
            })
            it("Successfully resolves policy when oracle returns true",async function() {
                const liquidityBeforeLocked = await pool.totalLockedCoverage();
                const balanceUserBefore = await ethers.provider.getBalance(await policyNFT.ownerOf(policyId));

                await oracle.setEvent(policyId, true);
                await pool.resolvePolicy(policyId);
                const policy = await pool.policies(policyId);
                const liquidityAfterLocked = await pool.totalLockedCoverage();
                const balanceUserAfter = await ethers.provider.getBalance(await policyNFT.ownerOf(policyId));

                expect(policy.resolved).to.eq(true);
                expect(policy.coverage).to.be.gt(0);
                expect(liquidityAfterLocked).to.eq(liquidityBeforeLocked - coverage);
                expect(balanceUserAfter - balanceUserBefore).to.eq(coverage);
            })
            it("Emit PolicyResolved() payout case", async function() {
                await oracle.setEvent(policyId, true);
                const tx = await pool.resolvePolicy(policyId);
                await expect(tx).to.be.emit(pool,"PolicyResolved").withArgs(policyId, true, coverage);
            })   
            it("Emit PolicyResolved() no payout case",async function() {
                const tx = await pool.resolvePolicy(policyId);
                await expect(tx).to.be.emit(pool,"PolicyResolved").withArgs(policyId, false, 0);
            })    
            it("Marks as policy resolved", async function() {
                const tx = await pool.resolvePolicy(policyId);
                const policy = await pool.policies(policyId);
                expect(policy.resolved).to.eq(true);
            })     
            it("Uses Oracle to set result of the event", async function() {
                await oracle.setEvent(policyId, true);
                expect(await oracle.isEventHappened(policyId)).to.eq(true);
                await pool.resolvePolicy(policyId);
                const policy = await pool.policies(policyId);
                expect(policy.resolved).to.eq(true);
            })    
        })
        describe("Policy Resolve - Revert cases", function() {
            it("Reverts if resolve not owner", async function() {
                await expect(pool.connect(user1).resolvePolicy(policyId))
                    .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
            })
            it("Reverts if policy does not exist", async function() {
                await expect(pool.resolvePolicy(12))
                    .to.be.revertedWithCustomError(pool, "PolicyNotFound");
            })
            it("Reverts if policy alredy resolved (double resolve attempt)", async function() {
                await pool.resolvePolicy(policyId);
                await expect(pool.resolvePolicy(policyId))
                    .to.be.revertedWithCustomError(pool, "AlreadyResolved")
            })
        })
    })

