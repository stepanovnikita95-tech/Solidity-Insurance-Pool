import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    InsurancePool, 
    PolicyNFT, 
    Treasury} from "@typechain-types/contracts";

    let user1: SignerWithAddress;
    let policyNFT: PolicyNFT;
    let treasury: Treasury;
    let pool: InsurancePool;

    describe("Treasury", function() {
        let coverage: bigint;
        let duration: number;
        let premium: bigint;
        let fee: bigint;
        beforeEach(async function() {
            ({pool,policyNFT, treasury, user1} = await deployFixture());
            await pool.connect(user1).deposit({value: ethers.parseEther("100")});
        
            await policyNFT.setInsurancePool(pool.target);
            
            coverage = ethers.parseEther("1");
            duration = 7 * 24 * 60 * 60;
            premium = coverage * (await pool.premiumRateBps()) / 10_000n;
            fee = premium * (await pool.protocolFeeBps()) / 10_000n;
        })  
        describe("Treasury - successful cases/Revert", function() {
            describe("Treasury - receive()", function() {
                it("Treasury accept ETH via receive()", async function() {
                    const amount = ethers.parseEther("1");
                    await expect(
                        user1.sendTransaction({
                            to: await treasury.getAddress(),
                            value: amount,
                            })).to.changeEtherBalance(treasury, amount);
                })
                it("Transfer protocol fee to Treasury via receive()", async function() {
                    await expect(
                        pool.connect(user1).buyPolicy(coverage, duration, {value: premium}))
                            .to.changeEtherBalances(
                                    [await treasury.getAddress(), await pool.getAddress()],
                                    [fee, premium - fee]);
                })
                it("Sending ETH to Treasury does not affect to Pool state", async function() {
                    const totalAssetsBefore = await pool.totalAssets();
                    const totalSharesBefore = await pool.totalShares();

                    await user1.sendTransaction(
                        {to:await treasury.getAddress(),
                        value: ethers.parseEther("2")
                        })
                    const totalAssetsAfter = await pool.totalAssets();
                    const totalSharesAfter = await pool.totalShares();

                    expect(totalAssetsAfter).to.eq(totalAssetsBefore);
                    expect(totalSharesAfter).to.eq(totalSharesBefore);
                })
                it("Emited event with correct parametrs", async function() {
                    const amount = ethers.parseEther("2");
                    const tx = await user1.sendTransaction(
                                    {to:await treasury.getAddress(),
                                    value: amount
                                    })
                    await expect(tx).to.emit(treasury, "FundsReceived").withArgs(user1.address, amount)
                })
                it("Reverts if amount is zero", async function() {
                    await expect( user1.sendTransaction(
                                    {to:await treasury.getAddress(),
                                    value: 0
                                    })).to.be.revertedWithCustomError(treasury, "ZeroAmount");
                })
            })
            describe("Treasury - withdraw() success/Revert cases", function() {
                beforeEach(async function() {
                    const amount = ethers.parseEther("10");
                    await user1.sendTransaction({
                            to: await treasury.getAddress(),
                            value: amount,
                            });
                })
            it("Owner can withdraw to target address ", async function() {
                const withdrawAmount = ethers.parseEther("5");
                await expect(treasury.withdrawal(user1.address, withdrawAmount)).to.not.be.reverted;
                await expect(treasury.withdrawal(user1.address, withdrawAmount))
                            .to.changeEtherBalances(
                                [(await treasury.getAddress()), user1.address],
                                [-withdrawAmount, withdrawAmount]);
                })
                it("Withdraw partial amount", async function() {
                    const withdrawAmount = ethers.parseEther("2");
                    await treasury.withdrawal(user1.address, withdrawAmount);
                    expect(await ethers.provider.getBalance(await treasury.getAddress()))
                        .to.eq(ethers.parseEther("8"));
                })
                it("Withdraw full balance", async function() {
                    const withdrawFull = await ethers.provider.getBalance(await treasury.getAddress());
                    await treasury.withdrawal(user1.address, withdrawFull);
                    expect(await ethers.provider.getBalance(await treasury.getAddress()))
                        .to.eq(0);
                })
                it("Emits event with correct parametrs", async function() {
                    const withdrawFull = await ethers.provider.getBalance(await treasury.getAddress());
                    await expect(treasury.withdrawal(user1.address, withdrawFull))
                        .to.emit(treasury, "FundsWithdrawn")
                            .withArgs(user1.address, withdrawFull);
                })
                it("Reverts if withdraw not owner", async function() {
                    const withdrawFull = await ethers.provider.getBalance(await treasury.getAddress());
                    await expect(treasury.connect(user1).withdrawal(user1.address, withdrawFull))
                        .to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
                })
                it("Reverts if zero amount", async function() {
                    await expect(treasury.withdrawal(user1.address, 0)).to.be.revertedWithCustomError(treasury, "ZeroAmount");
                })
            })
        })
    })

