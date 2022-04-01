require("hardhat-gas-reporter");
require('hardhat-contract-sizer');
require("solidity-coverage");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("dotenv").config();
// const web3 = require('web3');

//const dotenv = require('dotenv').config()
//npx hardhat run scripts/deploy.js --network rinkeby
//npx hardhat run scripts/deploy.js --network harmony_testnet
//npx hardhat run scripts/deploy.js --network harmony_mainnet

var tellorAddress = '0x41b66dd93b03e89D29114a7613A6f9f0d4F40178'
var ownerAddress = '0x80fc34a2f9FfE86F41580F47368289C402DEc660'
var feeAmount = 10

async function deployAutopay(_network, _pk, _nodeURL, tellorAdd, ownerAdd, feeAmt) {
    console.log("deploy autopay")
    await run("compile")

    var net = _network

    ///////////////Connect to the network
    let privateKey = _pk;
    var provider = new ethers.providers.JsonRpcProvider(_nodeURL)
    let wallet = new ethers.Wallet(privateKey, provider)

    /////////// Deploy Polygon governance
    console.log("deploy autopay")

    /////////////PolygonGovernance
    console.log("Starting deployment for Autopay contract...")
    const Autopay = await ethers.getContractFactory("contracts/Autopay.sol:Autopay", wallet)
    const autopaywithsigner = await Autopay.connect(wallet)
    const autopay = await autopaywithsigner.deploy(tellorAdd, ownerAdd, feeAmt)
    await autopay.deployed();

    if (net == "mainnet"){
        console.log("Autopay contract deployed to:", "https://etherscan.io/address/" + autopay.address);
        console.log("    transaction hash:", "https://etherscan.io/tx/" + autopay.deployTransaction.hash);
    } else if (net == "rinkeby") {
        console.log("Autopay contract deployed to:", "https://rinkeby.etherscan.io/address/" + autopay.address);
        console.log("    transaction hash:", "https://rinkeby.etherscan.io/tx/" + autopay.deployTransaction.hash);
    } else if (net == "bsc_testnet") {
        console.log("Autopay contract deployed to:", "https://testnet.bscscan.com/address/" + autopay.address);
        console.log("    transaction hash:", "https://testnet.bscscan.com/tx/" + autopay.deployTransaction.hash);
    } else if (net == "bsc") {
        console.log("Autopay contract deployed to:", "https://bscscan.com/address/" + autopay.address);
        console.log("    transaction hash:", "https://bscscan.com/tx/" + autopay.deployTransaction.hash);
    } else if (net == "polygon") {
        console.log("Autopay contract deployed to:", "https://polygonscan.com/address/" + autopay.address);
        console.log("    transaction hash:", "https://polygonscan.com/tx/" + autopay.deployTransaction.hash);
    } else if (net == "polygon_testnet") {
        console.log("Autopay contract deployed to:", "https://mumbai.polygonscan.com/address/" + autopay.address);
        console.log("    transaction hash:", "https://mumbai.polygonscan.com/tx/" + autopay.deployTransaction.hash);
    } else if (net == "arbitrum_testnet"){
        console.log("Autopay contract deployed to:","https://rinkeby-explorer.arbitrum.io/#/"+ autopay.address)
        console.log("    transaction hash:", "https://rinkeby-explorer.arbitrum.io/#/tx/" + autopay.deployTransaction.hash);
    } else if (net == "harmony_testnet"){
        console.log("Autopay contract deployed to:","https://explorer.pops.one/address/"+ autopay.address)
        console.log("    transaction hash:", "https://explorer.pops.one/txt/" + autopay.deployTransaction.hash);
    } else if (net == "harmony_mainnet"){
        console.log("Autopay contract deployed to:","https://explorer.harmony.one/address/"+ autopay.address)
        console.log("    transaction hash:", "https://explorer.harmony.one/txt/" + autopay.deployTransaction.hash);
    } else if (net == "xdaiSokol"){ //https://blockscout.com/poa/xdai/address/
      console.log("Autopay contract deployed to:","https://blockscout.com/poa/sokol/address/"+ autopay.address)
      console.log("    transaction hash:", "https://blockscout.com/poa/sokol/tx/" + autopay.deployTransaction.hash);
    } else if (net == "xdai"){ //https://blockscout.com/poa/xdai/address/
      console.log("Autopay contract deployed to:","https://blockscout.com/xdai/mainnet/address/"+ autopay.address)
      console.log("    transaction hash:", "https://blockscout.com/xdai/mainnet/tx/" + autopay.deployTransaction.hash);
    } else {
        console.log("Please add network explorer details")
    }


    // Wait for few confirmed transactions.
    // Otherwise the etherscan api doesn't find the deployed contract.
    console.log('waiting for TellorFlex tx confirmation...');
    await autopay.deployTransaction.wait(7)

    console.log('submitting TellorFlex contract for verification...');

    await run("verify:verify",
        {
            address: autopay.address,
            constructorArguments: [tellorAdd, ownerAdd, feeAmt]
        },
    )

    console.log("Autopay contract verified")

}


deployAutopay("harmony_testnet", process.env.TESTNET_PK, process.env.NODE_URL_HARMONY_TESTNET, tellorAddress, ownerAddress, feeAmount)
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

// deployAutopay("harmony_mainnet", process.env.MAINNET_PK, process.env.NODE_URL_HARMONY_MAINNET, tellorAddress, ownerAddress, feeAmount)
//     .then(() => process.exit(0))
//     .catch(error => {
//         console.error(error);
//         process.exit(1);
//     });

