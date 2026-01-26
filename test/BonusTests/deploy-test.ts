import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SimpleOracle } from "@typechain-types/contracts/Oracle.sol";
import { 
    InsurancePool, 
    PolicyNFT, 
    Treasury} from "@typechain-types/contracts";
import { RejectTransfer } from "typechain-types";

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let policyNFT: PolicyNFT;
    let treasury: Treasury;
    let rejectTreausury:RejectTransfer;
    let oracle: SimpleOracle;
    let pool: InsurancePool;

    export async function deployFixture() {
        [owner, user1, user2] = await ethers.getSigners();
        
        const FactoryNFT = await ethers.getContractFactory("PolicyNFT");
        policyNFT = await FactoryNFT.deploy(owner.address);
        await policyNFT.waitForDeployment();

        const FactoryTreasury = await ethers.getContractFactory("Treasury");
        treasury = await FactoryTreasury.deploy(owner.address);
        await treasury.waitForDeployment();

        const FactoryRejectTreasury = await ethers.getContractFactory("RejectTransfer");
        rejectTreausury = await FactoryRejectTreasury.deploy(owner.address, ethers.ZeroAddress);
        await rejectTreausury.waitForDeployment();

        const FactoryOracle = await ethers.getContractFactory("SimpleOracle");
        oracle = await FactoryOracle.deploy(owner.address);
        await oracle.waitForDeployment();

        const FactoryPool = await ethers.getContractFactory("InsurancePool");
        pool = await FactoryPool
            .deploy(
                owner.address,
                await policyNFT.getAddress(),
                await oracle.getAddress(),
                await rejectTreausury.getAddress(),
                2000,
                300,
                500);
        await pool.waitForDeployment();

        await policyNFT.setInsurancePool(pool.target);

        await pool.connect(user1).deposit({value: ethers.parseEther("100")});
        
        return {pool,policyNFT, treasury, oracle, owner, user1, user2, rejectTreausury};
    }
    
