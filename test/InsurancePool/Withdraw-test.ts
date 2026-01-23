import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { InsurancePool } from "@typechain-types/contracts";

    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let pool: InsurancePool;
    
    describe("InsurancePool - Withdraw", function() {
        beforeEach(async function() {
            ({pool, user1, user2} = await deployFixture());
            const deposit1 = ethers.parseEther("5");
            const deposit2 = ethers.parseEther("4");            
            const tx1 = await pool.connect(user1).deposit({value: deposit1});
            tx1.wait(); 
            const tx2 = await pool.connect(user2).deposit({value: deposit2});
            tx2.wait();
            const tx3 = await pool.connect(user2).deposit({value: deposit1});
            tx3.wait();
        })
        describe("Withdraw - Success cases", function() {
            it("Withdraw shares less than owned", async function() {
                const sharesToWithdraw = ethers.parseEther("0.5"); 
                await expect(pool.connect(user1).withdrawal(sharesToWithdraw)).to.be.not.reverted;
            })
            it("Decrease total shares to correct amount", async function() {
                const initialTotalShares = await pool.totalShares();
                const withdrawAmout = ethers.parseEther("1");
                await pool.connect(user1).withdrawal(withdrawAmout);
                const finalTotalShare = await pool.totalShares();
                expect(finalTotalShare).to.eq(initialTotalShares - withdrawAmout)
            })
            it("Decrease sharesOf(user1)", async function() {
                const before = await pool.sharesOf(user1.address);
                await pool.connect(user1).withdrawal(ethers.parseEther("1"));
                const after = await pool.sharesOf(user1.address);

                expect(after).to.eq(before - ethers.parseEther("1"));
            })
            it("Decrease sharesOf(user2)", async function() {
                const sharesBeforeWithdraw = await pool.sharesOf(user2.address);
                const amountToBurn = (ethers.parseEther("4"));
                
                await pool.connect(user2).withdrawal(amountToBurn);
                
                expect(await pool.sharesOf(user2.address)).to.eq(sharesBeforeWithdraw - amountToBurn);
            })
            it("Actually transfer ETH from pool to user on withdrawal", async function() {
                const withdrawAmout = ethers.parseEther("1");
                const ethAmount1 = withdrawAmout * (await pool.totalAssets()) / (await pool.totalShares()); 
                
                await expect(() => 
                    pool.connect(user1).withdrawal(withdrawAmout))
                        .to.changeEtherBalances(
                            [user1, pool],
                            [ethAmount1, -ethAmount1]
                )
            })
            it("Emit LiquidityRemoved with arguments",async function() {
                const withdrawAmout = ethers.parseEther("1");
                const ethAmount1 = withdrawAmout * (await pool.totalAssets()) / (await pool.totalShares());
                const profitUser1 = ethAmount1 - withdrawAmout;

                const tx = await pool.connect(user1).withdrawal(withdrawAmout);
                await expect(tx).to.emit(pool, "LiquidityRemoved")
                    .withArgs(user1.address, ethAmount1, withdrawAmout)
            })
            it("Withdraw does not change share price", async function() {
                const priceBefore = (await pool.totalAssets() * ethers.parseEther("1")) / (await pool.totalShares());
                await pool.connect(user1).withdrawal(ethers.parseEther("1"));
                const priceAfter = (await pool.totalAssets() * ethers.parseEther("1")) / (await pool.totalShares());

                expect(priceAfter).to.be.closeTo(
                    priceBefore,
                    ethers.parseEther("0.0001")
                )
            })
            it("Allow to withdraw multiple times", async function() {
                await pool.connect(user1).withdrawal(ethers.parseEther("1"));
                await pool.connect(user1).withdrawal(ethers.parseEther("2"))

                const remainingShares = await pool.sharesOf(user1.address);
                expect(remainingShares).to.eq(ethers.parseEther("2"))
            })
            it("Withdraw all shares sets shares zero", async function() {
                const shares = await pool.sharesOf(user1.address);
                await pool.connect(user1).withdrawal(shares);
                expect (await pool.sharesOf(user1.address)).to.eq(0);
            })
        })
        describe("Withdraw - Reverts on withdrawal", function(){
            it("Revert if withdraw amout more the deposit", async function() {
                await expect(pool.connect(user1).withdrawal(ethers.parseEther("10")))
                    .to.be.revertedWithCustomError(pool, "NoLiquidity");
            })
            it("Reverts if withdraw amount is zero", async function() {
                await expect(pool.connect(user1).withdrawal(0))
                    .to.be.revertedWithCustomError(pool, "ZeroValue");
            })
            it("Reverts if ethAmount is more than pool's balance", async function() {
                const withdrawAmout = ethers.parseEther("15");

                await expect(pool.connect(user1).withdrawal(withdrawAmout))
                    .to.be.revertedWithCustomError(pool, "NoLiquidity")
            })
            it("Reverts withdraw when paused", async function() {
                await pool.pause();
                await expect(pool.connect(user1).withdrawal(ethers.parseEther("1")))
                    .to.be.not.reverted;
            })
        })
    })
    