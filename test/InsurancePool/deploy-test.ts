import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SimpleOracle } from "@typechain-types/contracts/Oracle.sol";
import { 
    InsurancePool, 
    PolicyNFT, 
    Treasury} from "@typechain-types/contracts";

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let policyNFT: PolicyNFT;
    let treasury: Treasury;
    let oracle: SimpleOracle;
    let pool: InsurancePool;

    export async function deployFixture() {
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
        
        return {pool,policyNFT, treasury, oracle, owner, user1, user2};
    }
    
