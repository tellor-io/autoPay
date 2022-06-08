const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { BigNumber } = require("ethers");
const { keccak256 } = require("@ethersproject/keccak256");
require("chai").use(require("chai-as-promised")).should();

describe("KEEPER - function tests", () => {
    let tellor,autopay,accounts,token,blocky;
    let abiCoder = new ethers.utils.AbiCoder();

    const MAXGASCOVER = BigNumber.from((web3.utils.toWei("1")));
    const FUNCTIONSIG = "0x57806e707c9ca4cc348680e2d4637472fc51228a079cb8a6a8cba51fe6f4ebbb3a930c8db9d5e25dabd5f0a48f45f5b6b524bac100df05eaf5311f3e5339ac7c3dd0a37e0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000627abef8"
    const TIMESTAMP = Math.floor(Date.now()/1000);
    const TYPE = "TellorKpr"
    const ARGS = abiCoder.encode(["bytes", "address", "uint256", "uint256", "uint256"],[FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER]);
    const QUERYDATA = abiCoder.encode(["string","bytes"], [TYPE,ARGS])
    const KPRQUERYID = keccak256(QUERYDATA);
    const TIP = web3.utils.toWei("99");
    const JOBID = keccak256(abiCoder.encode(["bytes","address","uint256","uint256","uint256","uint256","uint256","uint256"],[FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER,40,60,TIP]));


    beforeEach(async () => {
        accounts = await ethers.getSigners();
        const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
        tellor = await TellorPlayground.deploy();
        await tellor.deployed();
        const Token = await ethers.getContractFactory("TestToken");
        token = await Token.deploy();
        await token.deployed();
        await token.mint(accounts[0].address, h.toWei("1000"));
        const Autopay = await ethers.getContractFactory("Autopay");
        autopay = await Autopay.deploy(tellor.address, token.address, accounts[0].address, 10);
        await autopay.deployed();
        await token.approve(autopay.address, h.toWei("1000"));
        blocky = await h.getBlock();
        await autopay.tipKeeperJob(FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER,TIP);
        await autopay.initKeeperJob(FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER,40,60,TIP);
        await autopay.fundJob(JOBID,TIP);
    });

    it("constructor", async () => {
        expect(await autopay.master()).to.equal(tellor.address);
        expect(await autopay.token()).to.equal(token.address);
        expect(await autopay.owner()).to.equal(accounts[0].address);
        expect(await autopay.fee()).to.equal(10)
    });

    it("tipKeeperJob", async () => {
        let autopayBalance = await token.balanceOf(autopay.address);
        let acctBeforeBalance = await token.balanceOf(accounts[0].address);
        await autopay.tipKeeperJob(FUNCTIONSIG,accounts[1].address,80001,TIMESTAMP,MAXGASCOVER,TIP);
        let acctBalDiff = MAXGASCOVER.add(TIP);
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

    // it("unclaimedSingleTipsFallback", async () => {
    //     await h.expectThrowMessage(autopay.unclaimedSingleTipsFallback(KPRQUERYID));
    //     h.advanceTime(7258000);
    //     let autopayBefore = await token.balanceOf(autopay.address);
    //     await autopay.unclaimedSingleTipsFallback(KPRQUERYID);
    //     expect(await token.balanceOf(autopay.address)).to.equal(autopayBefore.sub(MAXGASCOVER.add(web3.utils.toWei("1"))));
    // });

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
    });

    it("initKeeperJob", async () => {
        let TIP = web3.utils.toWei("2");
        let JOBID = keccak256(abiCoder.encode(["bytes","address","uint256","uint256","uint256","uint256","uint256","uint256"],[FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER,40,80,TIP]));
        await expect(autopay.initKeeperJob(FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER,40,80,TIP)).to.emit(autopay, "NewKeeperJob").withArgs(accounts[0].address,JOBID,QUERYDATA,TIP);
        let result = await h.expectThrowMessage(autopay.initKeeperJob(FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER,40,80,TIP));
        assert.include(result.message, "job id already exists, fund Job");
    });

    it("fundJob", async () => {
        let contractBal = await token.balanceOf(autopay.address);
        let BAL = await token.balanceOf(accounts[0].address);
        await expect(autopay.fundJob(JOBID,TIP)).to.emit(autopay, "KeeperJobFunded").withArgs(accounts[0].address,TIP,JOBID);
        expect(await token.balanceOf(accounts[0].address)).to.equal(BAL.sub(MAXGASCOVER.add(TIP)));
        expect(await token.balanceOf(autopay.address)).to.equal(contractBal.add(MAXGASCOVER.add(TIP)));
    });

    it("claimJobTips", async () => {
        let TIMESTAMP = blocky.timestamp;// timestamp of when keeper triggered call
        let args = abiCoder.encode(["bytes", "address", "uint256", "uint256", "uint256"],[FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER])
        let QUERYDATA = abiCoder.encode(["string","bytes"],[TYPE,args]);
        let QUERYID = keccak256(QUERYDATA);
        let VAL = abiCoder.encode(["bytes32","address","uint256","uint256"],[keccak256("0x"),accounts[1].address,TIMESTAMP,MAXGASCOVER]);
        let bal = await token.balanceOf(accounts[1].address);
        let ownerBal = await token.balanceOf(autopay.owner())
        await tellor.connect(accounts[1]).submitValue(QUERYID,VAL,0,QUERYDATA);
        let buffer = await h.expectThrowMessage(autopay.claimJobTips(JOBID, TIMESTAMP));
        assert.include(buffer.message, "12 hour buffer not met");
        h.advanceTime(43200); // 12 hour buffer
        await autopay.claimJobTips(JOBID, TIMESTAMP);
        expect(await token.balanceOf(accounts[1].address)).to.equal(bal.add(MAXGASCOVER.add(TIP).sub((MAXGASCOVER.add(TIP).mul(10)).div(1000))));// keeper gets gas + tip minus 1 percent fee
        expect(await token.balanceOf(autopay.owner())).to.equal(ownerBal.add((MAXGASCOVER.add(TIP).mul(10)).div(1000)));// owner collects 1 percent fee
        let paid = await h.expectThrowMessage(autopay.claimJobTips(JOBID,TIMESTAMP));
        assert.include(paid.message, "Already paid!");
    })
});