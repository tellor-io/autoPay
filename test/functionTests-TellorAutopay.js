const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { keccak256 } = require("@ethersproject/keccak256");
require("chai").use(require("chai-as-promised")).should();

describe("Autopay - function tests", () => {
  let tellor,autopay,accounts,firstBlocky,blocky,dataFeedBefore,bytesId,queryDataStorage;
  let array = [];
  let badArray = [];
  let abiCoder = new ethers.utils.AbiCoder();
  const QUERYID2 = h.uintTob32(2);
  const FEE = 10
  const TRB_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["trb", "usd"])
  const TRB_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", TRB_QUERY_DATA_ARGS])
  const TRB_QUERY_ID = keccak256(TRB_QUERY_DATA)
  const ETH_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"])
  const ETH_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_QUERY_DATA_ARGS])
  const ETH_QUERY_ID = keccak256(ETH_QUERY_DATA)
  const BTC_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["btc", "usd"])
  const BTC_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", BTC_QUERY_DATA_ARGS])
  const BTC_QUERY_ID = keccak256(BTC_QUERY_DATA)
  const DOGE_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["doge", "usd"])
  const DOGE_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", DOGE_QUERY_DATA_ARGS])
  const DOGE_QUERY_ID = keccak256(DOGE_QUERY_DATA)
  const LTC_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["ltc", "usd"])
  const LTC_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", LTC_QUERY_DATA_ARGS])
  const LTC_QUERY_ID = keccak256(LTC_QUERY_DATA)

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
    tellor = await TellorPlayground.deploy();
    await tellor.deployed();
    for(i=0; i<2; i++){await tellor.faucet(accounts[0].address);}
    const QueryDataStorage = await ethers.getContractFactory("QueryDataStorage");
    queryDataStorage = await QueryDataStorage.deploy();
    await queryDataStorage.deployed();
    const Autopay = await ethers.getContractFactory("AutopayMock");
    autopay = await Autopay.deploy(tellor.address, queryDataStorage.address, FEE);
    await autopay.deployed();
    firstBlocky = await h.getBlock();
    await autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600,600,0,0,ETH_QUERY_DATA,0);
    bytesId = keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600,600,0,0]));
    await tellor.approve(autopay.address, h.toWei("1000"));
    await autopay.fundFeed(bytesId, ETH_QUERY_ID, h.toWei("1000"));
    payerBefore = await autopay.getDataFeed(bytesId);
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(3500), 0, ETH_QUERY_DATA);
    blocky = await h.getBlock();
    array[0] = blocky.timestamp;
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3525), 0, ETH_QUERY_DATA);
    blocky = await h.getBlock();
    badArray[0] = blocky.timestamp;
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    h.advanceTime(3600);
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky = await h.getBlock();
    array[1] = blocky.timestamp;
    badArray[1] = blocky.timestamp;
    h.advanceTime(3600);
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(3575), 0, ETH_QUERY_DATA);
    blocky = await h.getBlock();
    array[2] = blocky.timestamp;
  });

  it("constructor", async () => {
    expect(await autopay.tellor()).to.equal(tellor.address);
    expect(await autopay.token()).to.equal(tellor.address);
    expect(await autopay.queryDataStorage()).to.equal(queryDataStorage.address);
    expect(await autopay.fee()).to.equal(10)
  });
  
  it("claimTip - require statements", async function() {
    // **ERROR MSG: no tips submitted for this queryId
    fakeFeedId = h.hash("fakeFeedId");
    fakeQueryId = h.hash("fakeQueryId");
    result = await h.expectThrowMessage(autopay.claimTip(fakeFeedId, fakeQueryId, [1234]));
    assert.include(result.message, "no funds available for this feed");
    // **ERROR MSG: buffer time has not passed
    result = await h.expectThrowMessage(autopay.connect(accounts[1]).claimTip(bytesId, ETH_QUERY_ID, array));
    assert.include(result.message, "buffer time has not passed");
    // **ERROR MSG: message sender not reporter for given queryId and timestamp
    await h.advanceTime(43200);
    result = await h.expectThrowMessage(autopay.claimTip(bytesId, ETH_QUERY_ID, array));
    assert.include(result.message, "message sender not reporter for given queryId and timestamp");
    // **ERROR MSG: reward already claimed
    await autopay.connect(accounts[1]).claimTip(bytesId, ETH_QUERY_ID, [array[0]]);
    result = await h.expectThrowMessage(autopay.connect(accounts[1]).claimTip(bytesId, ETH_QUERY_ID, [array[0]]));
    assert.include(result.message, "reward already claimed");
    // **ERROR MSG: no value exists at timestamp
    await tellor.beginDispute(ETH_QUERY_ID, array[1])
    result = await h.expectThrowMessage(autopay.connect(accounts[1]).claimTip(bytesId, ETH_QUERY_ID, [array[1]]));
    assert.include(result.message, "no value exists at timestamp");
    // **ERROR MSG: price threshold not met
    await autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600000,2,10000,0,ETH_QUERY_DATA,0);
    feedIdPriceThreshold = keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600000,2,10000,0]));
    await tellor.approve(autopay.address, h.toWei("1000"));
    await autopay.fundFeed(feedIdPriceThreshold, ETH_QUERY_ID, h.toWei("1"));
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(3500), 0, ETH_QUERY_DATA);
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(3501), 0, ETH_QUERY_DATA);
    blockyPT = await h.getBlock();
    await h.advanceTime(43200);
    result = await h.expectThrowMessage(autopay.connect(accounts[1]).claimTip(feedIdPriceThreshold, ETH_QUERY_ID, [blockyPT.timestamp]));
    assert.include(result.message, "price threshold not met");
     // **ERROR MSG: insufficient balance for all submitted timestamps
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(35000), 0, ETH_QUERY_DATA);
    blockyPT1 = await h.getBlock();
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(350000), 0, ETH_QUERY_DATA);
    blockyPT2 = await h.getBlock();
    await h.advanceTime(43200);
    result = await h.expectThrowMessage(autopay.connect(accounts[1]).claimTip(feedIdPriceThreshold, ETH_QUERY_ID, [blockyPT1.timestamp, blockyPT2.timestamp])); 
    assert.include(result.message, "insufficient balance for all submitted timestamps");
    // **ERROR MSG: timestamp too old to claim tip
    await h.advanceTime(86400 * 7 * 4 * 6)
    result = await h.expectThrowMessage(autopay.connect(accounts[1]).claimTip(bytesId, ETH_QUERY_ID, [array[2]]));
    assert.include(result.message, "timestamp too old to claim tip");
  })

  it("claimTip", async () => {
    // Advancing time 12 hours to satisfy hardcoded buffer time.
    await h.advanceTime(43200);
    await expect(autopay.connect(accounts[1]).claimTip(bytesId, ETH_QUERY_ID, array)).to.emit(autopay, "TipClaimed").withArgs(bytesId, ETH_QUERY_ID, (h.toWei("3")), accounts[1].address);
    let payerAfter = await autopay.getDataFeed(bytesId);
    expect(payerBefore.balance).to.not.equal(payerAfter.balance);
    expect(payerAfter.balance).to.equal(h.toWei("997"));
    // Updating Balance Checks
    // 1% of each tip being shaved for Tellor ~= .01 token/tip claimed
    // That's why tellor balance is .03 lower than originally expected.
    expect(await tellor.balanceOf(accounts[1].address)).to.equal(h.toWei("2.97"));
    // Checking if owner (Tellor) account was updated by fee amount (0.03)
    expect(await tellor.balanceOf(await tellor.address)).to.equal(h.toWei("0.03"));
    expect(await tellor.balanceOf(autopay.address)).to.equal(h.toWei("997"));
  });
  
  it("_getRewardAmount", async () => {
    h.advanceTime(43200);
    blocky = await h.getBlock();
    await autopay.connect(accounts[10]).setupDataFeed(ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,3600,600,0,0,ETH_QUERY_DATA,0);
    bytesId0 = keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,3600,600,0,0]));
    await tellor.approve(autopay.address, h.toWei("100"));
    await autopay.fundFeed(bytesId0, ETH_QUERY_ID, h.toWei("100"));
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    let goodBlocky = await h.getBlock();
    h.advanceTime(43201);
    // Variable updates
    dataFeedBefore = await autopay.getDataFeed(bytesId0);
    await autopay.connect(accounts[1]).claimTip(bytesId0, ETH_QUERY_ID, [goodBlocky.timestamp]);
    dataFeedAfter = await autopay.getDataFeed(bytesId0);
    claimedStatus = await autopay.getRewardClaimedStatus(bytesId0,ETH_QUERY_ID,goodBlocky.timestamp);
    expect(dataFeedAfter.balance).to.equal(h.toWei("99"));
    expect(claimedStatus).to.be.true;
  });
  
  it("fundFeed", async () => {
    let result;
    let dataFeedDetails;
    //REQUIRE CHECKS
    // require(_feed.reward > 0,"feed not set up");
    result = await h.expectThrowMessage(autopay.fundFeed(bytesId, QUERYID2, h.toWei("1000000")));
    assert.include(result.message, "feed not set up");
    // require(_amount > 0, "must be sending an amount");
    result = await h.expectThrowMessage(autopay.fundFeed(bytesId, ETH_QUERY_ID, 0));
    assert.include(result.message, "must be sending an amount");
    // require(IERC20(_feed.tellor).transferFrom(msg.sender,address(this),_amount),"ERC20: transfer amount exceeds balance");
    result = await h.expectThrowMessage(autopay.fundFeed(bytesId, ETH_QUERY_ID, h.toWei("1000300")));
    assert.include(result.message, "Arithmetic operation underflowed or overflowed outside of an unchecked block") // real message returned
    //VARIABLE UPDATES
    // _feed.balance += _amount;
    dataFeedDetails = await autopay.getDataFeed(bytesId);
    expect(dataFeedDetails.balance).to.equal(h.toWei("1000"));
    //EVENT DETAILS
    // emit DataFeedFunded(_feedId,_queryId,_amount,_feedFunder);
    await tellor.approve(autopay.address, h.toWei("100"));
    let initBal = await tellor.balanceOf(autopay.address)
    await expect(autopay.fundFeed(bytesId, ETH_QUERY_ID, h.toWei("10"))).to.emit(autopay, "DataFeedFunded").withArgs(bytesId, ETH_QUERY_ID, h.toWei("10"), accounts[0].address, [web3.utils.toWei("1"), h.toWei("1010"), firstBlocky.timestamp, 3600, 600, 0, 0, 1]);
    expect(await tellor.balanceOf(autopay.address) - initBal == h.toWei("10"), "balance should change")
  });
  
  it("setupDataFeed", async () => {
    //**ERROR MSG: id must be hash of bytes data
    result = await h.expectThrowMessage(autopay.setupDataFeed(h.uintTob32(200),h.toWei("1"),blocky.timestamp,3600,600,0,0,ETH_QUERY_DATA,0));//must be hash
    assert.include(result.message, "id must be hash of bytes data");
    //**ERROR MSG: reward must be greater than zero
    result = await h.expectThrowMessage(autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("0"),blocky.timestamp,3600,600,0,0,ETH_QUERY_DATA,0));//reward is zero
    assert.include(result.message, "reward must be greater than zero");
    //**ERROR MSG: feed must not be set up already
    await autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,601,600,0,0,ETH_QUERY_DATA,0);
    result = await h.expectThrowMessage(autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,601,600,0,0,ETH_QUERY_DATA,0));//already set up
    assert.include(result.message, "feed must not be set up already");
    //**ERROR MSG: window must be less than interval length
    result = await h.expectThrowMessage(autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,600,3600,0,0,ETH_QUERY_DATA,0));//interval > window
    assert.include(result.message, "window must be less than interval length");
    //**ERROR MSG: interval must be greater than zero
    result = await h.expectThrowMessage(autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,0,600,0,0,ETH_QUERY_DATA,0));//interval is zero
    assert.include(result.message, "interval must be greater than zero");
    
    // first, simulate call with callStatic to retrieve feedId returned by setupDataFeed
    feedIdRetrieved = await autopay.callStatic.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600,600,1,3,ETH_QUERY_DATA,0);
    await autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600,600,1,3,ETH_QUERY_DATA,0);
    feedId = keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600,600,1,3]));
    assert(feedId == feedIdRetrieved, "setupDataFeed should return the feedId");
    result = await autopay.getDataFeed(feedId);
    expect(result.reward).to.equal(h.toWei("1"))
    expect(result.balance).to.equal(0);
    expect(result.startTime).to.equal(firstBlocky.timestamp);
    expect(result.interval).to.equal(3600);
    expect(result.window).to.equal(600);
    expect(result.priceThreshold).to.equal(1);
    expect(result.rewardIncreasePerSecond).to.equal(3);
    expect(result.feedsWithFundingIndex).to.equal(0);
    await tellor.approve(autopay.address, h.toWei("100"));
    await autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,7600,600,2,4,ETH_QUERY_DATA,h.toWei("10"));

    queryDataArgs = abiCoder.encode(["string", "string"], ["btc", "usd"]);
    queryData = abiCoder.encode(["string", "bytes"], ["SpotPrice", queryDataArgs]);
    queryId = keccak256(queryData);

    await autopay.setupDataFeed(queryId,h.toWei("1"),firstBlocky.timestamp,3600,600,1,3,queryData,0);
    storedQueryData = await queryDataStorage.getQueryData(queryId);
    assert(storedQueryData == queryData, "query data not stored correctly");

    // setup second feed for same query id
    await autopay.setupDataFeed(queryId,h.toWei("1"),firstBlocky.timestamp,3600,1200,1,3,queryData,0);
    storedQueryData = await queryDataStorage.getQueryData(queryId);
    assert(storedQueryData == queryData, "query data not stored correctly");
  });
  it("getRewardClaimedStatus", async () => {
    let v =  array[0]
    result = await autopay.getRewardClaimedStatus(bytesId,ETH_QUERY_ID,v);
    expect(result).to.be.false;
    h.advanceTime(86400)
    await autopay.connect(accounts[1]).claimTip(bytesId, ETH_QUERY_ID, [v]);
    result = await autopay.getRewardClaimedStatus(bytesId,ETH_QUERY_ID,v);
    expect(result).to.be.true;
  });
  it("tip", async () => {
    await tellor.faucet(accounts[0].address)
    await h.expectThrow(autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA));
    await tellor.approve(autopay.address,web3.utils.toWei("1000"))
    await h.expectThrow(autopay.tip(h.uintTob32(200),web3.utils.toWei("100"),'0x')) //must be hash
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    let res = await autopay.getCurrentTip(ETH_QUERY_ID);
    assert(res == web3.utils.toWei("100"), "tip 1nshould be correct")
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("200"),ETH_QUERY_DATA)
    res = await autopay.getCurrentTip(ETH_QUERY_ID);
    assert(res == web3.utils.toWei("200"), "tip 2 should be correct")
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("300"),ETH_QUERY_DATA)
    res = await autopay.getCurrentTip(ETH_QUERY_ID);
    assert(res == web3.utils.toWei("500"), "tip 3 should be correct")
    // test query data storage
    queryDataArgs = abiCoder.encode(["string", "string"], ["btc", "usd"]);
    queryData = abiCoder.encode(["string", "bytes"], ["SpotPrice", queryDataArgs]);
    queryId = keccak256(queryData);
    await autopay.tip(queryId,web3.utils.toWei("10"),queryData)
    storedQueryData = await queryDataStorage.getQueryData(queryId);
    assert(storedQueryData == queryData, "query data not stored correctly");
    await autopay.tip(queryId,web3.utils.toWei("10"),queryData)
    storedQueryData = await queryDataStorage.getQueryData(queryId);
    assert(storedQueryData == queryData, "query data not stored correctly");
    await tellor.connect(accounts[2]).submitValue(queryId, h.uintTob32(3550), 0, queryData);
    await autopay.tip(queryId,web3.utils.toWei("10"),queryData)
    storedQueryData = await queryDataStorage.getQueryData(queryId);
    assert(storedQueryData == queryData, "query data not stored correctly");
  }); 
  it("claimOneTimeTip - require statements", async () => {
    // **** 1) test require statements: ****
    // **ERROR MSG: no tips submitted for this queryId
    result = await h.expectThrowMessage(autopay.claimOneTimeTip(ETH_QUERY_ID,[12345]));
    assert.include(result.message, "no tips submitted for this queryId")
    // **ERROR MSG: buffer time has not passed
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("1"),ETH_QUERY_DATA)
    await tellor.connect(accounts[4]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky0 = await h.getBlock()
    result = await h.expectThrowMessage(autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID,[blocky0.timestamp]));
    assert.include(result.message, "buffer time has not passed")
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID,[blocky0.timestamp])
    // **ERROR MSG: value disputed
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("1"),ETH_QUERY_DATA)
    await tellor.connect(accounts[4]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock()
    await h.advanceTime(86400/2)
    await tellor.beginDispute(ETH_QUERY_ID, blocky1.timestamp)
    // await autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID,[blocky1.timestamp])
    result = await h.expectThrowMessage(autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID, [blocky1.timestamp]))
    assert.include(result.message, "value disputed")
    // **ERROR MSG: msg sender must be reporter address
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("1"),ETH_QUERY_DATA)
    await tellor.connect(accounts[4]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky2 = await h.getBlock()
    await h.advanceTime(86400/2)
    result = await h.expectThrowMessage(autopay.connect(accounts[3]).claimOneTimeTip(ETH_QUERY_ID, [blocky2.timestamp]))
    assert.include(result.message, "msg sender must be reporter address")
    await autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID, [blocky2.timestamp])
    // **ERROR MSG: tip earned by previous submission
    await autopay.tip(ETH_QUERY_ID, h.toWei("1"), ETH_QUERY_DATA)
    await tellor.connect(accounts[4]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky3 = await h.getBlock()
    await tellor.connect(accounts[4]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky4 = await h.getBlock()
    await h.advanceTime(86400/2)
    result = await h.expectThrowMessage(autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID, [blocky4.timestamp]))
    assert.include(result.message, "tip earned by previous submission")
    await autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID, [blocky3.timestamp])
    // **ERROR MSG: timestamp not eligible for tip
    await tellor.connect(accounts[4]).submitValue(h.hash(h.bytes("hello")), h.uintTob32(3550), 0, h.bytes("hello"))
    blocky5 = await h.getBlock()
    await autopay.tip(h.hash(h.bytes("hello")), h.toWei("1"), h.bytes("hello"))
    await tellor.connect(accounts[4]).submitValue(h.hash(h.bytes("hello")), h.uintTob32(3550), 0, h.bytes("hello"))
    blocky6 = await h.getBlock()
    await h.advanceTime(86400/2)
    result = await h.expectThrowMessage(autopay.connect(accounts[4]).claimOneTimeTip(h.hash(h.bytes("hello")), [blocky5.timestamp]))
    assert.include(result.message, "timestamp not eligible for tip")
    await autopay.connect(accounts[4]).claimOneTimeTip(h.hash(h.bytes("hello")), [blocky6.timestamp])
    // **ERROR MSG: tip already claimed
    result = await h.expectThrowMessage(autopay.connect(accounts[4]).claimOneTimeTip(h.hash(h.bytes("hello")), [blocky6.timestamp]))
    assert.include(result.message, "tip already claimed")
  });
  
  it("claimOneTimeTip", async () => {
    let startBal = await tellor.balanceOf(accounts[2].address);
    await tellor.connect(accounts[4]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock();
    await h.expectThrow(autopay.claimOneTimeTip(ETH_QUERY_ID,[blocky1.timestamp]));
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    await h.expectThrow(autopay.connect(accounts[4]).claimOneTimeTip(ETH_QUERY_ID,[blocky1.timestamp]));//timestamp not eligible
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky = await h.getBlock();
    await h.advanceTime(3600 * 12)
    await autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID,[blocky.timestamp])
    let res = await autopay.getCurrentTip(ETH_QUERY_ID);
    assert(res == 0, "tip should be correct")
    let finBal = await tellor.balanceOf(accounts[2].address);
    assert(finBal - startBal == web3.utils.toWei("99"), "balance should change correctly")
  });

  it("getDataFeed", async () => {
    result = await autopay.getDataFeed(bytesId);
    expect(result[0]).to.equal(h.toWei("1"));
    expect(result[1]).to.equal(h.toWei("1000"));
    expect(result[2]).to.equal(firstBlocky.timestamp);
    expect(result[3]).to.equal(3600);
    expect(result[4]).to.equal(600);
    expect(result[5]).to.equal(0);
    expect(result[6]).to.equal(0);
  });
  it("getCurrentTip", async () => {
    let res = await autopay.getCurrentTip(ETH_QUERY_ID);
    assert(res == 0, "tip amount should be zero")
    await h.expectThrow(autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA));
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    res = await autopay.getCurrentTip(ETH_QUERY_ID);
    assert(res == web3.utils.toWei("100"), "tip should be correct")
  });
  it("getPastTips", async () => {
    await tellor.faucet(accounts[0].address)
    let res = await autopay.getPastTips(ETH_QUERY_ID)
    assert(res.length == 0, "should be no tips",)
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    let blocky1 = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    await tellor.approve(autopay.address,web3.utils.toWei("200"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("200"),ETH_QUERY_DATA)
    let blocky2 = await h.getBlock();
    res = await autopay.getPastTips(ETH_QUERY_ID)
    assert(res[0][0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[0][1] == blocky1.timestamp + 1, "past tip timestamp should be correct")
    assert(res[1][0] == web3.utils.toWei("200"), "past tip amount should be correct")
    assert(res[1][1] == blocky2.timestamp + 1, "past tip timestamp should be correct")
    await tellor.approve(autopay.address,web3.utils.toWei("300"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("300"),ETH_QUERY_DATA)
    let blocky3 = await h.getBlock();
    res = await autopay.getPastTips(ETH_QUERY_ID)
    assert(res[0][0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[0][1] == blocky1.timestamp + 1, "past tip 1 timestamp should be correct")
    assert(res[1][0] == web3.utils.toWei("500"), "past tip amount 2 should be correct")
    assert(res[1][1] == blocky3.timestamp + 1, "past tip 2 timestamp should be correct")
    assert(res.length == 2, "length should be correct")
  });
  it("getPastTipByIndex", async () => {
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    let blocky1 = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    await tellor.approve(autopay.address,web3.utils.toWei("200"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("200"),ETH_QUERY_DATA)
    let blocky2 = await h.getBlock();
    res = await autopay.getPastTipByIndex(ETH_QUERY_ID,0)
    assert(res[0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[1] == blocky1.timestamp + 1, "past tip amount should be correct")
    res = await autopay.getPastTipByIndex(ETH_QUERY_ID,1)
    assert(res[0] == web3.utils.toWei("200"), "past tip amount should be correct")
    assert(res[1] == blocky2.timestamp + 1, "past tip amount should be correct")
    await tellor.approve(autopay.address,web3.utils.toWei("300"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("300"),ETH_QUERY_DATA)
    let blocky3 = await h.getBlock();
    res = await autopay.getPastTipByIndex(ETH_QUERY_ID,0)
    assert(res[0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[1] == blocky1.timestamp + 1, "past tip 1 timestamp should be correct")
    res = await autopay.getPastTipByIndex(ETH_QUERY_ID,1)
    assert(res[0] == web3.utils.toWei("500"), "past tip amount 2 should be correct")
    assert(res[1] == blocky3.timestamp + 1, "past tip 2 timestamp should be correct")
  });
  it("getPastTipCount", async () => {
    let res = await autopay.getPastTipCount(ETH_QUERY_ID)
    assert(res == 0, "past tip count should be correct")
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    res = await autopay.getPastTipCount(ETH_QUERY_ID)
    assert(res == 2, "past tip count2  should be correct")
    await tellor.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    res = await autopay.getPastTipCount(ETH_QUERY_ID)
    assert(res == 2, "past tip count 3 should be correct")
  });
  it("getFundedFeeds", async () => {
    // Check one existing funded feed
    let feedIds = await autopay.getFundedFeeds()
    assert(feedIds.length == 1, "should be one funded feed from previous test")
    let qId = await autopay.getQueryIdFromFeedId(feedIds[0])
    assert(qId == ETH_QUERY_ID, "incorrect query ID")

    // Check adding two funded feeds
    let feedId3 = keccak256(abiCoder.encode(
      ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [DOGE_QUERY_ID,h.toWei("1"),blocky.timestamp,600,400,0,0]
    ));
    let feedId4 = keccak256(abiCoder.encode(
      ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [LTC_QUERY_ID,h.toWei("1"),blocky.timestamp,600,400,0,0]
    ));
    await autopay.setupDataFeed(DOGE_QUERY_ID,h.toWei("1"),blocky.timestamp,600,400,0,0,DOGE_QUERY_DATA,0);
    await autopay.setupDataFeed(LTC_QUERY_ID,h.toWei("1"),blocky.timestamp,600,400,0,0,LTC_QUERY_DATA,0);
    await tellor.approve(autopay.address, h.toWei("2"));
    await autopay.fundFeed(feedId3,DOGE_QUERY_ID,h.toWei("1"))
    await autopay.fundFeed(feedId4,LTC_QUERY_ID,h.toWei("1"))
    feedIds = await autopay.getFundedFeeds()
    assert(feedIds.length == 3, "should be two funded feeds")
    assert(feedIds[1] == feedId3, "incorrect second funded feed")
    assert(feedIds[2] == feedId4, "incorrect third funded feed")

    // Check remove funded feed
    await tellor.connect(accounts[2]).submitValue(DOGE_QUERY_ID, h.uintTob32(1234), 0, DOGE_QUERY_DATA);
    _block = await h.getBlock();
    await h.advanceTime(43200);
    // Check feed details
    let feed1Details = await autopay.getDataFeed(bytesId)
    let feed3Details = await autopay.getDataFeed(feedId3)
    let feed4Details = await autopay.getDataFeed(feedId4)
    assert(feed1Details.feedsWithFundingIndex == 1, "queryId 1 feedsWithFundingIndex should be 1")
    assert(feed3Details.feedsWithFundingIndex == 2, "queryId 3 feedsWithFundingIndex should be 2")
    assert(feed4Details.feedsWithFundingIndex == 3, "queryId 4 feedsWithFundingIndex should be 3")
    await autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [_block.timestamp])
    feedIds = await autopay.getFundedFeeds()
    assert(feedIds.length == 2, "should be two funded feeds")
    assert(feedIds[1] == feedId4, "incorrect second funded feed query ID")
    feed1Details = await autopay.getDataFeed(bytesId)
    feed3Details = await autopay.getDataFeed(feedId3)
    feed4Details = await autopay.getDataFeed(feedId4)
    assert(feed1Details.feedsWithFundingIndex == 1, "queryId 1 feedsWithFundingIndex should be 1")
    assert(feed3Details.feedsWithFundingIndex == 0, "queryId 3 feedsWithFundingIndex should be 0")
    assert(feed4Details.feedsWithFundingIndex == 2, "queryId 4 feedsWithFundingIndex should be 3")
  });
  it("getQueryIdFromFeedId", async () => {
    //setting up dataFeed
    //getting timestamp
    let blocky = await h.getBlock()
    //creating feedId to call function
    let feedId3 = keccak256(abiCoder.encode(
      ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [DOGE_QUERY_ID,h.toWei("1"),blocky.timestamp,600,400,0,0]
    ));
    //awaiting dataFeed setup
    await autopay.setupDataFeed(DOGE_QUERY_ID,h.toWei("1"),blocky.timestamp,600,400,0,0,DOGE_QUERY_DATA,0);

    //Function call
    let response = await autopay.getQueryIdFromFeedId(feedId3)
    //Expect call
    expect(response).to.equal(DOGE_QUERY_ID)
  });
  it("getFundedQueryIds", async () => {
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address,web3.utils.toWei("1000"))
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 0)
    // Tip queryId 1
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("1"),ETH_QUERY_DATA)
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 1)
    assert(fundedIds[0] == ETH_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 1)
    // Tip queryId 1
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("1"),ETH_QUERY_DATA)
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 1)
    assert(fundedIds[0] == ETH_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 1)
    // Tip queryId 2
    await autopay.tip(BTC_QUERY_ID,web3.utils.toWei("1"),BTC_QUERY_DATA)
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 2)
    assert(fundedIds[0] == ETH_QUERY_ID)
    assert(fundedIds[1] == BTC_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 1)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 2)
    // Tip queryId 2
    await autopay.tip(BTC_QUERY_ID,web3.utils.toWei("1"),BTC_QUERY_DATA)
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 2)
    assert(fundedIds[0] == ETH_QUERY_ID)
    assert(fundedIds[1] == BTC_QUERY_ID)
    // Tip queryId 3
    await autopay.tip(DOGE_QUERY_ID,web3.utils.toWei("1"),DOGE_QUERY_DATA)
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 3)
    assert(fundedIds[0] == ETH_QUERY_ID)
    assert(fundedIds[1] == BTC_QUERY_ID)
    assert(fundedIds[2] == DOGE_QUERY_ID)
    // Tip queryId 4
    await autopay.tip(LTC_QUERY_ID,web3.utils.toWei("1"),LTC_QUERY_DATA)
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 4)
    assert(fundedIds[0] == ETH_QUERY_ID)
    assert(fundedIds[1] == BTC_QUERY_ID)
    assert(fundedIds[2] == DOGE_QUERY_ID)
    assert(fundedIds[3] == LTC_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 1)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 2)
    assert(await autopay.queryIdsWithFundingIndex(DOGE_QUERY_ID) == 3)
    assert(await autopay.queryIdsWithFundingIndex(LTC_QUERY_ID) == 4)

    await tellor.submitValue(ETH_QUERY_ID, h.uintTob32(3550), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock();
    await tellor.submitValue(BTC_QUERY_ID, h.uintTob32(3550), 0, BTC_QUERY_DATA);
    blocky2 = await h.getBlock();
    await tellor.submitValue(DOGE_QUERY_ID, h.uintTob32(3550), 0, DOGE_QUERY_DATA);
    blocky3 = await h.getBlock();
    await tellor.submitValue(LTC_QUERY_ID, h.uintTob32(3550), 0, LTC_QUERY_DATA);
    blocky4 = await h.getBlock();

    await h.advanceTime(3600 * 12)

    await autopay.claimOneTimeTip(ETH_QUERY_ID, [blocky1.timestamp])
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 3)
    assert(fundedIds[0] == LTC_QUERY_ID)
    assert(fundedIds[1] == BTC_QUERY_ID)
    assert(fundedIds[2] == DOGE_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 2)
    assert(await autopay.queryIdsWithFundingIndex(DOGE_QUERY_ID) == 3)
    assert(await autopay.queryIdsWithFundingIndex(LTC_QUERY_ID) == 1)

    // Tip queryId 2
    await autopay.tip(BTC_QUERY_ID,web3.utils.toWei("1"),BTC_QUERY_DATA)

    await autopay.claimOneTimeTip(BTC_QUERY_ID, [blocky2.timestamp])
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 3)
    assert(fundedIds[0] == LTC_QUERY_ID)
    assert(fundedIds[1] == BTC_QUERY_ID)
    assert(fundedIds[2] == DOGE_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 2)
    assert(await autopay.queryIdsWithFundingIndex(DOGE_QUERY_ID) == 3)
    assert(await autopay.queryIdsWithFundingIndex(LTC_QUERY_ID) == 1)

    await autopay.claimOneTimeTip(DOGE_QUERY_ID, [blocky3.timestamp])
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 2)
    assert(fundedIds[0] == LTC_QUERY_ID)
    assert(fundedIds[1] == BTC_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 2)
    assert(await autopay.queryIdsWithFundingIndex(DOGE_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(LTC_QUERY_ID) == 1)

    await autopay.claimOneTimeTip(LTC_QUERY_ID, [blocky4.timestamp])
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 1)
    assert(fundedIds[0] == BTC_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 1)
    assert(await autopay.queryIdsWithFundingIndex(DOGE_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(LTC_QUERY_ID) == 0)

    await tellor.submitValue(BTC_QUERY_ID, h.uintTob32(3550), 0, BTC_QUERY_DATA);
    blocky2 = await h.getBlock();

    await h.advanceTime(3600 * 12)

    await autopay.claimOneTimeTip(BTC_QUERY_ID, [blocky2.timestamp])
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 0)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(DOGE_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(LTC_QUERY_ID) == 0)

    // Tip queryId 2
    await autopay.tip(LTC_QUERY_ID,web3.utils.toWei("1"),LTC_QUERY_DATA)
    fundedIds = await autopay.getFundedQueryIds()
    assert(fundedIds.length == 1)
    assert(fundedIds[0] == LTC_QUERY_ID)
    assert(await autopay.queryIdsWithFundingIndex(ETH_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(BTC_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(DOGE_QUERY_ID) == 0)
    assert(await autopay.queryIdsWithFundingIndex(LTC_QUERY_ID) == 1)
  });
  it("getTipsByAddress", async () => {
    let userAccount = accounts[5]
    await tellor.faucet(userAccount.address)
    await tellor.connect(userAccount).approve(autopay.address,h.toWei("1000"))
    await autopay.connect(userAccount).tip(BTC_QUERY_ID,web3.utils.toWei("10"),BTC_QUERY_DATA)
    assert(await autopay.getTipsByAddress(userAccount.address) == web3.utils.toWei("10"))
    await autopay.connect(userAccount).setupDataFeed(ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,3600,600,0,0,ETH_QUERY_DATA,0)
    bytesId = keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,3600,600,0,0]))
    await autopay.connect(userAccount).fundFeed(bytesId, ETH_QUERY_ID, h.toWei("99"))
    assert(await autopay.getTipsByAddress(userAccount.address) == web3.utils.toWei("109"))
  })
  it("getRewardAmount", async () => { 
    await h.advanceTime(3600)
    blocky0 = await h.getBlock()
    const INTERVAL = 3600
    // setup data feed with time based rewards
    await tellor.faucet(accounts[2].address)
    await tellor.connect(accounts[2]).approve(autopay.address, h.toWei("1000"))
    feedId = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, INTERVAL, 600, 0, h.toWei("1")]));
    await autopay.setupDataFeed(ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, 3600, 600, 0, h.toWei("1"), ETH_QUERY_DATA,0);
    await autopay.connect(accounts[2]).fundFeed(feedId, ETH_QUERY_ID, h.toWei("1000"));

    // advance some time within window
    await h.advanceTime(10)

    // submit value within window
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock();

    // advance some time to next window
    await h.advanceTime(INTERVAL + 10)

    // submit value inside next window
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky2 = await h.getBlock();

    // advance some time to next window
    await h.advanceTime(INTERVAL + 10)

    // submit value inside next window
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky3 = await h.getBlock();

    // query non-existent rewards
    await h.expectThrow(autopay.getRewardAmount(feedId, h.uintTob32(1), [blocky.timestamp]))

    // query rewards
    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky1.timestamp) - BigInt(blocky0.timestamp)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    rewardSum = expectedReward
    expect(await autopay.getRewardAmount(feedId, ETH_QUERY_ID, [blocky1.timestamp])).to.equal(expectedReward)

    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky2.timestamp) - BigInt(blocky0.timestamp + INTERVAL * 1)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    rewardSum = rewardSum + expectedReward
    expect(await autopay.getRewardAmount(feedId, ETH_QUERY_ID, [blocky2.timestamp])).to.equal(expectedReward)

    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky3.timestamp) - BigInt(blocky0.timestamp + INTERVAL * 2)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    rewardSum = rewardSum + expectedReward
    expect(await autopay.getRewardAmount(feedId, ETH_QUERY_ID, [blocky3.timestamp])).to.equal(expectedReward)

    // query rewards for multiple queries
    expect(await autopay.getRewardAmount(feedId, ETH_QUERY_ID, [blocky1.timestamp, blocky2.timestamp, blocky3.timestamp])).to.equal(rewardSum)

    // query rewards 1 week later
    await h.advanceTime(86400 * 7)
    expect(await autopay.getRewardAmount(feedId, ETH_QUERY_ID, [blocky1.timestamp, blocky2.timestamp, blocky3.timestamp])).to.equal(rewardSum)

    // query after 12 weeks
    await h.advanceTime(86400 * 7 * 12)
    await h.expectThrow(autopay.getRewardAmount(feedId, ETH_QUERY_ID, [blocky1.timestamp, blocky2.timestamp, blocky3.timestamp]))
  })
  it("bytesToUint", async() => {
    let val1 = h.uintTob32(1)
    let val2 = h.uintTob32(2)
    let val3 = h.uintTob32(300000000000000)
    let val4 = h.uintTob32(300000000000001)
    let val5 = abiCoder.encode(["uint256"], [1])
    let val6 = abiCoder.encode(["uint256"], ["21010191828172717718232237237237128"])
    let val7 = '0x01'
    let val8 = '0x10'

    expect(await autopay.bytesToUint(val1)).to.equal(1)
    expect(await autopay.bytesToUint(val2)).to.equal(2)
    expect(await autopay.bytesToUint(val3)).to.equal(300000000000000)
    expect(await autopay.bytesToUint(val4)).to.equal(300000000000001)
    expect(await autopay.bytesToUint(val5)).to.equal(1)
    expect(await autopay.bytesToUint(val6)).to.equal("21010191828172717718232237237237128")
    expect(await autopay.bytesToUint(val7)).to.equal(1)
    expect(await autopay.bytesToUint(val8)).to.equal(16)
  })
  it("getFundedSingleTipsInfo", async() => {
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address,web3.utils.toWei("1000"))
    await autopay.tip(ETH_QUERY_ID,web3.utils.toWei("100"),ETH_QUERY_DATA)
    await autopay.tip(TRB_QUERY_ID,web3.utils.toWei("100"),TRB_QUERY_DATA)
    let res = await autopay.getFundedSingleTipsInfo();
    assert(res[0].queryData == ETH_QUERY_DATA)
    assert(res[0].tip == web3.utils.toWei("100"), "first queryId tip should be correct")
    assert(res[1].queryData == TRB_QUERY_DATA, "second queryData should be correct")
    assert(res[1].tip == web3.utils.toWei("100"), "second queryId tip should be correct")
  })
  it("getFundedFeedDetails", async() => {
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address,web3.utils.toWei("1000"))
    let res = await autopay.getFundedFeedDetails()
    // feed that was funded in before each section
    assert(res[0].details.reward == h.toWei("1"), "reward should correct")
    assert(res[0].details.balance == h.toWei("1000"), "balance should correct")
    assert(res[0].details.startTime == firstBlocky.timestamp, "startTime should correct")
    assert(res[0].details.window == 600, "window should correct")
    assert(res[0].details.interval == 3600, "interval should correct")
    assert(res[0].details.priceThreshold == 0, "priceThreshold should correct")
    assert(res[0].details.rewardIncreasePerSecond == 0, "rewardIncreasePerSecond should correct")
    assert(res[0].details.feedsWithFundingIndex == 1, "feedsWithFundingIndex should correct")
  })
  it("getRewardClaimStatusList", async() => {
    // setup feeds with funding
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address,web3.utils.toWei("1000"))
    await autopay.setupDataFeed(TRB_QUERY_ID,h.toWei("10"),firstBlocky.timestamp,3600,600,0,0,TRB_QUERY_DATA,h.toWei("1000"));
    bytesId = keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[TRB_QUERY_ID,h.toWei("10"),firstBlocky.timestamp,3600,600,0,0]));
    // submit to feeds
    await tellor.submitValue(TRB_QUERY_ID, h.uintTob32(3500), 0, TRB_QUERY_DATA);
    let blocky = await h.getBlock();
    timestamp1 = blocky.timestamp;
    h.advanceTime(3600);
    await tellor.connect(accounts[0]).submitValue(TRB_QUERY_ID, h.uintTob32(3525), 1, TRB_QUERY_DATA);
    blocky = await h.getBlock();
    timestamp2 = blocky.timestamp;
    h.advanceTime(3600);
    await tellor.connect(accounts[0]).submitValue(TRB_QUERY_ID, h.uintTob32(3550), 2, TRB_QUERY_DATA);
    blocky = await h.getBlock();
    timestamp3 = blocky.timestamp;
    h.advanceTime(3600);
    // check timestamps
    let res = await autopay.getRewardClaimStatusList(bytesId,ETH_QUERY_ID,[timestamp1,timestamp2,timestamp3])
    assert(res[0] == false)
    assert(res[1] == false)
    assert(res[2] == false)
    // claimTip and check status
    h.advanceTime(84600);
    await autopay.claimTip(bytesId, TRB_QUERY_ID, [timestamp1])
    res = await autopay.getRewardClaimStatusList(bytesId,TRB_QUERY_ID,[timestamp1,timestamp2,timestamp3])
    assert(res[0] == true)
    assert(res[1] == false)
    assert(res[2] == false)
    await autopay.claimTip(bytesId, TRB_QUERY_ID, [timestamp3])
    res = await autopay.getRewardClaimStatusList(bytesId,TRB_QUERY_ID,[timestamp1,timestamp2,timestamp3])
    assert(res[0] == true)
    assert(res[1] == false)
    assert(res[2] == true)
    await autopay.claimTip(bytesId, TRB_QUERY_ID, [timestamp2])
    res = await autopay.getRewardClaimStatusList(bytesId,TRB_QUERY_ID,[timestamp1,timestamp2,timestamp3])
    assert(res[0] == true)
    assert(res[1] == true)
    assert(res[2] == true)
  })
});
