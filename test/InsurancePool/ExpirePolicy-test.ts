import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    InsurancePool, 
    PolicyNFT } from "@typechain-types/contracts";

    let user1: SignerWithAddress;
    let policyNFT: PolicyNFT;
    let pool: InsurancePool;

    describe("InsurancePool - Expire Policy", function() {
        let coverage: bigint;
        let policyId: bigint;
        beforeEach( async function() {
            ({pool,policyNFT, user1} = await deployFixture());

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
        describe("Expire Policy - successfull cases", function() {
            it("Successfully resolved policy afer expired",async function() {
                const liquidityBeforeLocked = await pool.totalLockedCoverage();
                
                await time.increase(8 * 24 * 60 * 60);
                await pool.expirePolicy(policyId);

                const policy = await pool.policies(policyId);
                const liquidityAfterLocked = await pool.totalLockedCoverage();
                
                expect(liquidityAfterLocked).to.eq(liquidityBeforeLocked - coverage);
                expect(policy.resolved).to.eq(true);
                expect(policy.coverage).to.be.gt(0);
            })
            it("Emit PolicyResolved after expired", async function() {
                await time.increase(8 * 24 * 60 * 60);
                const tx = await pool.expirePolicy(policyId);

                await expect(tx).to.emit(pool, "PolicyResolved").withArgs(policyId, false, 0)
            })
            it("Locked liquidity decrease on expiration", async function() {
                const totalLockedCoverageBefore = await pool.totalLockedCoverage();
                expect(totalLockedCoverageBefore).to.eq(coverage);
                await time.increase(8 * 24 * 60 * 60);
                await pool.expirePolicy(policyId);
                const totalLockedCoverageAfter = await pool.totalLockedCoverage();
                expect(totalLockedCoverageAfter).to.eq(0);
            })
            it("Does NOT transfer ETH on expiration", async function() {
                const balancePolicyOwnerBefore = await ethers.provider.getBalance(await policyNFT.ownerOf(policyId));
                await time.increase(8 * 24 * 60 * 60);
                await pool.expirePolicy(policyId);
                const balancePolicyOwnerAfter = await ethers.provider.getBalance(await policyNFT.ownerOf(policyId));
                expect(balancePolicyOwnerAfter).to.eq(balancePolicyOwnerBefore);
            })
        })
        describe("Expire Policy - Revert cases", function() {
            it("Revert if policy does not found", async function() {
                await expect(pool.expirePolicy(999)).to.be.revertedWithCustomError(pool, "PolicyNotFound");
            })
            it("Revert if policy already resolved", async function() {
                await time.increase(8 * 24 * 60 * 60);
                await pool.expirePolicy(policyId);
                await expect(pool.expirePolicy(policyId)).to.be.revertedWithCustomError(pool, "AlreadyResolved");
            })
            it("Revert if policy is not expired yet", async function() {
                await expect(pool.expirePolicy(policyId)).to.be.revertedWithCustomError(pool, "PolicyNotExpired")
            })
            it("Revert if caller is not owner", async function() {
                await expect(pool.connect(user1).expirePolicy(policyId)).to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount")
            })
        })
})

    