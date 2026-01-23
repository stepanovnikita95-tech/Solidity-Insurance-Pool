import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { InsurancePool } from "@typechain-types/contracts";

    describe("InsurancePool - Emergency withdraw", function() {
        let pool:InsurancePool;
        let user1: SignerWithAddress;
        beforeEach( async function() {
             ({pool, user1} = await deployFixture());

            await pool.deposit({value: ethers.parseEther("100")});
        })
        describe("Emergency withdraw - success cases", function() {
            it("Owner can withdraw to target address", async function() {
                const initialAmount = ethers.parseEther("25");
                
                await expect(pool.emergencyWithdraw(user1.address, initialAmount))
                    .to.changeEtherBalances([user1, pool], [initialAmount, -initialAmount]);
            })
            it("Withdraw partial amount", async function() {
                const initialAmount = ethers.parseEther("25");
                
                await pool.emergencyWithdraw(user1.address, initialAmount);
                expect(await ethers.provider.getBalance(await pool.getAddress()))
                    .to.eq(ethers.parseEther("75"));
            })
            it("Withdraw full balance", async function() {
                const totalBalance = await ethers.provider.getBalance(await pool.getAddress());
                const tx = await pool.emergencyWithdraw(user1.address, totalBalance);
                
                await expect(tx).to.be.not.reverted;
                expect(await ethers.provider.getBalance(await pool.getAddress())).to.eq(0);
            })
            it("Withdraw is available when pool is paused", async function() {
                await pool.pause();
                const tx = await pool.emergencyWithdraw(user1.address, ethers.parseEther("34"));
                
                await expect(tx).to.be.not.reverted;
            })
        })
        describe("Emergency withdraw - reverts cases", function() {
            it("Reverts if called not owner", async function() {
                await expect(pool.connect(user1).emergencyWithdraw(user1.address, ethers.parseEther("30")))
                    .to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount"); 
            })
            it("Reverts if withdraw amount is more than pool balance", async function() {
                const totalBalance = await ethers.provider.getBalance(await pool.getAddress());
                await expect(pool.emergencyWithdraw(user1.address, totalBalance + 1n))
                    .to.be.revertedWithCustomError(pool, "TransferFailed");
            })
        })
    })
    
    


