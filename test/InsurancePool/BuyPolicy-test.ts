import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./deploy-test";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    InsurancePool, 
    PolicyNFT,  
    Treasury} from "@typechain-types/contracts";

    describe("InsurancePool - Buy Policy", function() {
        let premium: bigint;
        let policyId: bigint;
        let user1: SignerWithAddress;
        let user2: SignerWithAddress;
        let policyNFT: PolicyNFT;
        let treasury: Treasury;
        let pool: InsurancePool;
        
        beforeEach(async function() {
            ({pool, policyNFT, treasury, user1, user2} = await deployFixture());

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
            it("Reverts if duration is zero or more than MAX duration", async function() {
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
            it("Reverts if incorrect premium", async function() {
                const available = await pool.availableLiquidity();
                const coverage = (available * (await pool.maxCoverageBps())) / 10_000n;
                const premiumLessThanRequired = coverage * await pool.premiumRateBps() / 10_000n - 1n;

                await expect(pool.connect(user1).buyPolicy(
                        coverage,
                        7 * 24 * 60 * 60,
                        { value: premiumLessThanRequired })).to.be.revertedWithCustomError(pool, "WrongPremium");
            })
            it("Reverts when contract is paused", async function() {
                await pool.pause();
                const coverage = ethers.parseEther("10");

                await expect(pool.connect(user1).buyPolicy(
                        coverage,
                        7 * 24 * 60 * 60,
                        { value: premium}))
                    .to.be.revertedWithCustomError(pool,"EnforcedPause");
            })
            it("Reverts if called not from InsurancePool", async function() {
                await expect(policyNFT.connect(user1).mint(user1.address))
                    .to.be.revertedWithCustomError(policyNFT, "NotInsurancePool");
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
