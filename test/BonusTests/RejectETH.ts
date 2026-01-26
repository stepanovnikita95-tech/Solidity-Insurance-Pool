import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { InsurancePool, PolicyNFT } from "@typechain-types/contracts";
import { RejectTransfer } from "@typechain-types/contracts/RejectTransf.sol"
import { SimpleOracle } from "typechain-types";

    describe("InsurancePool - Reject ETH", function(){
        let pool:InsurancePool;
        let policyNFT:PolicyNFT;
        let owner:SignerWithAddress;
        let user1:SignerWithAddress;
        let rejectETH: RejectTransfer;
        let rejectTreasury: RejectTransfer;
        let oracle: SimpleOracle;
        beforeEach(async function() {
            const fixture = await deployFixture()
            pool = fixture.pool;
            policyNFT = fixture.policyNFT;
            oracle = fixture.oracle;
            owner = fixture.owner;
            user1 = fixture.user1;
            rejectTreasury = fixture.rejectTreausury;
            
            const rejectETHFactory = await ethers.getContractFactory("RejectTransfer", owner);
            rejectETH = await rejectETHFactory.deploy(owner.address, await pool.getAddress());
            await rejectETH.waitForDeployment();
        })
        it("Reverts Withdraw() when acceptETH is false", async function() {
            const depAmount = ethers.parseEther("2");
            const tx = await rejectETH.depositFor({value:depAmount});

            await rejectETH.acceptFalse();

            const withdrawAmount = ethers.parseEther("1");
            await expect(
                rejectETH.withdrawFor(withdrawAmount))
                    .to.be.revertedWith("Withdrawal from pool failed");
        })
        it("Reverts during buy policy when acceptETH is false", async function() {
            const coverage = ethers.parseEther("1");
            const duration = 7 * 24 * 60 * 60;
            const premium = coverage * (await pool.premiumRateBps()) / 10_000n;

            await rejectETH.acceptFalse();

            await expect(rejectETH.buyPolicyFor(coverage, duration, {value: premium}))
                .to.be.revertedWith("Not accept ETH!");
        })
        it("Reverts treasury", async function() {
            const coverage = ethers.parseEther("1");
            const duration = 7 * 24 * 60 * 60;
            const premium = coverage * (await pool.premiumRateBps()) / 10_000n;

            await rejectTreasury.acceptFalse();

            await expect(pool.connect(user1).buyPolicy(coverage, duration, {value: premium}))
                .to.be.revertedWithCustomError(pool,"TransferFailed");
        })
        it("Reverts when emergency withdraw to RejectETH adress", async function() {
            const emergencyAmount = ethers.parseEther("2");
            
            await rejectETH.acceptFalse();

            await expect(pool.emergencyWithdraw(await rejectETH.getAddress(), emergencyAmount))
                .to.be.revertedWithCustomError(pool, "TransferFailed");
        })
        it("Reverts for resolve policy if owner NFT is rejectETH", async function() {
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

            expect(policyId).to.be.gt(0);

            await policyNFT.connect(user1).transferFrom(user1.address, rejectETH.target, policyId);
            expect(await policyNFT.ownerOf(policyId)).to.be.eq(rejectETH.target);

            await rejectETH.acceptFalse();

            await oracle.setEvent(policyId, true);

            await expect(pool.connect(owner).resolvePolicy(policyId))
                .to.be.revertedWithCustomError(pool, "TransferFailed");
        })
    })