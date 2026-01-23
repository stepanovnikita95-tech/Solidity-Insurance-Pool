import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    InsurancePool, 
    PolicyNFT} from "@typechain-types/contracts";

    let user1: SignerWithAddress;
    let policyNFT: PolicyNFT;
    let pool: InsurancePool;

    describe("InsurancePool - Upgreates parametrs", function() {
        beforeEach( async function() {
            ({pool, policyNFT, user1} = await deployFixture());
        })
        it("New parametrs changed successfully", async function() {
            const newMaxCoverageBps = 2500;
            const newPremiumRateBps = 500;
            const newProtocolFeeBps = 700;

            const tx = await pool.updateParameters(newMaxCoverageBps, newPremiumRateBps, newProtocolFeeBps);
            
            expect(await pool.maxCoverageBps()).to.eq(newMaxCoverageBps);
            expect(await pool.premiumRateBps()).to.eq(newPremiumRateBps);
            expect(await pool.protocolFeeBps()).to.eq(newProtocolFeeBps);

            await expect(tx).to.not.be.reverted;
        })
        it("Emited event with new parametrs successfully", async function() {
            const newMaxCoverageBps = 2500;
            const newPremiumRateBps = 500;
            const newProtocolFeeBps = 700;

            const tx = await pool.updateParameters(newMaxCoverageBps, newPremiumRateBps, newProtocolFeeBps);

            await expect(tx).to.emit(pool, "ParametersUpdated")
                .withArgs(newMaxCoverageBps, newPremiumRateBps, newProtocolFeeBps);
        })
        it("Update does not affect existing policies", async function() {

            await policyNFT.setInsurancePool(pool.target);

            await pool.connect(user1).deposit({value: ethers.parseEther("100")});

            const coverage = ethers.parseEther("1");
            const duration = 7 * 24 * 60 * 60;
            const premium = coverage * (await pool.premiumRateBps()) / 10_000n;

            const tx = await pool.connect(user1).buyPolicy(coverage, duration, {value: premium});
            const receipt = await tx.wait(); 

            if (!receipt) throw new Error("Tx not mined");

            const event = receipt.logs
                .map(log => pool.interface.parseLog(log))
                .filter(Boolean).find(e => e!.name === "PolicyCreated");
            
            const policyId = event!.args.policyId;

            const policy = await pool.policies(policyId);

            const newMaxCoverageBps = 2500;
            const newPremiumRateBps = 500;
            const newProtocolFeeBps = 700;

            await pool.updateParameters(newMaxCoverageBps, newPremiumRateBps, newProtocolFeeBps);

            expect(policy.coverage).to.eq(coverage);
            expect(policy.premium).to.eq(premium);
            expect(policy.end).to.be.gt(policy.start);                    
            expect(policy.end - policy.start).to.eq(duration)
            expect(policy.resolved).to.eq(false);
        })
        it("New parametrs affect only for NEW policies", async function() {

            await policyNFT.setInsurancePool(pool.target);

            await pool.connect(user1).deposit({value: ethers.parseEther("100")});

            const coverage1 = ethers.parseEther("1");
            const duration1 = 7 * 24 * 60 * 60;
            const premium1 = coverage1 * (await pool.premiumRateBps()) / 10_000n;

            const tx1 = await pool.connect(user1).buyPolicy(coverage1, duration1, {value: premium1});
            const receipt1 = await tx1.wait(); 

            if (!receipt1) throw new Error("Tx not mined");

            const event1 = receipt1.logs
                .map(log => pool.interface.parseLog(log))
                .filter(Boolean).find(e => e!.name === "PolicyCreated");
            
            const policyId1 = event1!.args.policyId;

            const policy1 = await pool.policies(policyId1);   

            const lockedLiquidityBefore = await pool.totalLockedCoverage();
            
            const newMaxCoverageBps = 2500;
            const newPremiumRateBps = 500;
            const newProtocolFeeBps = 700;

            await pool.updateParameters(newMaxCoverageBps, newPremiumRateBps, newProtocolFeeBps);
            
            const coverage2 = ethers.parseEther("1");
            const duration2 = 7 * 24 * 60 * 60;
            const premium2 = coverage1 * (await pool.premiumRateBps()) / 10_000n;

            const tx2 = await pool.connect(user1).buyPolicy(coverage2, duration2, {value: premium2});
            const receipt2 = await tx2.wait(); 

            if (!receipt2) throw new Error("Tx not mined");

            const event2 = receipt2.logs
                .map(log => pool.interface.parseLog(log))
                .filter(Boolean).find(e => e!.name === "PolicyCreated");
            
            const policyId2 = event2!.args.policyId;

            const policy2 = await pool.policies(policyId2); 

            const lockedLiquidityAfter = await pool.totalLockedCoverage();

            expect(policy1.coverage).to.eq(coverage1);
            expect(policy1.premium).to.eq(premium1);
            expect(policy1.end).to.be.gt(policy1.start);                    
            expect(policy1.end - policy1.start).to.eq(duration1)
            expect(policy1.resolved).to.eq(false);

            expect(policy2.coverage).to.eq(coverage2);
            expect(policy2.premium).to.eq(premium2);
            expect(policy2.end).to.be.gt(policy2.start);                    
            expect(policy2.end - policy2.start).to.eq(duration2)
            expect(policy2.resolved).to.eq(false);

            expect(policy1.premium).to.not.eq(policy2.premium);

            expect(policy1.end - policy1.start).to.eq(duration1);
            expect(policy2.end - policy2.start).to.eq(duration2);

            expect(lockedLiquidityBefore).to.eq(policy1.coverage);
            expect(lockedLiquidityAfter).to.eq(policy1.coverage + policy2.coverage);
        })
        it("Reverts if not owner", async function() {
            await expect(pool.connect(user1).updateParameters(2500, 400, 300))
                .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
        })
        it("Reverts if one of the parametrs is zero", async function() {
            await expect(pool.updateParameters(0, 400, 300))
                .to.be.revertedWithCustomError(pool, "InvalidBPS");
            await expect(pool.updateParameters(2500, 0, 300))
                .to.be.revertedWithCustomError(pool, "InvalidBPS");
            await expect(pool.updateParameters(2550, 400, 0))
                .to.be.revertedWithCustomError(pool, "InvalidBPS");
        })
        it("Reverts if one of the parametrs is bigger than BPS", async function() {
            const bps = await pool.BPS();
            await expect(pool.updateParameters(bps + 1n, 400, 300))
                .to.be.revertedWithCustomError(pool, "InvalidBPS");
            await expect(pool.updateParameters(2500, bps + 1n, 300))
                .to.be.revertedWithCustomError(pool, "InvalidBPS");
            await expect(pool.updateParameters(2550, 400, bps + 1n))
                .to.be.revertedWithCustomError(pool, "InvalidBPS");
        })
    })
    