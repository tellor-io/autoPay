const {expect,assert} = require("chai");
const {ethers} = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");

require("chai").use(require("chai-as-promised")).should();

describe("Autopay - e2e tests", function() {
  let tellor;
  let autopay;
  let accounts;
  const QUERYID1 = h.uintTob32(1);
  const QUERYID2 = h.uintTob32(2);
  const QUERYID3 = h.uintTob32(3);
  const FEE = 10
  const abiCoder = new ethers.utils.AbiCoder;

  beforeEach(async function() {
    accounts = await ethers.getSigners();
    const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
    tellor = await TellorPlayground.deploy();
    await tellor.deployed();
    await tellor.faucet(accounts[0].address);
    const Autopay = await ethers.getContractFactory("AutopayMock");
    autopay = await Autopay.deploy(tellor.address, tellor.address, FEE);
    await autopay.deployed();
  });

  it("test no pay structure, but multiple tips", async function() {
  let autopay1 = autopay.connect(accounts[1])
  await tellor.faucet(accounts[1].address)
  await tellor.connect(accounts[1]).approve(autopay.address, web3.utils.toWei("100"))
  await h.expectThrow(autopay1.tip(QUERYID1, web3.utils.toWei("101"),'0x')) // "ERC20: transfer amount exceeds balance"
  // add first tip
  await autopay1.tip(QUERYID1, web3.utils.toWei("10"),'0x')
  blocky = await h.getBlock()
  assert(await tellor.balanceOf(accounts[1].address) - web3.utils.toWei("990") == 0, "User balance should reduce correctly after tipping")
  assert(await tellor.balanceOf(autopay.address) - web3.utils.toWei("10") == 0, "Autopay contract balance should increase correctly after user adds tip")
  pastTips = await autopay.getPastTips(QUERYID1)
  assert(pastTips.length == 1, "Tips array should be correct length")
  assert(pastTips[0].amount == web3.utils.toWei("10"), "Recorded tip amount should be correct")
  assert(pastTips[0].timestamp == blocky.timestamp, "Tip timestamp should be recorded correctly")
  // submit value
  await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32("200"), 0, '0x')
  blockySubmit1 = await h.getBlock()
  // add second tip
  await autopay1.tip(QUERYID1, web3.utils.toWei("20"),'0x')
  blocky2 = await h.getBlock()
  assert(await tellor.balanceOf(accounts[1].address) - web3.utils.toWei("970") == 0, "User balance should reduce correctly after tipping")
  assert(await tellor.balanceOf(autopay.address) - web3.utils.toWei("30") == 0, "Autopay contract balance should increase correctly after user adds tip")
  pastTips = await autopay.getPastTips(QUERYID1)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == web3.utils.toWei("10"), "First recorded tip amount should be correct")
  assert(pastTips[0].timestamp == blocky.timestamp, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == web3.utils.toWei("20"), "Second recorded tip amount should be correct")
  assert(pastTips[1].timestamp == blocky2.timestamp, "Second tip timestamp should be recorded correctly")
  // add third tip
  await autopay1.tip(QUERYID1, web3.utils.toWei("10"),'0x')
  blocky3 = await h.getBlock()
  assert(await tellor.balanceOf(accounts[1].address) - web3.utils.toWei("960") == 0, "User balance should reduce correctly after tipping")
  assert(await tellor.balanceOf(autopay.address) - web3.utils.toWei("40") == 0, "Autopay contract balance should increase correctly after user adds tip")
  pastTips = await autopay.getPastTips(QUERYID1)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == web3.utils.toWei("10"), "First recorded tip amount should be correct")
  assert(pastTips[0].timestamp == blocky.timestamp, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == web3.utils.toWei("30"), "Second cumulative recorded tip amount should be correct")
  assert(pastTips[1].timestamp == blocky3.timestamp, "Second tip timestamp should be updated correctly")
  // claim first tip
  await h.advanceTime(3600 * 12)
  await autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [blockySubmit1.timestamp])
  assert(await tellor.balanceOf(accounts[2].address) - web3.utils.toWei("9.9") == 0, "Reporter balance should increase correctly after claiming tip")
  assert(await tellor.balanceOf(tellor.address) - web3.utils.toWei("0.1") == 0, "Owner balance should increase correctly after claiming tip")
  assert(await tellor.balanceOf(autopay.address) - web3.utils.toWei("30") == 0, "Autopay contract balance should decrease correctly after paying tip")
  pastTips = await autopay.getPastTips(QUERYID1)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == 0, "First recorded tip amount should be set to zero after tip claimed")
  assert(pastTips[0].timestamp == blocky.timestamp, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == web3.utils.toWei("30"), "Second cumulative recorded tip amount should be correct")
  assert(pastTips[1].timestamp == blocky3.timestamp, "Second tip timestamp should be correct")
  // submit value
  await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32("200"), 0, '0x')
  blockySubmit2 = await h.getBlock()
  // claim second tip
  await h.advanceTime(3600 * 12)
  await autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [blockySubmit2.timestamp])
  assert(await tellor.balanceOf(accounts[2].address) - web3.utils.toWei("39.6") == 0, "Reporter balance should increase correctly after claiming tip")
  assert(await tellor.balanceOf(tellor.address) - web3.utils.toWei("0.4") == 0, "Owner balance should increase correctly after claiming tip")
  assert(await tellor.balanceOf(autopay.address) == 0, "Autopay contract balance should decrease correctly after paying tip")
  pastTips = await autopay.getPastTips(QUERYID1)
  assert(pastTips.length == 2, "Tips array should be correct length")
  assert(pastTips[0].amount == 0, "First recorded tip amount should be set to zero after tip claimed")
  assert(pastTips[0].timestamp == blocky.timestamp, "First tip timestamp should be recorded correctly")
  assert(pastTips[1].amount == 0, "Second cumulative recorded tip amount should be set to zero after tip claimed")
  assert(pastTips[1].timestamp == blocky3.timestamp, "Second tip timestamp should be correct")
})

  it("single queryID, multiple refills, pulls", async function() {
    interval1 = 36000
    window1 = 6000
    reward1 = h.toWei("1")
    reward1MinusFee = reward1 * 0.99
    ownerBalance = await tellor.balanceOf(accounts[0].address)
    reporterBalance = await tellor.balanceOf(accounts[2].address)
    blockyArray1 = new Array()
    blockyArray2 = new Array()
    // setup data feed queryId 1
    blocky = await h.getBlock()
    await autopay.connect(accounts[1]).setupDataFeed(QUERYID1, reward1, blocky.timestamp, interval1, window1, 0, 0, '0x',0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID1, reward1, blocky.timestamp, interval1, window1, 0, 0])
    feedId = feedId = ethers.utils.keccak256(feedBytes)
    await tellor.approve(autopay.address, h.toWei("1000"));
    // fund feed
    await autopay.fundFeed(feedId, QUERYID1, h.toWei("1000"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3575 + i), 0, "0x");
      blockyArray1[i] = await h.getBlock()
    }
    // advance time to next interval
    await h.advanceTime(interval1)
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3585 + i), 0, "0x");
      blockyArray2[i] = await h.getBlock()
    }
    // advance time beyond buffer
    await h.advanceTime(3600 * 12)
    // make sure can't claim invalid tips, interval1
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId, QUERYID1, [blockyArray1[i].timestamp])); // "timestamp not first report within window"
    }
    assert(await tellor.balanceOf(autopay.address) - h.toWei("1000") == 0, "Autopay contract balance should not change")
    assert(await tellor.balanceOf(accounts[2].address) == 0, "Reporter balance should still be zero")
    // valid claim tip, interval1
    await autopay.connect(accounts[2]).claimTip(feedId, QUERYID1, [blockyArray1[0].timestamp])
    assert(await tellor.balanceOf(autopay.address) - h.toWei("999") == 0, "Autopay contract balance should not change")
    assert(await tellor.balanceOf(accounts[2].address) - reward1MinusFee == 0, "Reporter balance should update correctly")
    assert(await tellor.balanceOf(tellor.address) - (reward1 - reward1MinusFee) == 0, "Owner balance should update correctly")
    // faucet more tokens, add tip
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address, h.toWei("10"))
    await autopay.tip(QUERYID1, h.toWei("10"),'0x')
    blocky = await h.getBlock()
    pastTips = await autopay.getPastTips(QUERYID1)
    assert(pastTips.length == 1, "Tips array should be correct length")
    assert(pastTips[0].amount == web3.utils.toWei("10"), "First recorded tip amount should be correct")
    assert(pastTips[0].timestamp == blocky.timestamp, "First tip timestamp should be recorded correctly")
    let abal = await tellor.balanceOf(autopay.address)
    assert(ethers.utils.formatEther(abal) - 999 - 10 == 0, "Autopay contract balance should update correctly")
    // faucet and add more funds to autopay feed
    await tellor.faucet(accounts[0].address)
    await tellor.approve(autopay.address, h.toWei("1000"))
    await autopay.fundFeed(feedId, QUERYID1, h.toWei("1000"));
    feedDetails = await autopay.getDataFeed(feedId)
    assert(feedDetails.reward == reward1, "Recorded reward amount should be correct")
    assert(feedDetails.balance == h.toWei("1999"), "Recorded feed balance should be correct")
    // submit another value (eligible for tip)
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(4000), 0, "0x");
    blocky = await h.getBlock()
    // ensure can't claim one-time-tip for ineligible submissions
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [blockyArray1[i].timestamp])); // "Timestamp not eligible for tip"
    }
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [blockyArray2[i].timestamp])); // "Timestamp not eligible for tip"
    }
    // claim valid one time tip
    ownerBalanceBefore = await tellor.balanceOf(tellor.address)
    await h.advanceTime(3600 * 12)
    await autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [blocky.timestamp])
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [blocky.timestamp])) // Tip already claimed
    assert(await tellor.balanceOf(autopay.address) - h.toWei("1999") == 0, "Autopay contract balance should change correctly")
    assert(await tellor.balanceOf(accounts[2].address) - reward1MinusFee - h.toWei("9.9") == 0, "Reporter balance should update correctly")
    assert(await tellor.balanceOf(tellor.address) - ownerBalanceBefore - h.toWei("0.1") == 0, "Owner balance should change correctly")
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
    await tellor.approve(autopay.address, h.toWei("10000000000"));
    blocky = await h.getBlock()
    // setup data feed queryId 1
    await autopay.connect(accounts[1]).setupDataFeed(QUERYID1, reward1, blocky.timestamp, interval1, window1, 0, 0, '0x',0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID1, reward1, blocky.timestamp, interval1, window1, 0, 0])
    feedId1 = ethers.utils.keccak256(feedBytes)
    // fund feed 1
    await autopay.fundFeed(feedId1, QUERYID1, h.toWei("100"));
    // setup data feed queryId 2
    await autopay.connect(accounts[1]).setupDataFeed(QUERYID2, reward2, blocky.timestamp, interval2, window2, 0, 0, '0x',0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID2, reward2, blocky.timestamp, interval2,window2, 0, 0])
    feedId2 = ethers.utils.keccak256(feedBytes)
    // fund feed 2
    await autopay.fundFeed(feedId2, QUERYID2, h.toWei("100"));
    // setup data feed queryId 3
    await autopay.connect(accounts[1]).setupDataFeed(QUERYID3, reward3, blocky.timestamp, interval3, window3, 0, 0, '0x',0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID3, reward3, blocky.timestamp, interval3, window3, 0, 0])
    feedId3 = ethers.utils.keccak256(feedBytes)
    // fund feed 3
    await autopay.fundFeed(feedId3, QUERYID3, h.toWei("100"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(1575 + i), 0, "0x");
      blockyArray1QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID2, h.uintTob32(2575 + i), 0, "0x");
      blockyArray1QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID3, h.uintTob32(3575 + i), 0, "0x");
      blockyArray1QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray1QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray1QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, QUERYID3, [blockyArray1QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // advance time to next interval
    await h.advanceTime(interval1)
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(1675 + i), 0, "0x");
      blockyArray2QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID2, h.uintTob32(2675 + i), 0, "0x");
      blockyArray2QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID3, h.uintTob32(3675 + i), 0, "0x");
      blockyArray2QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray2QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray2QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips before dispute buffer queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, QUERYID3, [blockyArray2QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // claim tip interval 1 queryID 1
    ownerBalanceBefore = await tellor.balanceOf(tellor.address)
    autopayBalanceBefore = await tellor.balanceOf(autopay.address)
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray1QID1[0].timestamp])
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray1QID1[0].timestamp])) // tip already claimed
    assert(await tellor.balanceOf(accounts[2].address) == h.toWei("0.99"), "Reporter balance should update correctly")
    ownerBalanceAfter = await tellor.balanceOf(tellor.address);
    assert((ownerBalanceAfter.sub(ownerBalanceBefore) - h.toWei("0.01")) == 0, "Owner balance should update correctly")
    autopayBalanceAfter = await tellor.balanceOf(autopay.address);
    assert(autopayBalanceBefore.sub(autopayBalanceAfter) - h.toWei("1") == 0, "Autopay contract balance should update correctly")
    // advance time to next interval
    await h.advanceTime(interval1)
    // dispute first three values from interval 1, queryId 2
    for (i = 0; i < 3; i++) {
      await tellor.beginDispute(QUERYID2, blockyArray1QID2[i].timestamp)
    }
    // ensure can't claim tips for disputed value
    for (i = 0; i < 3; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray1QID2[i].timestamp])) // value with given timestamp doesn't exist
    }
    // claim tip for undisputed valid value
    await autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray1QID2[3].timestamp])
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
    await tellor.approve(autopay.address, h.toWei("10000000000"));
    blocky = await h.getBlock()
    // setup data feed queryId 1
    await autopay.connect(accounts[1]).setupDataFeed(QUERYID1, reward1, blocky.timestamp, interval1, window1, 0, 0,'0x',0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID1, reward1, blocky.timestamp, interval1,window1, 0, 0])
    feedId1 = ethers.utils.keccak256(feedBytes)
    // fund feed 1
    await autopay.fundFeed(feedId1, QUERYID1, h.toWei("2"));
    // setup data feed queryId 2
    await autopay.connect(accounts[1]).setupDataFeed(QUERYID2, reward2, blocky.timestamp + interval1, interval2, window2, 0, 0, '0x',0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID2, reward2, blocky.timestamp + interval1, interval2, window2, 0, 0])
    feedId2 = ethers.utils.keccak256(feedBytes)
    // fund feed 2
    await autopay.fundFeed(feedId2, QUERYID2, h.toWei("100"));
    // setup data feed queryId 3
    await autopay.connect(accounts[1]).setupDataFeed(QUERYID3, reward3, blocky.timestamp + interval1 + interval1, interval3, window3, 0, 0, '0x',0);
    feedBytes = abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID3, reward3, blocky.timestamp + interval1 + interval1, interval3, window3, 0, 0])
    feedId3 = ethers.utils.keccak256(feedBytes)
    // fund feed 3
    await autopay.fundFeed(feedId3, QUERYID3, h.toWei("100"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(1575 + i), 0, "0x");
      blockyArray1QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID2, h.uintTob32(2575 + i), 0, "0x");
      blockyArray1QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID3, h.uintTob32(3575 + i), 0, "0x");
      blockyArray1QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray1QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray1QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, QUERYID3, [blockyArray1QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // advance time 1 interval
    await h.advanceTime(interval1)
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1,QUERYID1, [blockyArray1QID1[i].timestamp])); // buffer time hasn't  passed
    }
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray1QID1[0].timestamp])
    // make sure can't claim any tips queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray1QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, QUERYID3, [blockyArray1QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // add 2 tips
    await autopay.tip(h.uintTob32(4), h.toWei("1"),'0x')
    await autopay.tip(h.uintTob32(4), h.toWei("1"),'0x')
    // submit value
    await tellor.connect(accounts[2]).submitValue(h.uintTob32(4), h.uintTob32(4575), 0, "0x");
    blockyTip1 = await h.getBlock()
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(h.uintTob32(4), [blockyTip1.timestamp])) //buffer time hasn't  passed
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(1575 + i), 0, "0x");
      blockyArray2QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID2, h.uintTob32(2575 + i), 0, "0x");
      blockyArray2QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID3, h.uintTob32(3575 + i), 0, "0x");
      blockyArray2QID3[i] = await h.getBlock()
    }
    // make sure can't claim any tips before dispute buffer queryID 1
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray2QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 2
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray2QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, QUERYID3, [blockyArray2QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // advance time 1 interval
    await h.advanceTime(interval1)
    // make sure can't claim invalid tips queryID 1
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray2QID1[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 2
    for (i = 1; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray2QID2[i].timestamp])); // buffer time hasn't  passed
    }
    // make sure can't claim any tips queryID 3
    for (i = 0; i < 10; i++) {
      await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId3, QUERYID3, [blockyArray2QID3[i].timestamp])); // buffer time hasn't  passed
    }
    // claim 3 good tips
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray2QID1[0].timestamp])
    await autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray2QID2[0].timestamp])
    await autopay.connect(accounts[2]).claimOneTimeTip(h.uintTob32(4), [blockyTip1.timestamp])
    // refill 3 datafeed accounts
    await autopay.fundFeed(feedId1, QUERYID1, h.toWei("10"));
    await autopay.fundFeed(feedId2, QUERYID2, h.toWei("100"));
    await autopay.fundFeed(feedId3, QUERYID3, h.toWei("100"));
    // submit 10 values for queryId 1
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(1575 + i), 0, "0x");
      blockyArray1QID1[i] = await h.getBlock()
    }
    // submit 10 values for queryId 2
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID2, h.uintTob32(2575 + i), 0, "0x");
      blockyArray1QID2[i] = await h.getBlock()
    }
    // submit 10 values for queryId 3
    for (i = 0; i < 10; i++) {
      await tellor.connect(accounts[2]).submitValue(QUERYID3, h.uintTob32(3575 + i), 0, "0x");
      blockyArray1QID3[i] = await h.getBlock()
    }
    // add 2 tips
    await autopay.tip(h.uintTob32(4), h.toWei("1"),'0x')
    await autopay.tip(h.uintTob32(4), h.toWei("1"),'0x')
    // submit value
    await tellor.connect(accounts[2]).submitValue(h.uintTob32(4), h.uintTob32(4575), 0, "0x");
    blockyTip2 = await h.getBlock()
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(h.uintTob32(4), [blockyTip2.timestamp])) //buffer time hasn't  passed
    // advance time one interval
    await h.advanceTime(interval1)
    // refill 3 datafeed accounts
    await autopay.fundFeed(feedId1, QUERYID1, h.toWei("10"));
    await autopay.fundFeed(feedId2, QUERYID2, h.toWei("100"));
    await autopay.fundFeed(feedId3, QUERYID3, h.toWei("100"));
    // claim 4 good tips
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [blockyArray1QID1[0].timestamp])
    await autopay.connect(accounts[2]).claimTip(feedId2, QUERYID2, [blockyArray1QID2[0].timestamp])
    await autopay.connect(accounts[2]).claimTip(feedId3, QUERYID3, [blockyArray1QID3[0].timestamp])
    await autopay.connect(accounts[2]).claimOneTimeTip(h.uintTob32(4), [blockyTip2.timestamp])

    feedDetails1 = await autopay.getDataFeed(feedId1)
    feedDetails2 = await autopay.getDataFeed(feedId2)
    feedDetails3 = await autopay.getDataFeed(feedId3)
    pastTips = await autopay.getPastTips(h.uintTob32(4))

    expect(feedDetails1.balance).to.equal(h.toWei("19"))
    expect(feedDetails2.balance).to.equal(h.toWei("296"))
    expect(feedDetails3.balance).to.equal(h.toWei("297"))
    expect(await tellor.balanceOf(accounts[2].address)).to.equal(h.toWei("13.86"))
    expect(await tellor.balanceOf(tellor.address)).to.equal(h.toWei("0.14"))
    expect(pastTips.length).to.equal(2)
    expect(pastTips[0].amount).to.equal(0)
    expect(pastTips[1].amount).to.equal(0)
  });

  it("priceChange tests", async function() {
    let firstBlocky = await h.getBlock();
    await autopay.setupDataFeed(QUERYID1,h.toWei("1"),firstBlocky.timestamp,86400,600,500,0,"0x",0);
    feedId1= ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,h.toWei("1"),firstBlocky.timestamp,86400,600,500,0]));
    await tellor.approve(autopay.address, h.toWei("1000"));
    await autopay.fundFeed(feedId1, QUERYID1, h.toWei("1000"));
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    firstBlocky = await h.getBlock();
    //can grab right away (change from zero)
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp])
    await h.advanceTime(86400/2)
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    firstBlocky = await h.getBlock();
    //revert on not enough change
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp]))
    await h.advanceTime(86400)
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    firstBlocky = await h.getBlock();
    //not enough change but goes through on time
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp])
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(200), 0, "0x");
    firstBlocky = await h.getBlock();
    //enough change, gets paid out
      //new price > old price
      await h.advanceTime(86400/2)
      await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp])
      await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(50), 0, "0x");
      firstBlocky = await h.getBlock();
      await h.advanceTime(86400/2)
      //old price > new price
      await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp])
    //values are not bytes values
    bytesData = abiCoder.encode(["bytes32","uint256", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,h.toWei("1"),firstBlocky.timestamp,3600,600,0])
    await tellor.connect(accounts[2]).submitValue(QUERYID1,bytesData, 0, "0x");
    firstBlocky = await h.getBlock();
    await h.advanceTime(86400/2)
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp]))
  });

  it("more priceChange tests", async function() {
    let firstBlocky = await h.getBlock();
    await autopay.setupDataFeed(QUERYID1, h.toWei("1"), firstBlocky.timestamp, 3600, 600, 500, 0, "0x",0);
    feedId1 = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID1, h.toWei("1"), firstBlocky.timestamp, 3600, 600, 500, 0]));
    await tellor.approve(autopay.address, h.toWei("1000"));
    await autopay.fundFeed(feedId1, QUERYID1, h.toWei("1000"));
    // up threshold
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    firstBlocky = await h.getBlock();
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp])) // buffer time not passed
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(106), 0, "0x")
    secondBlocky = await h.getBlock();
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp, secondBlocky.timestamp])
    // down threshold
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x")
    firstBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(94), 0, "0x")
    secondBlocky = await h.getBlock();
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp, secondBlocky.timestamp])
    // up down down up up - up bad
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x")
    firstBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(106), 0, "0x")
    secondBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x")
    thirdBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(94), 0, "0x")
    fourthBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x")
    fifthBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(106), 0, "0x")
    sixthBlocky = await h.getBlock();
    // up more without meeting threshold
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(108), 0, "0x")
    firstBlockyBad = await h.getBlock()
    await h.advanceTime(86400/2)
    await autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlocky.timestamp, secondBlocky.timestamp, thirdBlocky.timestamp, fourthBlocky.timestamp, fifthBlocky.timestamp, sixthBlocky.timestamp])
    await h.expectThrow(autopay.connect(accounts[2]).claimTip(feedId1, QUERYID1, [firstBlockyBad.timestamp])) // threshold not met, not first within window
  });

  it("test incrementing of user tips total with multiple tipping/funding", async function() {
    for(i=1; i<6; i++) {
      await tellor.faucet(accounts[i].address)
      await tellor.connect(accounts[i]).approve(autopay.address,h.toWei("1000"))
      assert(await autopay.getTipsByAddress(accounts[i].address) == 0)
    }

    for(i=1; i<6; i++) {
      await autopay.connect(accounts[i]).tip(h.uintTob32(i),h.toWei(i.toString()),'0x')
      assert(await autopay.getTipsByAddress(accounts[i].address) == h.toWei(i.toString()))
    }

    blocky = await h.getBlock()
    await tellor.approve(autopay.address,h.toWei("1000"))
    await autopay.setupDataFeed(QUERYID1,h.toWei("1"),blocky.timestamp,3600,600,0,0,"0x",0)
    bytesId = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,h.toWei("1"),blocky.timestamp,3600,600,0,0]))

    for(i=1; i<6; i++) {
      await autopay.connect(accounts[i]).fundFeed(bytesId, QUERYID1, h.toWei(i.toString()))
      assert(await autopay.getTipsByAddress(accounts[i].address) == h.toWei((i*2).toString()))
    }
  })

  it("test time based rewards", async function() {
    blocky0 = await h.getBlock()
    const INTERVAL = 3600
    // setup data feed with time based rewards
    await tellor.faucet(accounts[2].address)
    await tellor.connect(accounts[2]).approve(autopay.address, h.toWei("1000"))
    feedId = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID1, h.toWei("1"), blocky0.timestamp, INTERVAL, 600, 0, h.toWei("1")]));
    await autopay.setupDataFeed(QUERYID1, h.toWei("1"), blocky0.timestamp, 3600, 600, 0, h.toWei("1"), "0x",0);
    await autopay.connect(accounts[2]).fundFeed(feedId, QUERYID1, h.toWei("1000"));

    // advance some time within window
    await h.advanceTime(10)

    // submit value within window
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    blocky1 = await h.getBlock();

    // advance some time to next window
    await h.advanceTime(INTERVAL + 10)

    // submit value inside next window
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    blocky2 = await h.getBlock();

    // advance some time to next window
    await h.advanceTime(INTERVAL + 10)

    // submit value inside next window
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    blocky3 = await h.getBlock();

    // advance time 12 hours to claim rewards
    await h.advanceTime(3600 * 12)

    // claim rewards
    await autopay.connect(accounts[1]).claimTip(feedId, QUERYID1, [blocky1.timestamp]);
    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky1.timestamp) - BigInt(blocky0.timestamp)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    expectedBalance = expectedReward
    expect(await tellor.balanceOf(accounts[1].address)).to.equal(expectedBalance)

    await autopay.connect(accounts[1]).claimTip(feedId, QUERYID1, [blocky2.timestamp]);
    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky2.timestamp) - BigInt(blocky0.timestamp + INTERVAL * 1)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    expectedBalance = expectedBalance + expectedReward
    expect(await tellor.balanceOf(accounts[1].address)).to.equal(expectedBalance)

    await autopay.connect(accounts[1]).claimTip(feedId, QUERYID1, [blocky3.timestamp]);
    expectedReward = (BigInt(h.toWei("1")) + BigInt(h.toWei("1")) * (BigInt(blocky3.timestamp) - BigInt(blocky0.timestamp + INTERVAL * 2)))
    expectedReward = expectedReward - (expectedReward * BigInt(FEE) / BigInt(1000)) // fee
    expectedBalance = expectedBalance + expectedReward
    expect(await tellor.balanceOf(accounts[1].address)).to.equal(expectedBalance)
  })

  it("test dispute on value", async function() {
    let firstBlocky = await h.getBlock();
    await autopay.setupDataFeed(QUERYID1, h.toWei("1"), firstBlocky.timestamp, 3600, 600, 500, 0, "0x",0);
    feedId1 = ethers.utils.keccak256(abiCoder.encode(["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"], [QUERYID1, h.toWei("1"), firstBlocky.timestamp, 3600, 600, 500, 0]));
    await tellor.approve(autopay.address, h.toWei("100"));
    await autopay.tip(QUERYID1, h.toWei("100"),'0x')
    assert(await autopay.getCurrentTip(QUERYID1) == h.toWei("100"))
    // up threshold
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    firstBlocky = await h.getBlock();
    await tellor.approve(autopay.address, h.toWei("100"));
    await autopay.tip(QUERYID1, h.toWei("100"),'0x')
    assert(await autopay.getCurrentTip(QUERYID1) == h.toWei("100"))
    await tellor.beginDispute(QUERYID1,firstBlocky.timestamp)
    await tellor.approve(autopay.address, h.toWei("100"));
    await autopay.tip(QUERYID1, h.toWei("100"),'0x')
        //now it should add to previous
    assert(await autopay.getCurrentTip(QUERYID1) == h.toWei("200"), "current tip should be double")
    await tellor.connect(accounts[3]).submitValue(QUERYID1, h.uintTob32(100), 0, "0x");
    let firstBlocky2 = await h.getBlock();
    await h.advanceTime(3600 * 12)
    //acount 2 fails to get one time tip
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [firstBlocky.timestamp]))
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(QUERYID1, [firstBlocky2.timestamp]))
    //account 3 gets all the one time tips
    let bal1 = await tellor.balanceOf(accounts[3].address)
    await autopay.connect(accounts[3]).claimOneTimeTip(QUERYID1, [firstBlocky.timestamp,firstBlocky2.timestamp])
    let bal2 = await tellor.balanceOf(accounts[3].address)
    assert(bal2 - bal1 == h.toWei("297"), "payout should be correct");
  })

  it("one time tip same block as report", async function() {
    // deploy TipAndReport contract, which tips and reports in same block
    const TipAndReport = await ethers.getContractFactory("TipAndReport");
    tipAndReport = await TipAndReport.deploy(tellor.address, autopay.address);
    await tipAndReport.deployed();

    await tellor.transfer(tipAndReport.address, h.toWei("1"));
    expect(await tellor.balanceOf(tipAndReport.address)).to.equal(h.toWei("1"));
    await tipAndReport.tipAndSubmitValue(QUERYID1, h.toWei("1"), h.uintTob32(100), "0x");
    blocky = await h.getBlock();
    expect(await tellor.balanceOf(tipAndReport.address)).to.equal(0);
    expect(await tellor.balanceOf(autopay.address)).to.equal(h.toWei("1"));

    tip = await autopay.getPastTipByIndex(QUERYID1, 0)
    expect(tip.timestamp).to.equal(blocky.timestamp)
    expect(tip.amount).to.equal(h.toWei("1"))
    expect(await tellor.getTimestampbyQueryIdandIndex(QUERYID1, 0)).to.equal(blocky.timestamp)

    await h.advanceTime(3600 * 12)
    await tipAndReport.claimOneTimeTip(QUERYID1, [blocky.timestamp])
    expectedBalance = h.toWei((1 * (1000 - FEE) / 1000).toString())
    expect(await tellor.balanceOf(tipAndReport.address)).to.equal(expectedBalance);
    expect(await tellor.balanceOf(autopay.address)).to.equal(0);
  })
});
