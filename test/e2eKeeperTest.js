const {expect,assert} = require("chai");
const {ethers} = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { keccak256 } = require("ethers/lib/utils");
const { BigNumber } = require("ethers");

require("chai").use(require("chai-as-promised")).should();

describe("AutopayKeeper - e2e tests", function() {

    let tellor, autopay, accounts, token, chainId, callTime, result, value, triggerTime, balanceBefore, balanceAfter, message;
    let abiCoder = new ethers.utils.AbiCoder();
    let maxGasFee = web3.utils.toWei("2");
    let tip = web3.utils.toWei("98");
    let functionSig = "0x57806e707c9ca4cc348680e2d4637472fc51228a079cb8a6a8cba51fe6f4ebbb3a930c8db9d5e25dabd5f0a48f45f5b6b524bac100df05eaf5311f3e5339ac7c3dd0a37e0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000627abef8"
    let type = "TellorKpr";
    let types = ["bytes","address","uint256","uint256","uint256"];

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

    it("multiple single tips", async function() {
        // tip qid 1
        callTime = await h.getBlock();
        chainId = 80001;
        await token.approve(autopay.address, h.toWei("1000"));
        let params1 = [functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee];
        let queryData1 = abiCoder.encode(["string","bytes"],[type,abiCoder.encode(types,params1)])
        let queryId1 = keccak256(queryData1);
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee,tip);
        // tip qid 2
        chainId = 137;
        let params2 = [functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee];
        let queryData2 = abiCoder.encode(["string","bytes"],[type,abiCoder.encode(types,params2)])
        let queryId2 = keccak256(queryData2);
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee,tip);
        // tip qid 3
        chainId = 1;
        let params3 = [functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee];
        let queryData3 = abiCoder.encode(["string","bytes"],[type,abiCoder.encode(types,params3)])
        let queryId3 = keccak256(queryData3);
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee,tip);
        result = await autopay.singleJobBalancebyId(queryId3);
        expect(result.amount).to.equal(BigNumber.from(tip));
        // tipping qid 1 again
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee,tip);
        result = await autopay.singleJobBalancebyId(queryId3);
        expect(result.amount).to.equal(BigNumber.from(tip).mul(2));
        expect(result.maxGasRefund).to.equal(BigNumber.from(maxGasFee));
        // tipping qid 1 third time, should increase stored tip by 3
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee,tip);
        result = await autopay.singleJobBalancebyId(queryId3);
        expect(result[0]).to.equal(BigNumber.from(tip).mul(3));
        // submitValue for each qid
        // qid 1
        triggerTime = await h.getBlock()
        value = abiCoder.encode(["bytes32","address","uint256","uint256"],[keccak256("0x"),accounts[1].address,triggerTime.timestamp,maxGasFee]);
        await tellor.connect(accounts[1]).submitValue(queryId1,value,0,queryData1);
        // using different amount of gas
        // check if trigger time before timetocallit
        // qid 2
        let gasPaid = web3.utils.toWei("1")
        triggerTime = await h.getBlock()
        value = abiCoder.encode(["bytes32","address","uint256","uint256"],[keccak256("0x"),accounts[2].address,triggerTime.timestamp,gasPaid]);
        await tellor.connect(accounts[2]).submitValue(queryId2,value,0,queryData2);
        // qid 3
        // called before callTime
        value = abiCoder.encode(["bytes32","address","uint256","uint256"],[keccak256("0x"),accounts[3].address,(callTime.timestamp-1),gasPaid]);
        await tellor.connect(accounts[3]).submitValue(queryId3,value,0,queryData3);

        // claim tip for each id and check balances
        // id 1
        message = await h.expectThrowMessage(autopay.keeperClaimTip(queryId1));
        assert.include(message.message, "12 hour buffer not met");
        h.advanceTime(43200);
        balanceBefore = await token.balanceOf(accounts[1].address);
        await autopay.keeperClaimTip(queryId1);
        balanceAfter = await token.balanceOf(accounts[1].address);
        expect(balanceAfter).to.equal(balanceBefore.add(web3.utils.toWei("99"))); // tip(98) + maxgas(2) minus 1 percent
        message = await h.expectThrowMessage(autopay.keeperClaimTip(queryId1));
        assert.include(message.message, "No tips available")
        result = await autopay.singleJobBalancebyId(queryId1);
        assert(result.amount == 0);

        // id 2
        // check balances if gas paid not equal to maxgas cover.
        balanceBefore = await token.balanceOf(accounts[2].address);
        let ownerBal = await token.balanceOf(accounts[0].address);
        await autopay.keeperClaimTip(queryId2);
        expect(await token.balanceOf(accounts[0].address)).to.equal(ownerBal.add(web3.utils.toWei("1.99"))); // creator gets gas fee remainder, owner gets 1 percent.
        balanceAfter = await token.balanceOf(accounts[2].address);
        expect(balanceAfter).to.equal(balanceBefore.add(web3.utils.toWei("98")).add(web3.utils.toWei("1")).sub(web3.utils.toWei("0.99"))); // keeper gets tip plus gas minus 1 percent

        //id 3
        message = await h.expectThrowMessage(autopay.keeperClaimTip(queryId3));
        assert.include(message.message, "Function called before its time!");
    });
});
