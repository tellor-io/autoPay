const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { keccak256 } = require("@ethersproject/keccak256");
const { AbiCoder } = require("ethers/lib/utils");
require("chai").use(require("chai-as-promised")).should();

describe("Autopay - function tests", () => {
    let tellor,autopay,accounts,token,firstBlocky,blocky,dataFeedBefore,bytesId;
    let abiCoder = new ethers.utils.AbiCoder();
    ethers.utils.encodewit
    const MAXGASCOVER = h.toTRB(400000);

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
        tellor = await TellorPlayground.deploy();
        await tellor.deployed();
        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy();
        await token.deployed();
        await token.mint(accounts[0].address, h.toWei("1000200"));
        const Autopay = await ethers.getContractFactory("Autopay");
        autopay = await Autopay.deploy(tellor.address, token.address, accounts[0].address, 10);
        await autopay.deployed();
        await token.approve(autopay.address, h.toWei("1000100"));
        blocky = await h.getBlock();
        QUERYDATA = abiCoder.encode(["string","bytes"],["TellorKpr",abiCoder.encode(["uint256", "address", "bytes", "uint256", "uint256"],[MAXGASCOVER,h.zeroAddress,"0x",blocky.timestamp,80001])]);
        KPRQUERYID = keccak256(QUERYDATA);
        await autopay.tipKeeperJob(MAXGASCOVER,h.zeroAddress,"0x",blocky.timestamp,80001,web3.utils.toWei("1"));
    });

    it("constructor", async () => {
        expect(await autopay.master()).to.equal(tellor.address);
        expect(await autopay.token()).to.equal(token.address);
        expect(await autopay.owner()).to.equal(accounts[0].address);
        expect(await autopay.fee()).to.equal(10)
    });

    it("tipKeeperJob", async () => {
        await token.mint(accounts[0].address,web3.utils.toWei("1000"));
        await token.approve(autopay.address,web3.utils.toWei("100"));
        let autopayBalance = await token.balanceOf(autopay.address);
        let acctBeforeBalance = await token.balanceOf(accounts[0].address);
        await autopay.tipKeeperJob(MAXGASCOVER,accounts[1].address,"0x",blocky.timestamp,80001,web3.utils.toWei("1"));
        let acctBalDiff = MAXGASCOVER.add(web3.utils.toWei("1"));
        expect(await token.balanceOf(accounts[0].address)).to.equal(acctBeforeBalance.sub(acctBalDiff));
        expect(await token.balanceOf(autopay.address)).to.equal(autopayBalance.add(acctBalDiff));
        });
    
    it("increaseMaxGasForExistingJob", async () => {
        let autopayBefore = await token.balanceOf(autopay.address);
        await autopay.increaseMaxGasForExistingJob(KPRQUERYID, MAXGASCOVER);
        expect(await token.balanceOf(autopay.address)).to.equal(autopayBefore.add(MAXGASCOVER));
        await h.expectThrowMessage(autopay.connect(accounts[1]).increaseMaxGasForExistingJob(KPRQUERYID, MAXGASCOVER)); // Not job creator
    });

    it("addTiptoExistingSingleJob", async () => {
        let autopayBefore = await token.balanceOf(autopay.address);
        await autopay.addTiptoExistingSingleJob(KPRQUERYID, MAXGASCOVER);
        expect(await token.balanceOf(autopay.address)).to.equal(autopayBefore.add(MAXGASCOVER));
        await h.expectThrowMessage(autopay.connect(accounts[1]).addTiptoExistingSingleJob(KPRQUERYID, MAXGASCOVER)); // Not job creator
    });

    it("unclaimedSingleTipsFallback", async () => {
        await h.expectThrowMessage(autopay.unclaimedSingleTipsFallback(KPRQUERYID));
        h.advanceTime(7258000);
        let autopayBefore = await token.balanceOf(autopay.address);
        await autopay.unclaimedSingleTipsFallback(KPRQUERYID);
        expect(await token.balanceOf(autopay.address)).to.equal(autopayBefore.sub(MAXGASCOVER.add(web3.utils.toWei("1"))));
    });

    it("keeperClaimTip", async () => {
        let acct0Bal = await token.balanceOf(accounts[0].address); // owner
        let acct1Bal = await token.balanceOf(accounts[1].address); // keeper
        let VAL = abiCoder.encode(["bytes32","address","uint256","uint256"],[keccak256("0x"),accounts[1].address,(await h.getBlock()).timestamp,MAXGASCOVER]);
        await tellor.connect(accounts[1]).submitValue(KPRQUERYID,VAL,0,QUERYDATA);
        await h.expectThrow(autopay.keeperClaimTip(KPRQUERYID)); // 12 hour buffer
        h.advanceTime(43200)
        await autopay.keeperClaimTip(KPRQUERYID);
        assert(BigInt(await token.balanceOf(accounts[0].address)) > acct0Bal);
        assert(BigInt(await token.balanceOf(accounts[1].address)) > acct1Bal);
    })
});