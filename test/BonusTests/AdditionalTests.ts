import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { InsurancePool, PolicyNFT } from "@typechain-types/contracts";
import { SimpleOracle } from "typechain-types";

describe("Additional tests", function() {
    let pool:InsurancePool;
    let policyNFT:PolicyNFT;
    let oracle:SimpleOracle;
    let owner:SignerWithAddress;
    let user1:SignerWithAddress;
    let user2:SignerWithAddress;
    
    beforeEach(async function() {
        const fixture = await deployFixture();
        pool = fixture.pool;
        policyNFT = fixture.policyNFT;
        oracle = fixture.oracle;
        owner = fixture.owner;
        user1 = fixture.user1;
        user2 = fixture.user2;
    });
    it("Rounding down in deposit does not allow infinite small deposits", async function() {
        await pool.connect(user1).deposit({value: ethers.parseEther("100")});

        const tinyAmount = 1n;
        await expect(pool.connect(user2).deposit({value: tinyAmount})).to.be.revertedWithCustomError(pool, "AmountNotEnough");
    })
    it("Premium increases share value for existing LPs", async function() {
        await pool.connect(user1).deposit({value: ethers.parseEther("100")});

        const ethBalanceBefore = await pool.ethBalance(user1.address);
        
        const coverage = ethers.parseEther("5");
        const duration = 7 * 24 * 60 * 60;
        const premium = coverage * (await pool.premiumRateBps()) / (await pool.BPS());

        await policyNFT.setInsurancePool(pool.target);
        await pool.connect(user2).buyPolicy(coverage, duration, {value: premium});

        const ethBalanceAfter = await pool.ethBalance(user1.address);

        expect(ethBalanceAfter - ethBalanceBefore).to.be.gt(0);
    })
    it("Multiply policies on same owner correctly increase totalLockedCoverage", async function() {
        await pool.connect(user1).deposit({value: ethers.parseEther("100")});
        await policyNFT.setInsurancePool(pool.target);

        const coverage1 = ethers.parseEther("5");
        const duration1 = 7 * 24 * 60 * 60;
        const premium1 = coverage1 * (await pool.premiumRateBps()) / (await pool.BPS());
        await pool.connect(user1).buyPolicy(coverage1, duration1, {value: premium1});
        
        const coverage2 = ethers.parseEther("5");
        const duration2 = 7 * 24 * 60 * 60;
        const premium2 = coverage2 * (await pool.premiumRateBps()) / (await pool.BPS());
        await pool.connect(user2).buyPolicy(coverage2, duration2, {value: premium2});

        const locked = await pool.totalLockedCoverage();
        expect(locked).to.eq(coverage1 + coverage2);

        const available = await pool.availableLiquidity();
        expect(available).to.be.closeTo((ethers.parseEther("100") + premium1 + premium2 - (coverage1 + coverage2)), ethers.parseEther("0.1"));
    })
    it("Payout in resolvePolicy() decrease pool balance", async function() {
        await pool.connect(user1).deposit({value: ethers.parseEther("100")});
        await policyNFT.setInsurancePool(pool.target);

        const coverage1 = ethers.parseEther("5");
        const duration1 = 7 * 24 * 60 * 60;
        const premium1 = coverage1 * (await pool.premiumRateBps()) / (await pool.BPS());
        const tx = await pool.connect(user1).buyPolicy(coverage1, duration1, {value: premium1});
        const receipt = await tx.wait();

        if (!receipt) throw new Error("Tx not mined");

            const event = receipt.logs
                .map(log => pool.interface.parseLog(log))
                .filter(Boolean).find(e => e!.name === "PolicyCreated");
            
            const policyId = event!.args.policyId;
        const poolBalanceBefore = await ethers.provider.getBalance(pool.target);

        await oracle.setEvent(policyId, true);
        await pool.resolvePolicy(policyId);

        const poolBalanceAfter = await ethers.provider.getBalance(pool.target);
        expect(poolBalanceAfter).to.be.eq(poolBalanceBefore - coverage1);
    })
})