import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { InsurancePool } from "@typechain-types/contracts";

    describe("InsurancePool - Deposit", function(){
        let pool:InsurancePool;
        let user1: SignerWithAddress;
        let user2:SignerWithAddress;
         
        beforeEach(async function() {
            ({pool, user1, user2} = await deployFixture());
        })
        describe("Deposit - success cases", function(){
            it("User can deposit ETH", async function(){
                const amount = ethers.parseEther("1");
                await expect(pool.connect(user1).deposit({value: amount})).to.not.be.reverted;
            })
            it("Actually transfer ETH from LP to pool on deposit", async function() {
                const amount = ethers.parseEther("1");
                const lpBalanceBefore = await ethers.provider.getBalance(user1.address);
                const poolBalanceBefore = await ethers.provider.getBalance(await pool.getAddress());
                
                const tx = await pool.connect(user1).deposit({value: amount});
                const receipt = await tx.wait();

                const gasUsed = receipt!.gasUsed;
                const gasPrice = receipt!.gasPrice!;
                const gasCost = gasUsed * gasPrice;
                
                const lpBalanceAfter = await ethers.provider.getBalance(user1.address);
                const poolBalanceAfter = await ethers.provider.getBalance(await pool.getAddress());
                
                expect(lpBalanceBefore - lpBalanceAfter).to.eq(amount + gasCost);
                expect(poolBalanceAfter - poolBalanceBefore).to.eq(amount);
            })
            it("Correct amount of shares", async function() {
                const amount = ethers.parseEther("1");
                await pool.connect(user1).deposit({value: amount});
                const shares = await pool.sharesOf(user1.address);
                expect(shares).to.eq(amount);
            })
            it("Increase total shares", async function() {
                await pool.connect(user1).deposit({value: ethers.parseEther("2")});
                expect(await pool.totalShares()).to.eq(ethers.parseEther("2"));
            })
            it("Emit Deposited with arguments", async function() {
                const amount = ethers.parseEther("1");
                const tx = await pool.connect(user1).deposit({value: amount });
                await expect(tx)
                    .to.emit(pool,"LiquidityProvided").withArgs(user1.address,amount, amount);
            })
            it("Multiply deposits are supported", async function() {
                const tx1 = await pool.connect(user1).deposit({value: ethers.parseEther("10")});
                let shares1 = await pool.sharesOf(user1.address);
                expect(shares1).to.eq(ethers.parseEther("10"));

                const desiredBalance = ethers.parseEther("28");
                await ethers.provider.send("hardhat_setBalance", 
                    [pool.target, "0x" + desiredBalance.toString(16)]);

                const tx2 = await pool.connect(user1).deposit({value: ethers.parseEther("20")});
                let shares2 = await pool.sharesOf(user1.address);
                expect(shares2).to.be.closeTo(
                    ethers.parseEther("17.14"),
                    ethers.parseEther("0.1")
                );

                const ethBalance = await pool.ethBalance(user1);
                expect(ethBalance).to.be.closeTo(
                    ethers.parseEther("48"),
                    ethers.parseEther("0.1")
                ); 
            })
            it("Two LPs - multiply deposits supported", async function() {
                const deposit1 = ethers.parseEther("5");
                const deposit2 = ethers.parseEther("3");

                await pool.connect(user1).deposit({value: deposit1});

                const shares1 = await pool.sharesOf(user1.address);
                const priceAfterFirst = (await pool.totalAssets()) * ethers.parseEther("1") / await pool.totalShares();

                await pool.connect(user2).deposit({value: deposit2});

                const shares2 = await pool.sharesOf(user2.address);
                const totalShares = await pool.totalShares();

                expect(shares1).to.be.gt(0);
                expect(shares2).to.be.gt(0);

                const priceAfterSecond =
                    (await pool.totalAssets()) * ethers.parseEther("1") / totalShares;

                expect(priceAfterSecond).to.be.closeTo(
                    priceAfterFirst,
                    ethers.parseEther("0.0000001")
                );

                const ethBalance1 = await pool.ethBalance(user1.address);
                const ethBalance2 = await pool.ethBalance(user2.address);

                expect(ethBalance1).to.be.closeTo(
                    deposit1,
                    ethers.parseEther("0.0001")
                );

                expect(ethBalance2).to.be.closeTo(
                    deposit2,
                    ethers.parseEther("0.0001")
                );
            })
            it("Depoit is available if contract was paused but then unpaused", async function() {
                const amount = ethers.parseEther("1");
                await pool.pause();
                await expect(pool.connect(user1).deposit({value: amount})).to.be.reverted;
                await pool.unpause();
                await expect(pool.connect(user1).deposit({value: amount})).to.be.not.reverted;
            })
        })
        describe("Deposit - Reverts cases", function() {
            it("Reverted if amount is zero", async function() {
                await expect(pool.connect(user1).deposit({value: 0}))
                    .to.be.revertedWithCustomError(pool, "ZeroValue");
            })
            it("Reverted if contract is paused", async function() {
                await pool.pause();
                await expect(pool.connect(user1).deposit({value: ethers.parseEther("1")}))
                    .to.be.revertedWithCustomError(pool,"EnforcedPause");
            })
        })
    })
