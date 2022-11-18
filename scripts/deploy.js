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

var tellorAddress = '0x3251838bd813fdf6a97D32781e011cce8D225d59' // playground
var feeAmount = 20

async function deployAutopay(_network, _pk, _nodeURL, tellorAdd, feeAmt) {
    console.log("deploy autopay")
    await run("compile")

    var net = _network

    ///////////////Connect to the network
    let privateKey = _pk;
    var provider = new ethers.providers.JsonRpcProvider(_nodeURL)
    let wallet = new ethers.Wallet(privateKey, provider)

    /////////// Deploy autopay
    console.log("deploy autopay")

    ///////////// Query data storage
    console.log("Starting deployment for QueryDataStorage contract...")
    const QStorage = await ethers.getContractFactory("contracts/QueryDataStorage.sol:QueryDataStorage", wallet)
    const qstoragewithsigner = await QStorage.connect(wallet)
    const qstorage = await qstoragewithsigner.deploy()
    await qstorage.deployed();
    console.log("QueryDataStorage contract deployed to: ", qstorage.address)

    if (net == "mainnet"){
        console.log("QueryDataStorage contract deployed to:", "https://etherscan.io/address/" + qstorage.address);
        console.log("    transaction hash:", "https://etherscan.io/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "rinkeby") {
        console.log("QueryDataStorage contract deployed to:", "https://rinkeby.etherscan.io/address/" + qstorage.address);
        console.log("    transaction hash:", "https://rinkeby.etherscan.io/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "bsc_testnet") {
        console.log("QueryDataStorage contract deployed to:", "https://testnet.bscscan.com/address/" + qstorage.address);
        console.log("    transaction hash:", "https://testnet.bscscan.com/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "bsc") {
        console.log("QueryDataStorage contract deployed to:", "https://bscscan.com/address/" + qstorage.address);
        console.log("    transaction hash:", "https://bscscan.com/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "polygon") {
        console.log("QueryDataStorage contract deployed to:", "https://polygonscan.com/address/" + qstorage.address);
        console.log("    transaction hash:", "https://polygonscan.com/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "mumbai") {
        console.log("QueryDataStorage contract deployed to:", "https://mumbai.polygonscan.com/address/" + qstorage.address);
        console.log("    transaction hash:", "https://mumbai.polygonscan.com/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "arbitrum_testnet"){
        console.log("QueryDataStorage contract deployed to:","https://rinkeby-explorer.arbitrum.io/#/"+ qstorage.address)
        console.log("    transaction hash:", "https://rinkeby-explorer.arbitrum.io/#/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "harmony_testnet"){
        console.log("QueryDataStorage contract deployed to:","https://explorer.pops.one/address/"+ qstorage.address)
        console.log("    transaction hash:", "https://explorer.pops.one/txt/" + qstorage.deployTransaction.hash);
    } else if (net == "harmony_mainnet"){
        console.log("QueryDataStorage contract deployed to:","https://explorer.harmony.one/address/"+ qstorage.address)
        console.log("    transaction hash:", "https://explorer.harmony.one/txt/" + qstorage.deployTransaction.hash);
    } else if (net == "xdaiSokol"){ //https://blockscout.com/poa/xdai/address/
      console.log("QueryDataStorage contract deployed to:","https://blockscout.com/poa/sokol/address/"+ qstorage.address)
      console.log("    transaction hash:", "https://blockscout.com/poa/sokol/tx/" + qstorage.deployTransaction.hash);
    } else if (net == "xdai"){ //https://blockscout.com/poa/xdai/address/
      console.log("QueryDataStorage contract deployed to:","https://blockscout.com/xdai/mainnet/address/"+ qstorage.address)
      console.log("    transaction hash:", "https://blockscout.com/xdai/mainnet/tx/" + qstorage.deployTransaction.hash);
    } else {
        console.log("Please add network explorer details")
    }

    /////////////autopay
    console.log("Starting deployment for Autopay contract...")
    const Autopay = await ethers.getContractFactory("contracts/Autopay.sol:Autopay", wallet)
    const autopaywithsigner = await Autopay.connect(wallet)
    const autopay = await autopaywithsigner.deploy(tellorAdd, qstorage.address, feeAmt)
    await autopay.deployed();
    console.log("Autopay contract deployed to: ", autopay.address)

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
    } else if (net == "mumbai") {
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
    console.log('waiting for QueryDataStorage tx confirmation...');
    await qstorage.deployTransaction.wait(7)

    console.log('submitting Autopay contract for verification...');

    await run("verify:verify",
        {
            address: qstorage.address,
            constructorArguments: []
        },
    )

    console.log("Autopay contract verified")

    // Wait for few confirmed transactions.
    // Otherwise the etherscan api doesn't find the deployed contract.
    console.log('waiting for Autopay tx confirmation...');
    await autopay.deployTransaction.wait(7)

    console.log('submitting Autopay contract for verification...');

    await run("verify:verify",
        {
            address: autopay.address,
            constructorArguments: [tellorAdd, qstorage.address, feeAmt]
        },
    )

    console.log("Autopay contract verified")

}


deployAutopay("harmony_testnet", process.env.TESTNET_PK, process.env.NODE_URL_HARMONY_TESTNET, tellorAddress, feeAmount)
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

