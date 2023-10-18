const {expect,assert} = require("chai");
const {ethers} = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const {keccak256} = require("@ethersproject/keccak256");

require("chai").use(require("chai-as-promised")).should();

describe("Autopay - e2e tests", function() {
  let tellor, autopay, queryDataStorage, gov, token;
  let accounts;
  const FEE = 10
  const abiCoder = new ethers.utils.AbiCoder;
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

  beforeEach(async function() {
    accounts = await ethers.getSigners();
    const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
    const TellorFlex = await ethers.getContractFactory("tellorflex/contracts/TellorFlex.sol:TellorFlex");
    const Governance = await ethers.getContractFactory("polygongovernance/contracts/Governance.sol:Governance");
    token = await TellorPlayground.deploy();
    await token.deployed();
    tellor = await TellorFlex.deploy(token.address, 86400/2, h.toWei("15"), h.toWei("1500"), h.toWei(".001"), TRB_QUERY_ID);
    await tellor.deployed();
    gov = await Governance.deploy(tellor.address, accounts[0].address);
    await tellor.init(gov.address)
    await token.faucet(accounts[0].address);
    const QueryDataStorage = await ethers.getContractFactory("QueryDataStorage");
    queryDataStorage = await QueryDataStorage.deploy();
    await queryDataStorage.deployed();
    const Autopay = await ethers.getContractFactory("AutopayMock");
    autopay = await Autopay.deploy(tellor.address, queryDataStorage.address, FEE);
    await autopay.deployed();

    for(i=0; i<10; i++) {
      await token.faucet(accounts[1].address);
      await token.faucet(accounts[2].address);
    }
    await token.connect(accounts[1]).approve(tellor.address, h.toWei("10000"));
    await token.connect(accounts[2]).approve(tellor.address, h.toWei("10000"));

    await tellor.connect(accounts[1]).depositStake(h.toWei("10000"))
    await tellor.connect(accounts[2]).depositStake(h.toWei("10000"))
  });

  it("test no pay structure, but multiple tips", async function() {
  let autopay1 = autopay.connect(accounts[1])
  await token.faucet(accounts[1].address)
  await token.connect(accounts[1]).approve(autopay.address, web3.utils.toWei("100"))
  await h.expectThrow(autopay1.tip(ETH_QUERY_ID, web3.utils.toWei("101"),ETH_QUERY_DATA)) // "ERC20: transfer amount exceeds balance"
  
  // add first tip
  await autopay1.tip(ETH_QUERY_ID, web3.utils.toWei("10"),ETH_QUERY_DATA)
  blocky = await h.getBlock()
  assert(await token.balanceOf(accounts[1].address) - web3.utils.toWei("990") == 0, "User balance should reduce correctly after tipping")
  assert(await token.balanceOf(autopay.address) - web3.utils.toWei("10") == 0, "Autopay contract balance should increase correctly after user adds tip")
  pastTips = await autopay.getPastTips(ETH_QUERY_ID)
  assert(pastTips.length == 1, "Tips array should be correct length")
  assert(pastTips[0].amount == web3.utils.toWei("10"), "Recorded tip amount should be correct")
  assert(pastTips[0].timestamp == blocky.timestamp + 1, "Tip timestamp should be recorded correctly")
  
  // submit value
  await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32("200"), 0, ETH_QUERY_DATA)
  blockySubmit1 = await h.getBlock()
  
  // add second tip
  await autopay1.tip(ETH_QUERY_ID, web3.utils.toWei("20"),ETH_QUERY_DATA)
  blocky2 = await h.getBlock()
  assert(await token.balanceOf(accounts[1].address) - web3.utils.toWei("970") == 0, "User balance should reduce correctly after tipping")
  assert(await token.balanceOf(autopay.address) - web3.utils.toWei("30") == 0, "Autopay contract balance should increase correctly after user adds tip")
  pastTips = await autopay.getPastTips(ETH_QUERY_ID)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == web3.utils.toWei("10"), "First recorded tip amount should be correct")
  assert(pastTips[0].timestamp == blocky.timestamp + 1, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == web3.utils.toWei("20"), "Second recorded tip amount should be correct")
  assert(pastTips[1].timestamp == blocky2.timestamp + 1, "Second tip timestamp should be recorded correctly")
  
  // add third tip
  await autopay1.tip(ETH_QUERY_ID, web3.utils.toWei("10"),ETH_QUERY_DATA)
  blocky3 = await h.getBlock()
  assert(await token.balanceOf(accounts[1].address) - web3.utils.toWei("960") == 0, "User balance should reduce correctly after tipping")
  assert(await token.balanceOf(autopay.address) - web3.utils.toWei("40") == 0, "Autopay contract balance should increase correctly after user adds tip")
  pastTips = await autopay.getPastTips(ETH_QUERY_ID)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == web3.utils.toWei("10"), "First recorded tip amount should be correct")
  assert(pastTips[0].timestamp == blocky.timestamp + 1, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == web3.utils.toWei("30"), "Second cumulative recorded tip amount should be correct")
  assert(pastTips[1].timestamp == blocky3.timestamp + 1, "Second tip timestamp should be updated correctly")
  
  // claim first tip
  await h.advanceTime(3600 * 12)
  tellorBalBefore = await token.balanceOf(tellor.address)
  await autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blockySubmit1.timestamp])
  assert(await token.balanceOf(accounts[2].address) - web3.utils.toWei("9.9") == 0, "Reporter balance should increase correctly after claiming tip")
  assert(await token.balanceOf(tellor.address) - web3.utils.toWei("0.1") - tellorBalBefore == 0, "Owner balance should increase correctly after claiming tip")
  assert(await token.balanceOf(autopay.address) - web3.utils.toWei("30") == 0, "Autopay contract balance should decrease correctly after paying tip")
  pastTips = await autopay.getPastTips(ETH_QUERY_ID)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == 0, "First recorded tip amount should be set to zero after tip claimed")
  assert(pastTips[0].timestamp == blocky.timestamp + 1, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == web3.utils.toWei("30"), "Second cumulative recorded tip amount should be correct")
  assert(pastTips[1].timestamp == blocky3.timestamp + 1, "Second tip timestamp should be correct")
  
  // submit value
  await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32("200"), 0, ETH_QUERY_DATA)
  blockySubmit2 = await h.getBlock()
  
  // claim second tip
  await h.advanceTime(3600 * 12)
  reporterBalBefore = await token.balanceOf(accounts[2].address)
  tellorBalBefore = await token.balanceOf(tellor.address)
  await autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blockySubmit2.timestamp])
  assert(await token.balanceOf(accounts[2].address) - web3.utils.toWei("39.6") == 0, "Reporter balance should increase correctly after claiming tip")
  assert(BigInt(await token.balanceOf(tellor.address)) - BigInt(web3.utils.toWei("0.3")) == BigInt(tellorBalBefore), "Owner balance should increase correctly after claiming tip")
  assert(await token.balanceOf(autopay.address) == 0, "Autopay contract balance should decrease correctly after paying tip")
  pastTips = await autopay.getPastTips(ETH_QUERY_ID)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == 0, "First recorded tip amount should be set to zero after tip claimed")
  assert(pastTips[0].timestamp == blocky.timestamp + 1, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == 0, "Second cumulative recorded tip amount should be set to zero after tip claimed")
  assert(pastTips[1].timestamp == blocky3.timestamp + 1, "Second tip timestamp should be correct")
})

  it("single queryID, multiple refills, pulls", async function() {
    interval1 = 36000
    window1 = 6000
    reward1 = h.toWei("1")
    reward1MinusFee = reward1 * 0.99
    ownerBalance = await token.balanceOf(accounts[0].address)
    reporterBalance = await token.balanceOf(accounts[2].address)
    blockyArray1 = new Array()
    blockyArray2 = new Array()
    // setup data feed queryId 1
    blocky = await h.getBlock()
    await autopay.connect(accounts[1]).setupDataFeed(ETH_QUERY_ID, reward1, blocky.timestamp, interval1, window1, 0, 0, ETH_QUERY_DATA,0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, reward1, blocky.timestamp, interval1, window1, 0, 0])
    feedId = feedId = ethers.utils.keccak256(feedBytes)
    await token.approve(autopay.address, h.toWei("1000"));
    // fund feed
    await autopay.fundFeed(feedId, ETH_QUERY_ID, h.toWei("1000"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3575 + i), 0, ETH_QUERY_DATA);
      blockyArray1[i] = await h.getBlock()
    }
    // advance time to next interval
    await h.advanceTime(interval1)
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(3585 + i), 0, ETH_QUERY_DATA);
      blockyArray2[i] = await h.getBlock()
    }
    // advance time beyond buffer
    await h.advanceTime(3600 * 12)
    // make sure can't claim invalid tips, interval1
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId, ETH_QUERY_ID, [blockyArray1[i].timestamp])); // "timestamp not first report within window"
    }
    assert(await token.balanceOf(autopay.address) - h.toWei("1000") == 0, "Autopay contract balance should not change")
    assert(await token.balanceOf(accounts[2].address) == 0, "Reporter balance should still be zero")
    // valid claim tip, interval1
    tellorBalBefore = await token.balanceOf(tellor.address)
    await autopay.connect(accounts[2]).claimTip(feedId, ETH_QUERY_ID, [blockyArray1[0].timestamp])
    assert(await token.balanceOf(autopay.address) - h.toWei("999") == 0, "Autopay contract balance should not change")
    assert(await token.balanceOf(accounts[2].address) - reward1MinusFee == 0, "Reporter balance should update correctly")
    assert(await token.balanceOf(tellor.address) - (reward1 - reward1MinusFee) == tellorBalBefore, "Owner balance should update correctly")
    // faucet more tokens, add tip
    await token.faucet(accounts[0].address)
    await token.approve(autopay.address, h.toWei("10"))
    await autopay.tip(ETH_QUERY_ID, h.toWei("10"),ETH_QUERY_DATA)
    blocky = await h.getBlock()
    pastTips = await autopay.getPastTips(ETH_QUERY_ID)
    assert(pastTips.length == 1, "Tips array should be correct length")
    assert(pastTips[0].amount == web3.utils.toWei("10"), "First recorded tip amount should be correct")
    assert(pastTips[0].timestamp == blocky.timestamp + 1, "First tip timestamp should be recorded correctly")
    let abal = await token.balanceOf(autopay.address)
    assert(ethers.utils.formatEther(abal) - 999 - 10 == 0, "Autopay contract balance should update correctly")
    // faucet and add more funds to autopay feed
    await token.faucet(accounts[0].address)
    await token.approve(autopay.address, h.toWei("1000"))
    await autopay.fundFeed(feedId, ETH_QUERY_ID, h.toWei("1000"));
    feedDetails = await autopay.getDataFeed(feedId)
    assert(feedDetails.reward == reward1, "Recorded reward amount should be correct")
    assert(feedDetails.balance == h.toWei("1999"), "Recorded feed balance should be correct")
    // submit another value (eligible for tip)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(4000), 0, ETH_QUERY_DATA);
    blocky = await h.getBlock()
    // ensure can't claim one-time-tip for ineligible submissions
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blockyArray1[i].timestamp])); // "Timestamp not eligible for tip"
    }
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blockyArray2[i].timestamp])); // "Timestamp not eligible for tip"
    }
    // claim valid one time tip
    ownerBalanceBefore = await token.balanceOf(tellor.address)
    await h.advanceTime(3600 * 12)
    await autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blocky.timestamp])
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blocky.timestamp])) // Tip already claimed
    assert(await token.balanceOf(autopay.address) - h.toWei("1999") == 0, "Autopay contract balance should change correctly")
    assert(await token.balanceOf(accounts[2].address) - reward1MinusFee - h.toWei("9.9") == 0, "Reporter balance should update correctly")
    assert(BigInt(await token.balanceOf(tellor.address)) - BigInt(ownerBalanceBefore) - BigInt(h.toWei("0.1")) == 0, "Owner balance should change correctly")
  });

  it("multiple queryID's, several disputes and refills", async function() {
    interval1 = 86400
    window1 = 3600
    reward1 = h.toWei("1")
    rewardMinusFee1 = reward1 * 0.99
    blockyArray1QID1 = new Array()
    blockyArray2QID1 = new Array()

    interval2 = interval1
    window2 = window1
    reward2 = h.toWei("2")
    rewardMinusFee2 = reward2 * 0.99
    blockyArray1QID2 = new Array()
    blockyArray2QID2 = new Array()

    interval3 = interval1
    window3 = window1
    reward3 = h.toWei("3")
    rewardMinusFee3 = reward3 * 0.99
    blockyArray1QID3 = new Array()
    blockyArray2QID3 = new Array()

    blockyArray1QID1 = new Array()
    blockyArray2QID1 = new Array()
    await token.approve(autopay.address, h.toWei("10000000000"));
    blocky = await h.getBlock()
    // setup data feed queryId 1
    await autopay.connect(accounts[1]).setupDataFeed(ETH_QUERY_ID, reward1, blocky.timestamp, interval1, window1, 0, 0, ETH_QUERY_DATA,0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, reward1, blocky.timestamp, interval1, window1, 0, 0])
    feedId1 = ethers.utils.keccak256(feedBytes)
    // fund feed 1
    await autopay.fundFeed(feedId1, ETH_QUERY_ID, h.toWei("100"));
    // setup data feed queryId 2
    await autopay.connect(accounts[1]).setupDataFeed(BTC_QUERY_ID, reward2, blocky.timestamp, interval2, window2, 0, 0, BTC_QUERY_DATA,0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [BTC_QUERY_ID, reward2, blocky.timestamp, interval2,window2, 0, 0])
    feedId2 = ethers.utils.keccak256(feedBytes)
    // fund feed 2
    await autopay.fundFeed(feedId2, BTC_QUERY_ID, h.toWei("100"));
    // setup data feed queryId 3
    await autopay.connect(accounts[1]).setupDataFeed(DOGE_QUERY_ID, reward3, blocky.timestamp, interval3, window3, 0, 0, DOGE_QUERY_DATA,0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [DOGE_QUERY_ID, reward3, blocky.timestamp, interval3, window3, 0, 0])
    feedId3 = ethers.utils.keccak256(feedBytes)
    // fund feed 3
    await autopay.fundFeed(feedId3, DOGE_QUERY_ID, h.toWei("100"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(1575 + i), 0, ETH_QUERY_DATA);
      blockyArray1QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(BTC_QUERY_ID, h.uintTob32(2575 + i), 0, BTC_QUERY_DATA);
      blockyArray1QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(DOGE_QUERY_ID, h.uintTob32(3575 + i), 0, DOGE_QUERY_DATA);
      blockyArray1QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray1QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray1QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [blockyArray1QID3[i].timestamp])); // buffer time hasn't  passed
    }

    // dispute first three values from interval 1, queryId 2
    await token.faucet(accounts[10].address)
    await token.connect(accounts[10]).approve(gov.address, h.toWei("10000"));
    for (i = 0; i < 3; i++) {
      await gov.connect(accounts[10]).beginDispute(BTC_QUERY_ID, blockyArray1QID2[i].timestamp)
    }

    // advance time to next interval
    await h.advanceTime(interval1)
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(1675 + i), 0, ETH_QUERY_DATA);
      blockyArray2QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(BTC_QUERY_ID, h.uintTob32(2675 + i), 0, BTC_QUERY_DATA);
      blockyArray2QID2[i] = await h.getBlock()
    }

    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(DOGE_QUERY_ID, h.uintTob32(3675 + i), 0, DOGE_QUERY_DATA);
      blockyArray2QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray2QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray2QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [blockyArray2QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // claim tip interval 1 queryID 1
    ownerBalanceBefore = await token.balanceOf(tellor.address)
    autopayBalanceBefore = await token.balanceOf(autopay.address)
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray1QID1[0].timestamp])
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray1QID1[0].timestamp])) // tip already claimed
    assert(await token.balanceOf(accounts[2].address) == h.toWei("0.99"), "Reporter balance should update correctly")
    ownerBalanceAfter = await token.balanceOf(tellor.address);
    assert((ownerBalanceAfter.sub(ownerBalanceBefore) - h.toWei("0.01")) == 0, "Owner balance should update correctly")
    autopayBalanceAfter = await token.balanceOf(autopay.address);
    assert(autopayBalanceBefore.sub(autopayBalanceAfter) - h.toWei("1") == 0, "Autopay contract balance should update correctly")
    // advance time to next interval
    await h.advanceTime(interval1)
    
    // ensure can't claim tips for disputed value
    for (i = 0; i < 3; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray1QID2[i].timestamp])) // value with given timestamp doesn't exist
    }
    // claim tip for undisputed valid value
    await autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray1QID2[3].timestamp])
  });

  it("multiple queryID's, refills, pulls", async function() {
    interval1 = 86400
    window1 = 3600
    reward1 = h.toWei("1")
    rewardMinusFee1 = reward1 * 0.99
    blockyArray1QID1 = new Array()
    blockyArray2QID1 = new Array()

    interval2 = interval1
    window2 = window1
    reward2 = h.toWei("2")
    rewardMinusFee2 = reward2 * 0.99
    blockyArray1QID2 = new Array()
    blockyArray2QID2 = new Array()

    interval3 = interval1
    window3 = window1
    reward3 = h.toWei("3")
    rewardMinusFee3 = reward3 * 0.99
    blockyArray1QID3 = new Array()
    blockyArray2QID3 = new Array()

    blockyArray1QID1 = new Array()
    blockyArray2QID1 = new Array()

    tellorBalBefore = await token.balanceOf(tellor.address)

    await token.approve(autopay.address, h.toWei("10000000000"));
    blocky = await h.getBlock()
    // setup data feed queryId 1
    await autopay.connect(accounts[1]).setupDataFeed(ETH_QUERY_ID, reward1, blocky.timestamp, interval1, window1, 0, 0,ETH_QUERY_DATA,0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, reward1, blocky.timestamp, interval1,window1, 0, 0])
    feedId1 = ethers.utils.keccak256(feedBytes)
    // fund feed 1
    await autopay.fundFeed(feedId1, ETH_QUERY_ID, h.toWei("2"));
    // setup data feed queryId 2
    await autopay.connect(accounts[1]).setupDataFeed(BTC_QUERY_ID, reward2, blocky.timestamp + interval1, interval2, window2, 0, 0, BTC_QUERY_DATA,0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [BTC_QUERY_ID, reward2, blocky.timestamp + interval1, interval2, window2, 0, 0])
    feedId2 = ethers.utils.keccak256(feedBytes)
    // fund feed 2
    await autopay.fundFeed(feedId2, BTC_QUERY_ID, h.toWei("100"));
    // setup data feed queryId 3
    await autopay.connect(accounts[1]).setupDataFeed(DOGE_QUERY_ID, reward3, blocky.timestamp + interval1 + interval1, interval3, window3, 0, 0, DOGE_QUERY_DATA,0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [DOGE_QUERY_ID, reward3, blocky.timestamp + interval1 + interval1, interval3, window3, 0, 0])
    feedId3 = ethers.utils.keccak256(feedBytes)
    // fund feed 3
    await autopay.fundFeed(feedId3, DOGE_QUERY_ID, h.toWei("100"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(1575 + i), 0, ETH_QUERY_DATA);
      blockyArray1QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(BTC_QUERY_ID, h.uintTob32(2575 + i), 0, BTC_QUERY_DATA);
      blockyArray1QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(DOGE_QUERY_ID, h.uintTob32(3575 + i), 0, DOGE_QUERY_DATA);
      blockyArray1QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray1QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray1QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [blockyArray1QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // advance time 1 interval
    await h.advanceTime(interval1)
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1,ETH_QUERY_ID, [blockyArray1QID1[i].timestamp])); // buffer time hasn't  passed
    }
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray1QID1[0].timestamp])
    // make sure can't claim any tips queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray1QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [blockyArray1QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // add 2 tips
    await autopay.tip(LTC_QUERY_ID, h.toWei("1"),LTC_QUERY_DATA)
    await autopay.tip(LTC_QUERY_ID, h.toWei("1"),LTC_QUERY_DATA)
    // submit value
    await tellor.connect(accounts[2]).submitValue(LTC_QUERY_ID, h.uintTob32(4575), 0, LTC_QUERY_DATA);
    blockyTip1 = await h.getBlock()
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(LTC_QUERY_ID, [blockyTip1.timestamp])) //buffer time hasn't  passed
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(1575 + i), 0, ETH_QUERY_DATA);
      blockyArray2QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(BTC_QUERY_ID, h.uintTob32(2575 + i), 0, BTC_QUERY_DATA);
      blockyArray2QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(DOGE_QUERY_ID, h.uintTob32(3575 + i), 0, DOGE_QUERY_DATA);
      blockyArray2QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray2QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray2QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [blockyArray2QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // advance time 1 interval
    await h.advanceTime(interval1)
    // make sure can't claim invalid tips queryID 1
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray2QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 2
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray2QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [blockyArray2QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // claim 3 good tips
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray2QID1[0].timestamp])
    await autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray2QID2[0].timestamp])
    await autopay.connect(accounts[2]).claimOneTimeTip(LTC_QUERY_ID, [blockyTip1.timestamp])
    // refill 3 datafeed accounts
    await autopay.fundFeed(feedId1, ETH_QUERY_ID, h.toWei("10"));
    await autopay.fundFeed(feedId2, BTC_QUERY_ID, h.toWei("100"));
    await autopay.fundFeed(feedId3, DOGE_QUERY_ID, h.toWei("100"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(1575 + i), 0, ETH_QUERY_DATA);
      blockyArray1QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(BTC_QUERY_ID, h.uintTob32(2575 + i), 0, BTC_QUERY_DATA);
      blockyArray1QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(DOGE_QUERY_ID, h.uintTob32(3575 + i), 0, DOGE_QUERY_DATA);
      blockyArray1QID3[i] = await h.getBlock()
    }
    // add 2 tips
    await autopay.tip(LTC_QUERY_ID, h.toWei("1"),LTC_QUERY_DATA)
    await autopay.tip(LTC_QUERY_ID, h.toWei("1"),LTC_QUERY_DATA)
    // submit value
    await tellor.connect(accounts[2]).submitValue(LTC_QUERY_ID, h.uintTob32(4575), 0, LTC_QUERY_DATA);
    blockyTip2 = await h.getBlock()
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(LTC_QUERY_ID, [blockyTip2.timestamp])) //buffer time hasn't  passed
    // advance time one interval
    await h.advanceTime(interval1)
    // refill 3 datafeed accounts
    await autopay.fundFeed(feedId1, ETH_QUERY_ID, h.toWei("10"));
    await autopay.fundFeed(feedId2, BTC_QUERY_ID, h.toWei("100"));
    await autopay.fundFeed(feedId3, DOGE_QUERY_ID, h.toWei("100"));
    // claim 4 good tips
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blockyArray1QID1[0].timestamp])
    await autopay.connect(accounts[2]).claimTip(feedId2, BTC_QUERY_ID, [blockyArray1QID2[0].timestamp])
    await autopay.connect(accounts[2]).claimTip(feedId3, DOGE_QUERY_ID, [blockyArray1QID3[0].timestamp])
    await autopay.connect(accounts[2]).claimOneTimeTip(LTC_QUERY_ID, [blockyTip2.timestamp])

    feedDetails1 = await autopay.getDataFeed(feedId1)
    feedDetails2 = await autopay.getDataFeed(feedId2)
    feedDetails3 = await autopay.getDataFeed(feedId3)
    pastTips = await autopay.getPastTips(LTC_QUERY_ID)

    expect(feedDetails1.balance).to.equal(h.toWei("19"))
    expect(feedDetails2.balance).to.equal(h.toWei("296"))
    expect(feedDetails3.balance).to.equal(h.toWei("297"))
    expect(await token.balanceOf(accounts[2].address)).to.equal(h.toWei("13.86"))
    expect(await token.balanceOf(tellor.address)).to.equal(BigInt(h.toWei("0.14")) + BigInt(tellorBalBefore))
    expect(pastTips.length).to.equal(2)
    expect(pastTips[0].amount).to.equal(0)
    expect(pastTips[1].amount).to.equal(0)
  });

  it("priceChange tests", async function() {
    let firstBlocky = await h.getBlock();
    await autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,86400,600,500,0,ETH_QUERY_DATA,0);
    feedId1= ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,86400,600,500,0]));
    await token.approve(autopay.address, h.toWei("1000"));
    await autopay.fundFeed(feedId1, ETH_QUERY_ID, h.toWei("1000"));
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    firstBlocky = await h.getBlock();
    //can grab right away (change from zero)
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp])
    await h.advanceTime(86400/2)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    firstBlocky = await h.getBlock();
    //revert on not enough change
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp]))
    await h.advanceTime(86400)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    firstBlocky = await h.getBlock();
    //not enough change but goes through on time
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp])
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(200), 0, ETH_QUERY_DATA);
    firstBlocky = await h.getBlock();
    //enough change, gets paid out
      //new price > old price
      await h.advanceTime(86400/2)
      await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp])
      await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(50), 0, ETH_QUERY_DATA);
      firstBlocky = await h.getBlock();
      await h.advanceTime(86400/2)
      //old price > new price
      await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp])
    //values are not bytes values
    bytesData = abiCoder.encode(["bytes32","uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),firstBlocky.timestamp,3600,600,0])
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID,bytesData, 0, ETH_QUERY_DATA);
    firstBlocky = await h.getBlock();
    await h.advanceTime(86400/2)
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp]))
  });

  it("more priceChange tests", async function() {
    let firstBlocky = await h.getBlock();
    await autopay.setupDataFeed(ETH_QUERY_ID, h.toWei("1"), firstBlocky.timestamp, 3600, 600, 500, 0, ETH_QUERY_DATA,0);
    feedId1 = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, h.toWei("1"), firstBlocky.timestamp, 3600, 600, 500, 0]));
    await token.approve(autopay.address, h.toWei("1000"));
    await autopay.fundFeed(feedId1, ETH_QUERY_ID, h.toWei("1000"));
    // up threshold
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    firstBlocky = await h.getBlock();
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp])) // buffer time not passed
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(106), 0, ETH_QUERY_DATA)
    secondBlocky = await h.getBlock();
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp, secondBlocky.timestamp])
    // down threshold
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA)
    firstBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(94), 0, ETH_QUERY_DATA)
    secondBlocky = await h.getBlock();
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp, secondBlocky.timestamp])
    // up down down up up - up bad
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA)
    firstBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(106), 0, ETH_QUERY_DATA)
    secondBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA)
    thirdBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(94), 0, ETH_QUERY_DATA)
    fourthBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA)
    fifthBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(106), 0, ETH_QUERY_DATA)
    sixthBlocky = await h.getBlock();
    // up more without meeting threshold
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(108), 0, ETH_QUERY_DATA)
    firstBlockyBad = await h.getBlock()
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlocky.timestamp, secondBlocky.timestamp, thirdBlocky.timestamp, fourthBlocky.timestamp, fifthBlocky.timestamp, sixthBlocky.timestamp])
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [firstBlockyBad.timestamp])) // threshold not met, not first within window
  });

  it("test incrementing of user tips total with multiple tipping/funding", async function() {
    for(i=1; i<6; i++) {
      await token.faucet(accounts[i].address)
      await token.connect(accounts[i]).approve(autopay.address,h.toWei("1000"))
      assert(await autopay.getTipsByAddress(accounts[i].address) == 0)
    }

    for(i=1; i<6; i++) {
      await autopay.connect(accounts[i]).tip(ETH_QUERY_ID,h.toWei(i.toString()),ETH_QUERY_DATA)
      assert(await autopay.getTipsByAddress(accounts[i].address) == h.toWei(i.toString()))
    }

    blocky = await h.getBlock()
    await token.approve(autopay.address,h.toWei("1000"))
    await autopay.setupDataFeed(ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,3600,600,0,0,ETH_QUERY_DATA,0)
    bytesId = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[ETH_QUERY_ID,h.toWei("1"),blocky.timestamp,3600,600,0,0]))

    for(i=1; i<6; i++) {
      await autopay.connect(accounts[i]).fundFeed(bytesId, ETH_QUERY_ID, h.toWei(i.toString()))
      assert(await autopay.getTipsByAddress(accounts[i].address) == h.toWei((i*2).toString()))
    }
  })

  it("test time based rewards", async function() {
    blocky0 = await h.getBlock()
    const INTERVAL = 3600
    // setup data feed with time based rewards
    await token.faucet(accounts[2].address)
    await token.connect(accounts[2]).approve(autopay.address, h.toWei("1000"))
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

    // advance time 12 hours to claim rewards
    await h.advanceTime(3600 * 12)

    // claim rewards
    await autopay.connect(accounts[1]).claimTip(feedId, ETH_QUERY_ID, [blocky1.timestamp]);
    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky1.timestamp) - BigInt(blocky0.timestamp)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    expectedBalance = expectedReward
    expect(await token.balanceOf(accounts[1].address)).to.equal(expectedBalance)

    await autopay.connect(accounts[1]).claimTip(feedId, ETH_QUERY_ID, [blocky2.timestamp]);
    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky2.timestamp) - BigInt(blocky0.timestamp + INTERVAL * 1)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    expectedBalance = expectedBalance + expectedReward
    expect(await token.balanceOf(accounts[1].address)).to.equal(expectedBalance)

    await autopay.connect(accounts[1]).claimTip(feedId, ETH_QUERY_ID, [blocky3.timestamp]);
    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky3.timestamp) - BigInt(blocky0.timestamp + INTERVAL * 2)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    expectedBalance = expectedBalance + expectedReward
    expect(await token.balanceOf(accounts[1].address)).to.equal(expectedBalance)
  })

  it("test dispute on value", async function() {
    // test one time tips
    await token.approve(autopay.address, h.toWei("200"))
    await autopay.tip(ETH_QUERY_ID, h.toWei("25"),ETH_QUERY_DATA)
    assert(await autopay.getCurrentTip(ETH_QUERY_ID) == h.toWei("25"))

    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock();

    await token.approve(autopay.address, h.toWei("25"));
    await autopay.tip(ETH_QUERY_ID, h.toWei("25"),ETH_QUERY_DATA)
    assert(await autopay.getCurrentTip(ETH_QUERY_ID) == h.toWei("25"))

    await token.faucet(accounts[10].address)
    await token.connect(accounts[10]).approve(gov.address, h.toWei("1000"))
    await gov.connect(accounts[10]).beginDispute(ETH_QUERY_ID,blocky1.timestamp)

    await token.approve(autopay.address, h.toWei("25"));
    await autopay.tip(ETH_QUERY_ID, h.toWei("25"),ETH_QUERY_DATA)
    //now it should add to previous
    assert(await autopay.getCurrentTip(ETH_QUERY_ID) == h.toWei("50"), "current tip should be double")
    
    for(i=0; i<10; i++) {
      await token.faucet(accounts[3].address);
    }
    await token.connect(accounts[3]).approve(tellor.address, h.toWei("10000"));
    await tellor.connect(accounts[3]).depositStake(h.toWei("10000"))

    await tellor.connect(accounts[3]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    let blocky2 = await h.getBlock();

    await h.advanceTime(3600 * 12)
    //acount 2 fails to get one time tip
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blocky1.timestamp]))
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blocky2.timestamp]))
    //account 3 gets all the one time tips
    let bal1 = await token.balanceOf(accounts[3].address)
    await autopay.connect(accounts[3]).claimOneTimeTip(ETH_QUERY_ID, [blocky2.timestamp])
    let bal2 = await token.balanceOf(accounts[3].address)
    expectedReward = h.toWei((75 * (1000 - FEE) / 1000).toString())
    assert(bal2 - bal1 == expectedReward, "one time tip payout should be correct")

    // test autopay tips
    await token.approve(autopay.address, h.toWei("100"))
    let blocky3 = await h.getBlock();
    await autopay.setupDataFeed(ETH_QUERY_ID, h.toWei("1"), blocky3.timestamp, 3600, 600, 0, 0, ETH_QUERY_DATA,h.toWei("100"));
    feedId1 = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, h.toWei("1"), blocky3.timestamp, 3600, 600, 0, 0]));

    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky4 = await h.getBlock();
    await gov.connect(accounts[10]).beginDispute(ETH_QUERY_ID,blocky4.timestamp)

    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky5 = await h.getBlock();
    await gov.connect(accounts[10]).beginDispute(ETH_QUERY_ID,blocky5.timestamp)

    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky6 = await h.getBlock();

    await h.advanceTime(3600 * 12)

    await h.expectThrow(autopay.connect(accounts[1]).claimTip(feedId1, ETH_QUERY_ID, [blocky4.timestamp]))
    await h.expectThrow(autopay.connect(accounts[1]).claimTip(feedId1, ETH_QUERY_ID, [blocky5.timestamp]))
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blocky6.timestamp])
    expectedReward = h.toWei((1 * (1000 - FEE) / 1000).toString())
    assert(await token.balanceOf(accounts[2].address) == expectedReward, "autopay payout should be correct")
  })

  it("one time tip same block as report", async function() {
    // deploy TipAndReport contract, which tips and reports in same block
    const TipAndReport = await ethers.getContractFactory("TipAndReport");
    tipAndReport = await TipAndReport.deploy(tellor.address, autopay.address);
    await tipAndReport.deployed();

    await token.transfer(tipAndReport.address, h.toWei("1"));
    expect(await token.balanceOf(tipAndReport.address)).to.equal(h.toWei("1"));
    await token.faucet(accounts[10].address)
    await token.connect(accounts[10]).approve(tipAndReport.address, h.toWei("1000"))
    await tipAndReport.connect(accounts[10]).depositStake(h.toWei("1000"))
    await tipAndReport.tipAndSubmitValue(ETH_QUERY_ID, h.toWei("1"), h.uintTob32(100), ETH_QUERY_DATA);
    blocky = await h.getBlock();
    expect(await token.balanceOf(tipAndReport.address)).to.equal(0);
    expect(await token.balanceOf(autopay.address)).to.equal(h.toWei("1"));

    tip = await autopay.getPastTipByIndex(ETH_QUERY_ID, 0)
    expect(tip.timestamp).to.equal(blocky.timestamp + 1)
    expect(tip.amount).to.equal(h.toWei("1"))
    expect(await tellor.getTimestampbyQueryIdandIndex(ETH_QUERY_ID, 0)).to.equal(blocky.timestamp)

    await h.advanceTime(3600 * 12)
    await h.expectThrow(tipAndReport.claimOneTimeTip(ETH_QUERY_ID, [blocky.timestamp]))
  })

  it("test no claimTips to pay out", async function() {
    let blocky0 = await h.getBlock();
    await autopay.setupDataFeed(ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, 3600, 600, 0, 0, ETH_QUERY_DATA,0);
    feedId1 = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, 3600, 600, 0, 0]));
    // submit a value, eligible for autopay reward but no balance to pay out
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    let blocky1 = await h.getBlock();
    await h.advanceTime(3600 * 12)
    // claim reward with zero balance
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blocky1.timestamp]))
    // claim reward with balance but report not eligibe 
    await token.faucet(accounts[0].address)
    await token.approve(autopay.address, h.toWei("100"));
    await autopay.fundFeed(feedId1, ETH_QUERY_ID, h.toWei("100"));
    await h.advanceTime(3600 / 2)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    let blocky2 = await h.getBlock();
    await h.advanceTime(3600 * 12)
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blocky2.timestamp]))
  })

  it("test tip, submitValue, tip, submitValue, tip, submitValue, dispute first two", async function() {
    await token.approve(autopay.address, h.toWei("1000"));
    await autopay.tip(ETH_QUERY_ID, h.toWei("1"),ETH_QUERY_DATA)
    await tellor.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock();
    await autopay.tip(ETH_QUERY_ID, h.toWei("10"),ETH_QUERY_DATA)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(101), 0, ETH_QUERY_DATA);
    blocky2 = await h.getBlock();
    await autopay.tip(ETH_QUERY_ID, h.toWei("20"),ETH_QUERY_DATA)
    await token.faucet(accounts[3].address)
    await token.connect(accounts[3]).approve(tellor.address, h.toWei("1000"))
    await tellor.connect(accounts[3]).depositStake(h.toWei("1000"))
    await tellor.connect(accounts[3]).submitValue(ETH_QUERY_ID, h.uintTob32(102), 0, ETH_QUERY_DATA);
    blocky3 = await h.getBlock();
    await token.faucet(accounts[0].address)
    await token.approve(gov.address, h.toWei("1000"))
    await gov.beginDispute(ETH_QUERY_ID, blocky1.timestamp)
    await gov.beginDispute(ETH_QUERY_ID, blocky2.timestamp)

    await h.advanceTime(3600 * 12)
    await h.expectThrow(autopay.connect(accounts[1]).claimOneTimeTip(ETH_QUERY_ID, [blocky1.timestamp]))
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(ETH_QUERY_ID, [blocky2.timestamp]))
    await autopay.connect(accounts[3]).claimOneTimeTip(ETH_QUERY_ID, [blocky3.timestamp])
    reporterBal = await token.balanceOf(accounts[3].address)
    expectedBal = h.toWei((31 * (1000 - FEE) / 1000).toString())
    expect(reporterBal).to.equal(expectedBal)
  })

  it("ensure getCurrentTip doesn't fail if no tip", async function() {
    tipsArray = await autopay.getPastTips(ETH_QUERY_ID)
    assert(tipsArray.length == 0, "tipsArray should be empty")
    currentTip = await autopay.getCurrentTip(ETH_QUERY_ID)
    assert(currentTip == 0, "currentTip should be 0")
  })

  it("test query data storage", async function() {
    await token.approve(autopay.address, h.toWei("1000"))
    queryDataArgs = abiCoder.encode(["string", "string"], ["eth", "usd"]);
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

    queryDataArgs = abiCoder.encode(["string", "string"], ["eth", "usd"]);
    queryData = abiCoder.encode(["string", "bytes"], ["SpotPrice", queryDataArgs]);
    queryId = keccak256(queryData);

    blocky = await h.getBlock();
    await autopay.setupDataFeed(queryId,h.toWei("1"),blocky.timestamp,3600,600,1,3,queryData,0);
    storedQueryData = await queryDataStorage.getQueryData(queryId);
    assert(storedQueryData == queryData, "query data not stored correctly");

    // setup second feed for same query id
    await autopay.setupDataFeed(queryId,h.toWei("1"),blocky.timestamp,3600,1200,1,3,queryData,0);
    storedQueryData = await queryDataStorage.getQueryData(queryId);
    assert(storedQueryData == queryData, "query data not stored correctly");
  })

  it("reward expires after 1 month", async function() {
    await token.approve(autopay.address, h.toWei("100"))
    let blocky0 = await h.getBlock();
    await autopay.setupDataFeed(ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, 3600, 600, 0, 0, ETH_QUERY_DATA, h.toWei("100"));
    feedId1 = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, 3600, 600, 0, 0]));
    // submit 2 values, eligible for autopay reward 
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock();
    await h.advanceTime(3600)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(101), 0, ETH_QUERY_DATA);
    blocky2 = await h.getBlock();
    await h.advanceTime(3600 * 12)

    // claim reward
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blocky2.timestamp]);
    
    expectedReward = await autopay.getRewardAmount(feedId1, ETH_QUERY_ID, [blocky1.timestamp]);
    assert(expectedReward > h.toWei("0.5"), "reward not correct");

    // advance past expiration time
    await h.advanceTime(3600 * 24 * 31)
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blocky1.timestamp]));
  })

  it("price threshold met and report within interval with tbr, should get sloped reward", async function() {
    await token.approve(autopay.address, h.toWei("100"))
    let blocky0 = await h.getBlock();
    await autopay.setupDataFeed(ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, 3600, 600, 100, h.toWei("1"), ETH_QUERY_DATA, h.toWei("100"));
    feedId1 = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [ETH_QUERY_ID, h.toWei("1"), blocky0.timestamp, 3600, 600, 100, h.toWei("1")]));
    // submit value to set baseline 
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(100), 0, ETH_QUERY_DATA);
    await h.advanceTime(3601)
    await tellor.connect(accounts[2]).submitValue(ETH_QUERY_ID, h.uintTob32(200), 0, ETH_QUERY_DATA);
    blocky1 = await h.getBlock();
    await h.advanceTime(3600 * 12)
    assert(await token.balanceOf(accounts[2].address) == 0, "balance should be 0");
    await autopay.connect(accounts[2]).claimTip(feedId1, ETH_QUERY_ID, [blocky1.timestamp]);
    windowStart = blocky0.timestamp + 3600;
    expectedRewardPlusFee = 1 + (blocky1.timestamp - windowStart)
    expectedBalance = BigInt(h.toWei(expectedRewardPlusFee.toString())) * BigInt(1000 - FEE) / BigInt(1000);
    assert(await token.balanceOf(accounts[2].address) > h.toWei("1"), "reward not correct");
    assert(await token.balanceOf(accounts[2].address) == expectedBalance, "reward not correct");
  })
});
