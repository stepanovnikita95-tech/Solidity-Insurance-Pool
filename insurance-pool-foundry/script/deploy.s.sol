// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/console.sol";
import "forge-std/Script.sol";

import "../src/InsurancePool.sol";
import "../src/PolicyNFT.sol";
import "../src/Treasury.sol";
import "../src/Oracle.sol";

contract DeployInsurancePool is Script {
    function run() external {
        vm.startBroadcast();


        address deployer = msg.sender;
        console.log("Deploying from: ", deployer);

        PolicyNFT nft = new PolicyNFT(deployer);
        console.log("PolicyNFT deployed at: ", address(nft));

        Treasury treasury = new Treasury(deployer);
        console.log("Treasury deployed at: ", address(treasury));

        SimpleOracle oracle = new SimpleOracle(deployer);
        console.log("Oracle deployed at: ", address(oracle));

        InsurancePool pool = new InsurancePool(
            deployer,
            address(nft),
            address(oracle),
            address(treasury),
            2000,
            300,
            500
        );
        console.log("InsurancePool deployed at: ", address(pool));

        nft.setInsurancePool(address(pool));
        console.log("PolicynFT linked to InsurancePool");

        vm.stopBroadcast();
    }
}