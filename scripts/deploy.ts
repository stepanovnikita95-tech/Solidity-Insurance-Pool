import { ethers } from "hardhat";
import { 
    InsurancePool, 
    PolicyNFT, 
    SimpleOracle, 
    Treasury} from "../typechain-types";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with account:", deployer.address);
    console.log("Balance:", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
    ));

    // =============================
    // 1. Deploy PolicyNFT
    // =============================
    const PolicyNFT = await ethers.getContractFactory("PolicyNFT");
    const policyNFT = await PolicyNFT.deploy(deployer.address);
    await policyNFT.waitForDeployment();

    console.log("PolicyNFT deployed to:", await policyNFT.getAddress());

    // =============================
    // 2. Deploy Treasury
    // =============================
    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(deployer.address);
    await treasury.waitForDeployment();

    console.log("Treasury deployed to:", await treasury.getAddress());

    // =============================
    // 3. Deploy Oracle (simple)
    // =============================
    const Oracle = await ethers.getContractFactory("SimpleOracle");
    const oracle = await Oracle.deploy(deployer.address);
    await oracle.waitForDeployment();

    console.log("Oracle deployed to:", await oracle.getAddress());

    // =============================
    // 4. Deploy InsurancePool
    // =============================
    const InsurancePool = await ethers.getContractFactory("InsurancePool");

    const pool = await InsurancePool.deploy(
        deployer.address,
        await policyNFT.getAddress(),
        await oracle.getAddress(),
        await treasury.getAddress(),
        2000, // maxCoverageBps = 20%
        300,  // premiumRateBps = 3%
        500   // protocolFeeBps = 5%
    );

    await pool.waitForDeployment();

    console.log("InsurancePool deployed to:", await pool.getAddress());

    // =============================
    // 5. Link PolicyNFT to Pool
    // =============================
    const tx = await policyNFT.setInsurancePool(await pool.getAddress());
    await tx.wait();

    console.log("PolicyNFT linked to InsurancePool");

    console.log("\n Deployment completed successfully");
    
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
