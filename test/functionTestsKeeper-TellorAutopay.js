const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { BigNumber } = require("ethers");
const { keccak256 } = require("@ethersproject/keccak256");
require("chai").use(require("chai-as-promised")).should();

describe("KEEPER - function tests", () => {
    let tellor,autopay,accounts,blocky,jobParamsList,jobId,queryIdParams,queryData,queryId,
    queryParams,timestamp;
    let abiCoder = new ethers.utils.AbiCoder();
    let maxGasCover = BigNumber.from((web3.utils.toWei("1")));
    let tip = web3.utils.toWei("99");
    let functionSig = "0x57806e707c9ca4cc348680e2d4637472fc51228a079cb8a6a8cba51fe6f4ebbb3a930c8db9d5e25dabd5f0a48f45f5b6b524bac100df05eaf5311f3e5339ac7c3dd0a37e0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000627abef8"
    let TYPE = "TellorKpr"
    let queryIdParamTypes = ["bytes", "address", "uint256", "uint256", "uint256"]
    let jobIdParamTypes = ["bytes","address","uint256","uint256","uint256","uint256","uint256","uint256"]
    let valSubTypes = ["bytes32","address","uint256","uint256"]


    beforeEach(async () => {
        accounts = await ethers.getSigners();
        const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
        tellor = await TellorPlayground.deploy();
        await tellor.deployed();
        await tellor.faucet(accounts[0].address);
        const Autopay = await ethers.getContractFactory("Autopay");
        autopay = await Autopay.deploy(tellor.address, tellor.address, accounts[0].address, 10);
        await autopay.deployed();
        await tellor.approve(autopay.address, h.toWei("1000"));
        timestamp = await h.getBlock();
        blocky = await h.getBlock();
        jobParamsList = [functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,400,600,tip];
        jobId = keccak256(abiCoder.encode(jobIdParamTypes,jobParamsList));
        // let ARGS = abiCoder.encode(queryIdParamTypes,[FUNCTIONSIG,h.zeroAddress,80001,TIMESTAMP,MAXGASCOVER]);
        // let KPRQUERYID = keccak256(QUERYDATA);
        // await autopay.tipKeeperJob();
        // blocky = await h.getBlock();
        
    });

    it("claimJobTips", async () => {
        let fee = ((maxGasCover.add(tip)).mul(await autopay.fee())).div(1000);
        await autopay.initKeeperJob(functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,400,600,tip);
        await autopay.fundJob(jobId,tip);
        let callTime = await h.getBlock();// timestamp of when keeper triggered call
        queryIdParams = [functionSig,h.zeroAddress,80001,callTime.timestamp,maxGasCover]
        queryParams = abiCoder.encode(queryIdParamTypes,queryIdParams);
        queryData = abiCoder.encode(["string","bytes"],[TYPE,queryParams]);
        queryId = keccak256(queryData);
        valSub = abiCoder.encode(valSubTypes,[keccak256("0x"),accounts[1].address,callTime.timestamp,maxGasCover]);
        let keeperBalB4 = await tellor.balanceOf(accounts[1].address);
        let ownerBal = await tellor.balanceOf(autopay.owner())
        await tellor.connect(accounts[1]).submitValue(queryId,valSub,0,queryData);
        let buffer = await h.expectThrowMessage(autopay.claimJobTips(jobId, callTime.timestamp));
        assert.include(buffer.message, "12 hour buffer not met");
        h.advanceTime(43200); // 12 hour buffer
        await autopay.claimJobTips(jobId, callTime.timestamp);
        expect(await tellor.balanceOf(accounts[1].address)).to.equal(keeperBalB4.add(maxGasCover.add(tip).sub((maxGasCover.add(tip).mul(10)).div(1000))));// keeper gets gas + tip minus 1 percent fee
        expect(await tellor.balanceOf(autopay.owner())).to.equal(ownerBal.add(fee));// owner collects 1 percent fee
        let paid = await h.expectThrowMessage(autopay.claimJobTips(jobId,callTime.timestamp));
        assert.include(paid.message, "Already paid!");
    });

    it("continuousJobbyId", async () => {
        await autopay.initKeeperJob(functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,400,600,tip);
        await autopay.fundJob(jobId,tip);
        let detail = await autopay.continuousJobbyId(jobId);
        expect(detail[0]).to.equal(functionSig);
        expect(detail[1]).to.equal(h.zeroAddress);
        expect(detail[2]).to.equal(80001);
        expect(detail[3]).to.equal(blocky.timestamp);
        expect(detail[4]).to.equal(maxGasCover);
        expect(detail[5]).to.equal(400);
        expect(detail[6]).to.equal(600);
        expect(detail[7]).to.equal(tip);
        expect(detail[8]).to.equal(maxGasCover.add(tip));
    });

    it("fundJob", async () => {
        await autopay.initKeeperJob(functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,400,600,tip);
        let autopayBal = await tellor.balanceOf(autopay.address);
        let BAL = await tellor.balanceOf(accounts[0].address);
        await expect(autopay.fundJob(jobId,tip)).to.emit(autopay, "KeeperJobFunded").withArgs(accounts[0].address,tip,jobId);
        expect(await tellor.balanceOf(accounts[0].address)).to.equal(BAL.sub(maxGasCover.add(tip)));
        expect(await tellor.balanceOf(autopay.address)).to.equal(autopayBal.add(maxGasCover.add(tip)));
    });

    it("increaseMaxGasForExistingJob", async () => {
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,tip);
        queryIdParams = [functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover]
        queryParams = abiCoder.encode(queryIdParamTypes,queryIdParams);
        queryData = abiCoder.encode(["string","bytes"],[TYPE,queryParams]);
        let autopayBefore = await tellor.balanceOf(autopay.address);
        await autopay.increaseMaxGasForExistingJob(keccak256(queryData), maxGasCover);
        expect(await tellor.balanceOf(autopay.address)).to.equal(autopayBefore.add(maxGasCover));
        await h.expectThrowMessage(autopay.connect(accounts[1]).increaseMaxGasForExistingJob(keccak256(queryData), maxGasCover)); // Not job creator
    });

    it("initKeeperJob", async () => {
        queryIdParams = [functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover]
        queryParams = abiCoder.encode(queryIdParamTypes,queryIdParams);
        queryData = abiCoder.encode(["string","bytes"],[TYPE,queryParams]);
        let TIP = web3.utils.toWei("2");
        let JOBID = keccak256(abiCoder.encode(jobIdParamTypes,[functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,40,80,TIP]));
        await expect(autopay.initKeeperJob(functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,40,80,TIP)).to.emit(autopay, "NewKeeperJob").withArgs(accounts[0].address,JOBID,queryData,TIP);
        let result = await h.expectThrowMessage(autopay.initKeeperJob(functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,40,80,TIP));
        assert.include(result.message, "job id already exists, fund Job");
    });

    it("keeperClaimTip", async () => {
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover,tip);
        callTime = await h.getBlock();
        queryIdParams = [functionSig,h.zeroAddress,80001,blocky.timestamp,maxGasCover]
        queryParams = abiCoder.encode(queryIdParamTypes,queryIdParams);
        queryData = abiCoder.encode(["string","bytes"],[TYPE,queryParams]);
        let tellorBalB4 = await tellor.balanceOf(tellor.address); // oracle
        let acct1Bal = await tellor.balanceOf(accounts[1].address); // keeper
        let VAL = abiCoder.encode(["bytes32","address","uint256","uint256"],[keccak256("0x"),accounts[1].address,callTime.timestamp,maxGasCover]);
        await tellor.connect(accounts[1]).submitValue(keccak256(queryData),VAL,0,queryData);
        await h.expectThrow(autopay.keeperClaimTip(keccak256(queryData))); // 12 hour buffer
        h.advanceTime(43200)
        await autopay.keeperClaimTip(keccak256(queryData));
        assert(BigInt(await tellor.balanceOf(tellor.address)) > tellorBalB4);// oracle increased balance cause of fee
        assert(BigInt(await tellor.balanceOf(accounts[1].address)) > acct1Bal);
    });

    it("singleJobbyId", async () => {
        callTime = await h.getBlock();
        let args = abiCoder.encode(queryIdParamTypes,[functionSig,h.zeroAddress,80001,callTime.timestamp,maxGasCover])
        queryData = abiCoder.encode(["string","bytes"],[TYPE,args]);
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,80001,callTime.timestamp,maxGasCover,tip);
        let response = await autopay.singleJobbyId(keccak256(queryData));
        expect(response.amount).to.equal(tip);
        expect(response.timestamp).to.equal((await h.getBlock()).timestamp);
        expect(response.timeToCallIt).to.equal(callTime.timestamp);
        expect(response.maxGasRefund).to.equal(maxGasCover);
        expect(response.creator).to.equal(accounts[0].address);
    });

    it("tipKeeperJob", async () => {
        let autopayBalance = await tellor.balanceOf(autopay.address);
        let acctBeforeBalance = await tellor.balanceOf(accounts[0].address);
        await autopay.tipKeeperJob(functionSig,accounts[1].address,80001,blocky.timestamp,maxGasCover,tip);
        let acctBalDiff = maxGasCover.add(tip);
        expect(await tellor.balanceOf(accounts[0].address)).to.equal(acctBeforeBalance.sub(acctBalDiff));
        expect(await tellor.balanceOf(autopay.address)).to.equal(autopayBalance.add(acctBalDiff));
    });
    

//     // it("unclaimedSingleTipsFallback", async () => {
//     //     await h.expectThrowMessage(autopay.unclaimedSingleTipsFallback(KPRQUERYID));
//     //     h.advanceTime(7258000);
//     //     let autopayBefore = await tellor.balanceOf(autopay.address);
//     //     await autopay.unclaimedSingleTipsFallback(KPRQUERYID);
//     //     expect(await tellor.balanceOf(autopay.address)).to.equal(autopayBefore.sub(MAXGASCOVER.add(web3.utils.toWei("1"))));
//     // });
});