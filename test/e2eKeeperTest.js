const {expect,assert} = require("chai");
const {ethers} = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { keccak256 } = require("ethers/lib/utils");
const { BigNumber } = require("ethers");

require("chai").use(require("chai-as-promised")).should();

describe("AutopayKeeper - e2e tests", function() {

    let tellor, autopay, accounts, chainId, callTime, result, value, 
    triggerTime, balanceBefore, balanceAfter, message, _window, interval, keeperAddress;
    let abiCoder = new ethers.utils.AbiCoder();
    let maxGasFee = BigNumber.from(web3.utils.toWei("2"));
    let tip = BigNumber.from(web3.utils.toWei("98"));
    let functionSig = "0x57806e707c9ca4cc348680e2d4637472fc51228a079cb8a6a8cba51fe6f4ebbb3a930c8db9d5e25dabd5f0a48f45f5b6b524bac100df05eaf5311f3e5339ac7c3dd0a37e0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000627abef8"
    let type = "TellorKpr";
    let types = ["bytes","address","uint256","uint256","uint256"];
    let valSubTypes= ["bytes32","address","uint256","uint256"];
    let fakeTxHash = keccak256("0x");
    let ParamsTypes = ["bytes", "address", "uint256", "uint256", "uint256"];

    beforeEach(async function() {
        accounts = await ethers.getSigners();
        const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
        tellor = await TellorPlayground.deploy();
        await tellor.faucet(accounts[0].address);
        const Autopay = await ethers.getContractFactory("Keeper");
        autopay = await Autopay.deploy(tellor.address, tellor.address, accounts[0].address, 10);
        await autopay.deployed();
    });

    it("multiple single tips, tipKeeperJob, submitValue, claimJobTip", async function() {
        // tip qid 1
        callTime = await h.getBlock();
        chainId = 80001;
        await tellor.approve(autopay.address, h.toWei("1000"));
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
        result = await autopay.singleJobById(queryId3);
        expect(result.amount).to.equal(BigNumber.from(tip));
        // tipping qid 1 again
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee,tip);
        result = await autopay.singleJobById(queryId3);
        expect(result.amount).to.equal(BigNumber.from(tip).mul(2));
        expect(result.maxGasRefund).to.equal(BigNumber.from(maxGasFee));
        // tipping qid 1 third time, should increase stored tip by 3
        await autopay.tipKeeperJob(functionSig,h.zeroAddress,chainId,callTime.timestamp,maxGasFee,tip);
        result = await autopay.singleJobById(queryId3);
        expect(result[0]).to.equal(BigNumber.from(tip).mul(3));
        // submitValue for each qid
        // qid 1
        triggerTime = await h.getBlock()
        value = abiCoder.encode(valSubTypes,[keccak256("0x"),accounts[1].address,triggerTime.timestamp,maxGasFee]);
        await tellor.connect(accounts[1]).submitValue(queryId1,value,0,queryData1);
        // using different amount of gas
        // check if trigger time before timetocallit
        // qid 2
        let gasPaid = web3.utils.toWei("1")
        triggerTime = await h.getBlock()
        value = abiCoder.encode(valSubTypes,[keccak256("0x"),accounts[2].address,triggerTime.timestamp,gasPaid]);
        await tellor.connect(accounts[2]).submitValue(queryId2,value,0,queryData2);
        // qid 3
        // called before callTime
        value = abiCoder.encode(valSubTypes,[keccak256("0x"),accounts[3].address,(callTime.timestamp-1),gasPaid]);
        await tellor.connect(accounts[3]).submitValue(queryId3,value,0,queryData3);

        // claim tip for each id and check balances
        // id 1
        message = await h.expectThrowMessage(autopay.keeperClaimTip(queryId1));
        assert.include(message.message, "12 hour buffer not met");
        h.advanceTime(43200);
        balanceBefore = await tellor.balanceOf(accounts[1].address);
        await autopay.keeperClaimTip(queryId1);
        balanceAfter = await tellor.balanceOf(accounts[1].address);
        expect(balanceAfter).to.equal(balanceBefore.add(web3.utils.toWei("99"))); // tip(98) + maxgas(2) minus 1 percent
        message = await h.expectThrowMessage(autopay.keeperClaimTip(queryId1));
        assert.include(message.message, "No tips available")
        result = await autopay.singleJobById(queryId1);
        assert(result.amount == 0);

        // id 2
        // check balances if gas paid not equal to maxgas cover.
        let fee = tip.add(gasPaid).mul(await autopay.fee()).div(1000);
        balanceBefore = await tellor.balanceOf(accounts[2].address);
        let ownerBal = await tellor.balanceOf(tellor.address);
        await autopay.keeperClaimTip(queryId2);
        expect(await tellor.balanceOf(tellor.address)).to.equal(ownerBal.add(fee)); // creator gets gas fee remainder, owner gets 1 percent.
        balanceAfter = await tellor.balanceOf(accounts[2].address);
        expect(balanceAfter).to.equal(balanceBefore.add(tip.add(gasPaid).sub(fee))); // keeper gets tip plus gas minus 1 percent
        //id 3
        message = await h.expectThrowMessage(autopay.keeperClaimTip(queryId3));
        assert.include(message.message, "Function called before its time!");
        
    });

    it("continuous job flow", async function() {
        await tellor.approve(autopay.address, h.toWei("1000"));
        let jobId;
        let blocky = await h.getBlock();
        let paramTypes = ["bytes","address","uint256","uint256","uint256","uint256","uint256","uint256"];
        chainId = 80001;
        _window = 40;
        interval =  80;

        let jobIdParams1 = [functionSig,h.zeroAddress,chainId,blocky.timestamp,maxGasFee,_window,interval,tip];
        jobId = keccak256(abiCoder.encode(paramTypes,jobIdParams1));
        await autopay.initKeeperJob(functionSig,h.zeroAddress,chainId,blocky.timestamp,maxGasFee,_window,interval,tip);
        let detail = await autopay.continuousJobById(jobId);
        expect(detail[0]).to.equal(functionSig);
        expect(detail[1]).to.equal(h.zeroAddress);
        expect(detail[2]).to.equal(chainId);
        expect(detail[3]).to.equal(blocky.timestamp);
        expect(detail[4]).to.equal(maxGasFee);
        expect(detail[5]).to.equal(_window);
        expect(detail[6]).to.equal(interval);
        expect(detail[7]).to.equal(tip);
        expect(detail[8]).to.equal(0);
        // init an existing job
        message = await h.expectThrowMessage(autopay.initKeeperJob(functionSig,h.zeroAddress,chainId,blocky.timestamp,maxGasFee,_window,interval,tip));
        assert.include(message.message, "job id already exists, fund Job");
        // init job with no rewards
        message = await h.expectThrowMessage(autopay.initKeeperJob(functionSig,h.zeroAddress,0,blocky.timestamp,maxGasFee,_window,interval,0));
        assert.include(message.message,  "No free keeping");
        // init job with window > interval
        let badWindow = 60;
        let badInterval = 40;
        message = await h.expectThrowMessage(autopay.initKeeperJob(functionSig,h.zeroAddress,chainId,blocky.timestamp,maxGasFee,badWindow,badInterval,tip));
        assert.include(message.message,  "Interval has to be greater than window");
        // fund job with that doesn't cover gas
        message = await h.expectThrowMessage(autopay.fundJob(jobId,web3.utils.toWei("1")));
        assert.include(message.message, "Not enough to cover payment")
        // fund a job once
        await autopay.fundJob(jobId,tip);
        // check balance incrementing
        let bal1 = await autopay.continuousJobById(jobId);
        expect((bal1)[8]).to.equal(maxGasFee.add(tip));
        // fund job that hasn't been setup
        // different chain id to change query Id
        let badJobIdParams = [functionSig,h.zeroAddress,0,blocky.timestamp,maxGasFee,_window,interval,tip];
        let badJobId = keccak256(abiCoder.encode(paramTypes,badJobIdParams));
        message =  await h.expectThrowMessage(autopay.fundJob(badJobId,tip));
        assert.include(message.message, "Job not initiated");
        // add tip to an existing job 
        // check balance incrementing
        await autopay.fundJob(jobId,tip);
        detail = await autopay.continuousJobById(jobId);
        expect(detail[8]).to.equal(BigNumber.from(bal1[8]).add(tip.add(maxGasFee)));
        // funded job twice so balance should be equal to tip times 2
        expect(detail[8]).to.equal((maxGasFee.add(tip)).mul(2));
        // submitValue
        // val = tx hash, keeper address, timestamp call, gas paid;
        // Value to submit to oracle after job is done
        keeperAddress = accounts[10].address;
        let triggerTimestamp = await h.getBlock();
        let gasConsumed = maxGasFee; // if used max gas;
        // value submission in bytes
        let valSubmission = abiCoder.encode(valSubTypes,[fakeTxHash,keeperAddress,triggerTimestamp.timestamp,gasConsumed]);
        let Args = [functionSig,h.zeroAddress,chainId,triggerTimestamp.timestamp,maxGasFee];
        let QueryDataArgs = abiCoder.encode(ParamsTypes,Args);
        let QueryData = abiCoder.encode(["string","bytes"],["TellorKpr",QueryDataArgs]);
        queryId = keccak256(QueryData);
        // queryId for submitValue is generated using the timestamp of when function was triggered
        // not the timestamp of when submitValue was triggered
        // this way autopay will generate a unique ids
        // helps with tip going to right person
        await tellor.connect(accounts[4]).submitValue(queryId,valSubmission,0,QueryData);
        message = await h.expectThrowMessage(autopay.claimJobTips(jobId, triggerTimestamp.timestamp));
        assert.include(message.message, "12 hour buffer not met");
        h.advanceTime(43200);
        let keepBalB4 = await tellor.balanceOf(keeperAddress);
        let detailB4Claim = await autopay.continuousJobById(jobId);
        // use triggerTimestamp when claiming a tip
        // allows query id to match with query id of value submission on the oracle
        await autopay.claimJobTips(jobId, triggerTimestamp.timestamp);
        expect(await tellor.balanceOf(keeperAddress)).to.equal(keepBalB4.add(gasConsumed.add(tip).sub(web3.utils.toWei("1"))));
        // trying to claim for same job
        message = await h.expectThrowMessage(autopay.claimJobTips(jobId, triggerTimestamp.timestamp));
        assert.include(message.message, "Already paid!");
        // check remaining job balance decrmenting
        detail = await autopay.continuousJobById(jobId);
        expect(detail[8]).to.equal(detailB4Claim[8].sub(tip.add(maxGasFee)));
        // claim remaining balance with submission that consumed less gas
        // gas remainder goes to owner.
        let ownerBalB4 = await tellor.balanceOf(accounts[0].address);
        keepBalB4 = await tellor.balanceOf(accounts[10].address);
        triggerTimestamp = await h.getBlock();
        gasConsumed = gasConsumed.sub(web3.utils.toWei("1"));
        valSubmission = abiCoder.encode(valSubTypes,[fakeTxHash,keeperAddress,triggerTimestamp.timestamp,gasConsumed]);
        Args = [functionSig,h.zeroAddress,chainId,triggerTimestamp.timestamp,maxGasFee];
        QueryDataArgs = abiCoder.encode(ParamsTypes,Args);
        QueryData = abiCoder.encode(["string","bytes"],["TellorKpr",QueryDataArgs]);
        queryId = keccak256(QueryData);
        
        await tellor.connect(accounts[4]).submitValue(queryId,valSubmission,0,QueryData);
        h.advanceTime(43300);
        await autopay.claimJobTips(jobId, triggerTimestamp.timestamp);
        detail = await autopay.continuousJobById(jobId);
        expect(detail[8]).to.equal(0);
        let fee = ((tip.add(gasConsumed)).mul(await autopay.fee())).div(1000);
        expect(await tellor.balanceOf(accounts[10].address)).to.equal(keepBalB4.add((tip.add(gasConsumed)).sub(fee)));
        expect(await tellor.balanceOf(accounts[0].address)).to.equal((ownerBalB4.add(maxGasFee.sub(gasConsumed))).add(fee));
    });

    it("fund job multiple times", async () => {
        let Args, QueryData, QueryDataArgs, gasConsumed;
        keeperAddress = accounts[11].address;
        await tellor.approve(autopay.address, h.toWei("1000"));
        for(i=0; i < 10; i++){
            await tellor.faucet(accounts[i+1].address);
            await tellor.connect(accounts[i+1]).approve(autopay.address, h.toWei("100"));
        }
        let jobId;
        let blocky = await h.getBlock();
        let paramTypes = ["bytes","address","uint256","uint256","uint256","uint256","uint256","uint256"];
        chainId = 80001;
        _window = 40;
        interval =  80;

        let jobIdParams1 = [functionSig,h.zeroAddress,chainId,blocky.timestamp,maxGasFee,_window,interval,tip];
        jobId = keccak256(abiCoder.encode(paramTypes,jobIdParams1));
        await autopay.initKeeperJob(functionSig,h.zeroAddress,chainId,blocky.timestamp,maxGasFee,_window,interval,tip);
        let detail = await autopay.continuousJobById(jobId);
        expect(detail[0]).to.equal(functionSig);
        expect(detail[1]).to.equal(h.zeroAddress);
        expect(detail[2]).to.equal(chainId);
        expect(detail[3]).to.equal(blocky.timestamp);
        expect(detail[4]).to.equal(maxGasFee);
        expect(detail[5]).to.equal(_window);
        expect(detail[6]).to.equal(interval);
        expect(detail[7]).to.equal(tip);
        expect(detail[8]).to.equal(0);

        for(i=0; i < 10; i++){
            await autopay.connect(accounts[i+1]).fundJob(jobId,tip);
            assert(await autopay.gasPaymentListCount() == i+1); //Job funders count
        }
        
        triggerTimestamp = await h.getBlock();
        for(i=0; i < 10; i++){
            gasConsumed = h.toWei((i+1).toString());// different gas consumption, only first address will get gas remainder
            valSubmission = abiCoder.encode(valSubTypes,[fakeTxHash,keeperAddress,(triggerTimestamp.timestamp)+(i+10),gasConsumed]);
            Args = [functionSig,h.zeroAddress,chainId,(triggerTimestamp.timestamp)+(i+10),maxGasFee];
            QueryDataArgs = abiCoder.encode(ParamsTypes,Args);
            QueryData = abiCoder.encode(["string","bytes"],["TellorKpr",QueryDataArgs]);
            queryId = keccak256(QueryData);
            await tellor.submitValue(queryId,valSubmission,0,QueryData);
        }
        h.advanceTime(43300);
        for(i=0; i < 10; i++){
            if(BigInt(h.toWei((i+1).toString())) <= BigInt(maxGasFee)){
                gasConsumed = BigInt(h.toWei((i+1).toString()));
            }else{
                gasConsumed = maxGasFee;
            }
            let fee = ((tip.add(gasConsumed)).mul(await autopay.fee())).div(1000);
            keepBalB4 = await tellor.balanceOf(accounts[11].address);
            let funderBalB4 = await tellor.balanceOf(accounts[i+1].address);
            await autopay.claimJobTips(jobId,(triggerTimestamp.timestamp)+(i+10));
            expect(await tellor.balanceOf(accounts[11].address)).to.equal(keepBalB4.add((tip.add(gasConsumed)).sub(fee)));
            expect(await tellor.balanceOf(accounts[i+1].address)).to.equal(funderBalB4.add(maxGasFee.sub(gasConsumed)));
        }


    });
});
