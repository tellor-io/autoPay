const {expect,assert} = require("chai");
const {ethers} = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

require("chai").use(require("chai-as-promised")).should();

describe("AutopayKeeper - e2e tests", function() {

    let tellor, autopay, accounts, token;
    let abiCoder = new ethers.utils.AbiCoder();

    beforeEach(async function() {
    accounts = await ethers.getSigners();
    const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
    tellor = await TellorPlayground.deploy();
    await tellor.deployed();
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    await token.deployed();
    await token.mint(accounts[0].address, h.toWei("10000000000"));
    const Autopay = await ethers.getContractFactory("Autopay");
    autopay = await Autopay.deploy(tellor.address, token.address, accounts[0].address, 10);
    await autopay.deployed();
    });

    it("multiple single tips", async function() {});
    it("tipping same job, multiple times", async function() {});
    it("", async function() {});
});
