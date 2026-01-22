import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    InsurancePool, 
    PolicyNFT, 
    SimpleOracle, 
    Treasury} from "../typechain-types";

describe("InsurancePool", function() {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let policyNFT: PolicyNFT;
    let treasury: Treasury;
    let oracle: SimpleOracle;
    let pool: InsurancePool;

    async function deployFixture() {
        [owner, user1, user2] = await ethers.getSigners();
        
        const FactoryNFT = await ethers.getContractFactory("PolicyNFT",);
        policyNFT = await FactoryNFT.deploy(owner.address);
        await policyNFT.waitForDeployment();

        const FactoryTreasury = await ethers.getContractFactory("Treasury",);
        treasury = await FactoryTreasury.deploy(owner.address);
        await treasury.waitForDeployment();

        const FactoryOracle = await ethers.getContractFactory("SimpleOracle",);
        oracle = await FactoryOracle.deploy(owner.address);
        await oracle.waitForDeployment();

        const FactoryPool = await ethers.getContractFactory("InsurancePool",);
        pool = await FactoryPool
            .deploy(
                owner.address,
                policyNFT.getAddress(),
                oracle.getAddress(),
                treasury.getAddress(),
                2000,
                300,
                500);
        await pool.waitForDeployment();
        
        return {pool, treasury, oracle, owner, user1, user2};
    }
    
    describe("Deposit", function(){
        beforeEach(async function() {
            const {pool, user1, user2} = await deployFixture();
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
                await pool.connect(owner).pause();
                await expect(pool.connect(user1).deposit({value: ethers.parseEther("1")}))
                    .to.be.revertedWithCustomError(pool,"EnforcedPause");
            })
        })
    })
    describe("Withdraw", function() {
        beforeEach(async function() {
            const {pool, user1, user2} = await deployFixture();
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
                await pool.connect(owner).pause();
                await expect(pool.connect(user1).withdrawal(ethers.parseEther("1")))
                    .to.be.not.reverted;
            })
        })
    })
    describe("Buy Policy", function() {
        let premium: bigint;
        let policyId: bigint;
        beforeEach(async function() {
            const {pool, treasury, user1, user2} = await deployFixture();

            await policyNFT.setInsurancePool(pool.target);

            await pool.connect(user1).deposit({value: ethers.parseEther("100")});

            const coverage = ethers.parseEther("1");
            const duration = 7 * 24 * 60 * 60;
            premium = coverage * (await pool.premiumRateBps()) / 10_000n;

            const tx = await pool.connect(user1).buyPolicy(coverage, duration, {value: premium});
            const receipt = await tx.wait(); 

            if (!receipt) throw new Error("Tx not mined");

            const event = receipt.logs
                .map(log => pool.interface.parseLog(log))
                .filter(Boolean).find(e => e!.name === "PolicyCreated");
            
            policyId = event!.args.policyId;
        })

        describe("BuyPolicy - success cases", function() {  
            it("Policy successfully created", async function() {
                expect(policyId).to.not.eq(0n);  
            })
            it("Policy Id exists in mapping", async function() {
                const policy = await pool.policies(policyId);
                const duration = 7 * 24 * 60 * 60;

                expect(policy.coverage).to.eq(ethers.parseEther("1"));
                expect(policy.premium).to.eq(premium);
                expect(policy.end).to.be.gt(policy.start);                    
                expect(policy.end - policy.start).to.eq(duration)
                expect(policy.resolved).to.eq(false);
            })
            it("Policy NFT is minted to buyer", async function() {
                const buyer = user1;
                expect(await policyNFT.ownerOf(policyId)).to.eq(buyer.address);
            })
            it("Increments buyer NFT balance", async function() {
                const balanceBefore = await policyNFT.balanceOf(user1.address);

                const coverage = ethers.parseEther("1");
                const duration = 7 * 24 * 60 * 60;
                const premium = coverage * (await pool.premiumRateBps()) / 10_000n;
                    
                await pool.connect(user1).buyPolicy(
                    coverage,
                    duration,
                    {value: premium}
                )
                const balanceAfter = await policyNFT.balanceOf(user1.address);

                expect(balanceAfter).to.eq(balanceBefore + 1n);
            })
            it("policyId matches minted NFT tokenId",async function() {
                expect(await policyNFT.ownerOf(policyId)).to.eq(user1.address);
            })
            it("Reverts if called not from InsurancePool", async function() {
                await expect(policyNFT.connect(user1).mint(user1.address))
                    .to.be.revertedWithCustomError(policyNFT, "NotInsurancePool");
            })
            it("PolicyId appears in buyer policy list", async function() {
                const ids = await policyNFT.policiesOfOwner(user1.address)
                expect(ids.length).to.eq(1);
                expect(ids[0]).to.eq(1n);
            })
            it("Premium is transferred to pool / treasury", async function() {
                const totalAssetsBefore = await pool.totalAssets();
                const balancePoolBefore = await ethers.provider.getBalance(pool.getAddress());
                const balanceTreasuryBefore = await ethers.provider.getBalance(treasury.getAddress());
                
                const coverage = ethers.parseEther("1");
                const duration = 7 * 24 * 60 * 60;
                const premium = coverage * (await pool.premiumRateBps()) / 10_000n;

                const protocolFee = premium * (await pool.protocolFeeBps()) / 10_000n;
                
                await pool.connect(user1).buyPolicy(
                    coverage,
                    duration,
                    {value: premium}
                )
                
                const totalAssetsAfter = await pool.totalAssets();
                const balancePoolAfter = await ethers.provider.getBalance(pool.getAddress());
                const balanceTreasuryAfter = await ethers.provider.getBalance(treasury.getAddress());

                expect(totalAssetsAfter - totalAssetsBefore).to.eq(premium - protocolFee);
                expect(balancePoolAfter - balancePoolBefore).to.eq(premium - protocolFee);
                expect(balanceTreasuryAfter -  balanceTreasuryBefore).to.eq(protocolFee);
            })
            it("Locked liquidity increases correctly", async function() {
                const lockedLiquidityBefore = await pool.totalLockedCoverage();
                const availableLiquidityBefore = await pool.availableLiquidity();
                
                const coverage = ethers.parseEther("1");
                const duration = 7 * 24 * 60 * 60;
                const premium = coverage * (await pool.premiumRateBps()) / 10_000n;

                const protocolFee = premium * (await pool.protocolFeeBps()) / 10_000n;
                const netPremium = premium - protocolFee;
                
                await pool.connect(user1).buyPolicy(
                    coverage,
                    duration,
                    {value: premium}
                )

                const lockedLiquidityAfter = await pool.totalLockedCoverage();
                const availableLiquidityAfter = await pool.availableLiquidity();

                expect(lockedLiquidityAfter - lockedLiquidityBefore).to.eq(coverage);
                expect(availableLiquidityBefore - availableLiquidityAfter).to.eq(coverage - netPremium);
                expect((await pool.availableLiquidity()) + (await pool.totalLockedCoverage()))
                    .to.eq(await pool.totalAssets());
            })
            it("Buy multiple policies", async function() {
                const policy1 = await pool.policies(policyId);
                const duration = 7 * 24 * 60 * 60;

                const coverage2 = ethers.parseEther("10");
                const duration2 = 2 * 24 * 60 * 60;
                const premium2 = coverage2 * (await pool.premiumRateBps()) / 10_000n;
                const tx2 = await pool.connect(user1).buyPolicy(
                    coverage2,
                    duration2,
                    {value: premium2}
                )
                const receipt2 = await tx2.wait(); 

                if (!receipt2) throw new Error("Tx not mined");

                const event = receipt2.logs
                    .map(log => pool.interface.parseLog(log))
                    .filter(Boolean).find(e => e!.name === "PolicyCreated");
            
                const policyId2 = event!.args.policyId;
                const policy2 = await pool.policies(policyId2);

                expect(policy1.coverage).to.eq(ethers.parseEther("1"));
                expect(policy1.premium).to.eq(premium);
                expect(policy1.end).to.be.gt(policy1.start);                    
                expect(policy1.end - policy1.start).to.eq(duration)
                expect(policy1.resolved).to.eq(false);
                
                expect(policy2.coverage).to.eq(ethers.parseEther("10"));
                expect(policy2.premium).to.eq(premium2);
                expect(policy2.end).to.be.gt(policy2.start);                    
                expect(policy2.end - policy2.start).to.eq(duration2)
                expect(policy2.resolved).to.eq(false);
            })
            it("User can buy policy when contract was paused then unpause", async function() {
                await pool.pause();
                
                const coverage = ethers.parseEther("1");
                const duration = 7 * 24 * 60 * 60;
                const premium = coverage * (await pool.premiumRateBps()) / 10_000n;
                    
                await expect(pool.connect(user1).buyPolicy(
                    coverage,
                    duration,
                    {value: premium}
                )).to.be.reverted;
                
                await pool.unpause();
                await expect(pool.connect(user1).buyPolicy(
                    coverage,
                    duration,
                    {value: premium}
                )).to.be.not.reverted;
            })
        })
        describe("BuyPolicy - revert case", function() {
            it("Revert if coverage is zero", async function() {
                await expect(pool.connect(user1).buyPolicy(0n, 60n))
                    .to.be.revertedWithCustomError(pool, "ZeroValue"); 
            })
            it("Revert if duration is zero or more than MAX duration", async function() {
                await expect(pool.connect(user1).buyPolicy(100n, 0n))
                    .to.be.revertedWithCustomError(pool, "DurationOutOfRange");
                const requiredDuration = 100 * 24 * 60 * 60;
                await expect(pool.connect(user1).buyPolicy(100n, requiredDuration))
                    .to.be.revertedWithCustomError(pool, "DurationOutOfRange");
            })
            it("Reverts if coverage exceeds max per policy", async function () {
                const available = await pool.availableLiquidity();
                const coverageTooBig = available + 1n;
                const premium = coverageTooBig * await pool.premiumRateBps() / 10_000n;

                await expect(pool.connect(user1).buyPolicy(
                        coverageTooBig,
                        7 * 24 * 60 * 60,
                        { value: premium })).to.be.revertedWithCustomError(pool, "CoverageLimitExceeded");
            });
            it("Revert if incorrect premium", async function() {
                const available = await pool.availableLiquidity();
                const coverage = (available * (await pool.maxCoverageBps())) / 10_000n;
                const premiumLessThanRequired = coverage * await pool.premiumRateBps() / 10_000n - 1n;

                await expect(pool.connect(user1).buyPolicy(
                        coverage,
                        7 * 24 * 60 * 60,
                        { value: premiumLessThanRequired })).to.be.revertedWithCustomError(pool, "WrongPremium");
            })
            it("Revert when contract is paused", async function() {
                await pool.connect(owner).pause();
                const coverage = ethers.parseEther("10");

                await expect(pool.connect(user1).buyPolicy(
                        coverage,
                        7 * 24 * 60 * 60,
                        { value: premium}))
                    .to.be.revertedWithCustomError(pool,"EnforcedPause");
            })
            it("Invariants after buy policy", async function() {
                const totalSharesBefore = await pool.totalShares();
                const lpSharesUser1Before = await pool.sharesOf(user1);
                const coverage = ethers.parseEther("10");
                const duration = 2 * 24 * 60 * 60;
                const premium = coverage * (await pool.premiumRateBps()) / 10_000n;
                const tx2 = await pool.connect(user1).buyPolicy(
                    coverage,
                    duration,
                    {value: premium}
                )
                const totalSharesAfter = await pool.totalShares();
                const lpSharesUser1After = await pool.sharesOf(user1);

                expect(totalSharesAfter).to.eq(totalSharesBefore);
                expect(lpSharesUser1After).to.eq(lpSharesUser1Before);
                
                expect(await pool.totalLockedCoverage()).to.be.lt(await pool.totalAssets())
            })
        })
    })
    describe("Resolve Policy", function() {
        let coverage: bigint;
        let policyId: bigint;
        beforeEach( async function() {
            const {pool, oracle, user1, user2} = await deployFixture();

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
    describe("Expire Policy", function() {
        let coverage: bigint;
        let policyId: bigint;
        beforeEach( async function() {
            const {pool, oracle, user1, user2} = await deployFixture();

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
    })
    describe("Upgreates parametrs", function() {
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
            const {pool, user1} = await deployFixture();

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
            const {pool, user1} = await deployFixture();

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
    describe("Emergency withdraw", function() {
        beforeEach( async function() {
            const {pool, user1} = await deployFixture();

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
    describe("Treasury", function() {
        let coverage: bigint;
        let duration: number;
        let premium: bigint;
        let fee: bigint;
        beforeEach(async function() {
            const {pool, treasury, user1} = await deployFixture();
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
                await expect(treasury.withdrawal(user1.address, withdrawAmount)).to.not.be.rejected;
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
    
})

