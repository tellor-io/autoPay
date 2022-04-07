const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");
const { keccak256 } = require("@ethersproject/keccak256");
require("chai").use(require("chai-as-promised")).should();

describe("Autopay - function tests", () => {
  let tellor,autopay,accounts,token,firstBlocky,blocky,dataFeedBefore,bytesId;
  let array = [];
  let badArray = [];
  let abiCoder = new ethers.utils.AbiCoder();
  const QUERYID1 = h.uintTob32(1);
  const QUERYID2 = h.uintTob32(2);

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
    tellor = await TellorPlayground.deploy();
    await tellor.deployed();
    const Autopay = await ethers.getContractFactory("Autopay");
    autopay = await Autopay.deploy(tellor.address, accounts[0].address, 10);
    await autopay.deployed();
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    await token.deployed();
    await token.mint(accounts[0].address, h.toWei("1000200"));
    firstBlocky = await h.getBlock();
    await autopay.setupDataFeed(token.address,QUERYID1,h.toWei("1"),firstBlocky.timestamp,3600,600,0,"0x");
    bytesId = keccak256(abiCoder.encode(["bytes32", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,token.address,h.toWei("1"),firstBlocky.timestamp,3600,600,0]));
    await token.approve(autopay.address, h.toWei("1000000"));
    await autopay.fundFeed(bytesId, QUERYID1, h.toWei("1000000"));
    payerBefore = await autopay.getDataFeed(bytesId, QUERYID1);
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(3500), 0, "0x");
    blocky = await h.getBlock();
    array[0] = blocky.timestamp;
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3525), 0, "0x");
    blocky = await h.getBlock();
    badArray[0] = blocky.timestamp;
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    h.advanceTime(3600);
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    blocky = await h.getBlock();
    array[1] = blocky.timestamp;
    badArray[1] = blocky.timestamp;
    h.advanceTime(3600);
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(3575), 0, "0x");
    blocky = await h.getBlock();
    array[2] = blocky.timestamp;
  });

  it("constructor", async () => {
    expect(await autopay.master()).to.equal(tellor.address);
    expect(await autopay.owner()).to.equal(accounts[0].address);
    expect(await autopay.fee()).to.equal(10)
  });

  it("claimTip", async () => {
    // Require Checks
    // Advancing time 12 hours to satisfy hardcoded buffer time.
    await h.advanceTime(43200);
    // Expect throw cause of bad timestamp values.
    await h.expectThrow(autopay.claimTip(accounts[1].address, bytesId, QUERYID1, badArray));
    // Testing Events emitted and claiming tips for later checks.
    await expect(autopay.connect(accounts[1]).claimTip(accounts[1].address, bytesId, QUERYID1, array)).to.emit(autopay, "TipClaimed").withArgs(bytesId, QUERYID1, token.address, (h.toWei("3")));
    let payerAfter = await autopay.getDataFeed(bytesId, QUERYID1);
    expect(payerBefore.balance).to.not.equal(payerAfter.balance);
    expect(payerAfter.balance).to.equal(h.toWei("999997"));
    // Updating Balance Checks
    // 1% of each tip being shaved for Tellor ~= .01 token/tip claimed
    // That's why token balance is .03 lower than originally expected.
    expect(await token.balanceOf(accounts[1].address)).to.equal(h.toWei("2.97"));
    // Checking if owner (Tellor) account was updated by fee amount (0.03)
    expect(await token.balanceOf(await autopay.owner())).to.equal(h.toWei("200.03"));
    expect(await token.balanceOf(autopay.address)).to.equal(h.toWei("999997"));
  });

  it("_claimTip", async () => {
    // Require checks
    let result;
    let dataFeedAfter;
    let claimedStatus;
    await h.expectThrow(autopay.claimTip(accounts[10].address, bytesId, QUERYID1, array));
    h.advanceTime(43200);
    await autopay.claimTip(accounts[1].address, bytesId, QUERYID1, array);
    await h.expectThrow(autopay.claimTip(accounts[1].address, bytesId, QUERYID1, array));
    bytesId = keccak256(abiCoder.encode(["string"], ["Joshua"]));
    result = await h.expectThrowMessage(autopay.claimTip(accounts[1].address, bytesId, QUERYID1, array));
    assert.include(result.message, "insufficient feed balance");
    bytesId = keccak256(abiCoder.encode(["bytes32", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,token.address,h.toWei("1"),firstBlocky.timestamp,3600,600,0]));
    blockyNoVal = await h.getBlock()
    result = await h.expectThrowMessage(autopay.claimTip(accounts[1].address, bytesId, QUERYID1, [blockyNoVal.timestamp - (3600 * 12)]));
    assert.include(result.message, "no value exists at timestamp");
    blocky = await h.getBlock();
    await autopay.connect(accounts[10]).setupDataFeed(token.address,QUERYID1,h.toWei("1"),blocky.timestamp,3600,600,0,"0x");
    bytesId = keccak256(abiCoder.encode(["bytes32", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,token.address,h.toWei("1"),blocky.timestamp,3600,600,0]));
    await token.approve(autopay.address, h.toWei("100"));
    await autopay.fundFeed(bytesId, QUERYID1, h.toWei("100"));
    await tellor.connect(accounts[1]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    let goodBlocky = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    let badBlocky = await h.getBlock();
    h.advanceTime(601);
    await tellor.connect(accounts[3]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    blocky = await h.getBlock();
    h.advanceTime(43201);
    result = await h.expectThrowMessage(autopay.claimTip(accounts[3].address, bytesId, QUERYID1, [blocky.timestamp]));
    assert.include(result.message, "timestamp not within window");
    result = await h.expectThrowMessage(autopay.claimTip(accounts[2].address, bytesId, QUERYID1, [badBlocky.timestamp]));
    assert.include(result.message, "timestamp not first report within window");
    // Variable updates
    dataFeedBefore = await autopay.getDataFeed(bytesId, QUERYID1);
    await autopay.claimTip(accounts[1].address, bytesId, QUERYID1, [goodBlocky.timestamp]);
    dataFeedAfter = await autopay.getDataFeed(bytesId, QUERYID1);
    claimedStatus = await autopay.getRewardClaimedStatus(bytesId,QUERYID1,goodBlocky.timestamp);
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
    // require(IERC20(_feed.token).transferFrom(msg.sender,address(this),_amount),"ERC20: transfer amount exceeds balance");
    result = await h.expectThrowMessage(autopay.fundFeed(bytesId, QUERYID1, h.toWei("1000300")));
    //VARIABLE UPDATES
    // _feed.balance += _amount;
    dataFeedDetails = await autopay.getDataFeed(bytesId,QUERYID1);
    expect(dataFeedDetails.balance).to.equal(h.toWei("1000000"));
    //EVENT DETAILS
    // emit DataFeedFunded(_feedId,_queryId,_amount);
    await token.approve(autopay.address, h.toWei("100"));
    await expect(autopay.fundFeed(bytesId, QUERYID1, h.toWei("10"))).to.emit(autopay, "DataFeedFunded").withArgs(bytesId, QUERYID1, h.toWei("10"));
  });

  it("setupDataFeed", async () => {
    let queryIdToUse;
    await h.expectThrowMessage(autopay.setupDataFeed(token.address,h.uintTob32(200),h.toWei("1"),blocky.timestamp,3600,600,0,"0x"));//must be hash
    await h.expectThrowMessage(autopay.setupDataFeed(token.address,QUERYID2,h.toWei("0"),blocky.timestamp,3600,600,0,"0x"));//fee is zerio
    await h.expectThrowMessage(autopay.setupDataFeed(token.address,QUERYID1,h.toWei("1"),blocky.timestamp,600,600,0,"0x"));//already set up
    await h.expectThrowMessage(autopay.setupDataFeed(token.address,QUERYID2,h.toWei("1"),blocky.timestamp,600,3600,0,"0x"));//interval > window
    let result = await autopay.getDataFeed(bytesId, QUERYID1);
    expect(result[0]).to.equal(token.address);
    expect(result[1]).to.equal(h.toWei("1"));
    expect(result[2]).to.equal(h.toWei("1000000"));
    expect(result[3]).to.equal(firstBlocky.timestamp);
    expect(result[4]).to.equal(3600);
    expect(result[5]).to.equal(600);
  });
  it("test getRewardClaimedStatus", async () => {
    let v =  array[0]
    result = await autopay.getRewardClaimedStatus(bytesId,QUERYID1,v);
    expect(result).to.be.false;
    h.advanceTime(86400)
    await autopay.claimTip(accounts[1].address,bytesId, QUERYID1, [v]);
    result = await autopay.getRewardClaimedStatus(bytesId,QUERYID1,v);
    expect(result).to.be.true;
  });
  it("tip", async () => {
    await token.mint(accounts[0].address,web3.utils.toWei("1000"))
    await h.expectThrowMessage(autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x'));
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await h.expectThrowMessage(autopay.tip(token.address,h.uintTob32(200),web3.utils.toWei("100"),'0x')) //must be hash
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    let res = await autopay.getCurrentTip(QUERYID1,token.address);
    assert(res == web3.utils.toWei("100"), "tip 1nshould be correct")
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    await token.approve(autopay.address,web3.utils.toWei("200"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("200"),'0x')
    res = await autopay.getCurrentTip(QUERYID1,token.address);
    assert(res == web3.utils.toWei("200"), "tip 2 should be correct")
    await token.approve(autopay.address,web3.utils.toWei("300"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("300"),'0x')
    res = await autopay.getCurrentTip(QUERYID1,token.address);
    assert(res == web3.utils.toWei("500"), "tip 3 should be correct")
  });
  it("claimOneTimeTip", async () => {
    let startBal = await token.balanceOf(accounts[2].address);
    await tellor.connect(accounts[4]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    blocky1 = await h.getBlock();
    await h.expectThrowMessage(autopay.claimOneTimeTip(token.address,QUERYID1,[blocky.timestamp]));//must have tip
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    await h.expectThrowMessage(autopay.connect(accounts[4]).claimOneTimeTip(token.address,QUERYID1,[blocky.timestamp]));//timestamp not eligible
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    blocky = await h.getBlock();
    await h.expectThrow(autopay.claimOneTimeTip(token.address,QUERYID1,[blocky.timestamp]));//must be the reporter
    await tellor.connect(accounts[3]).submitValue(QUERYID1, h.uintTob32(3551), 0, "0x");
    let blocky2 = await h.getBlock();
    await h.expectThrow(autopay.connect(accounts[3]).claimOneTimeTip(token.address,QUERYID1,[blocky2.timestamp]));//tip earned by previous submission
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(token.address,QUERYID1,[blocky.timestamp])); // buffer time has not passed
    await h.advanceTime(3600 * 12)
    await autopay.connect(accounts[2]).claimOneTimeTip(token.address,QUERYID1,[blocky.timestamp])
    await h.expectThrow(autopay.connect(accounts[2]).claimOneTimeTip(token.address,QUERYID1,[blocky.timestamp]));//tip already claimed
    let res = await autopay.getCurrentTip(QUERYID1,token.address);
    assert(res == 0, "tip should be correct")
    let finBal = await token.balanceOf(accounts[2].address);
    assert(finBal - startBal == web3.utils.toWei("99"), "balance should change correctly")
  });
  it("getDataFeed", async () => {
    result = await autopay.getDataFeed(bytesId, QUERYID1);
    expect(result[0]).to.equal(token.address);
    expect(result[1]).to.equal(h.toWei("1"));
    expect(result[2]).to.equal(h.toWei("1000000"));
    expect(result[3]).to.equal(firstBlocky.timestamp);
    expect(result[4]).to.equal(3600);
    expect(result[5]).to.equal(600);
  });
  it("getCurrentTip", async () => {
    await h.expectThrowMessage(autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x'));
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    let res = await autopay.getCurrentTip(QUERYID1,token.address);
    assert(res == web3.utils.toWei("100"), "tip should be correct")
  });
  it("getPastTips", async () => {
    await token.mint(accounts[0].address,web3.utils.toWei("1500"))
    let res = await autopay.getPastTips(QUERYID1,token.address)
    assert(res.length == 0, "should be no tips",)
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    let blocky1 = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    await token.approve(autopay.address,web3.utils.toWei("200"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("200"),'0x')
    let blocky2 = await h.getBlock();
    res = await autopay.getPastTips(QUERYID1,token.address)
    assert(res[0][0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[0][1] == blocky1.timestamp, "past tip amount should be correct")
    assert(res[1][0] == web3.utils.toWei("200"), "past tip amount should be correct")
    assert(res[1][1] == blocky2.timestamp, "past tip amount should be correct")
    await token.approve(autopay.address,web3.utils.toWei("300"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("300"),'0x')
    let blocky3 = await h.getBlock();
    res = await autopay.getPastTips(QUERYID1,token.address)
    assert(res[0][0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[0][1] == blocky1.timestamp, "past tip 1 timestamp should be correct")
    assert(res[1][0] == web3.utils.toWei("500"), "past tip amount 2 should be correct")
    assert(res[1][1] == blocky3.timestamp, "past tip 2 timestamp should be correct")
    assert(res.length == 2, "length should be correct")
  });
  it("getPastTipByIndex", async () => {
    await token.mint(accounts[0].address,web3.utils.toWei("1500"))
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    let blocky1 = await h.getBlock();
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    await token.approve(autopay.address,web3.utils.toWei("200"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("200"),'0x')
    let blocky2 = await h.getBlock();
    res = await autopay.getPastTipByIndex(QUERYID1,token.address,0)
    assert(res[0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[1] == blocky1.timestamp, "past tip amount should be correct")
    res = await autopay.getPastTipByIndex(QUERYID1,token.address,1)
    assert(res[0] == web3.utils.toWei("200"), "past tip amount should be correct")
    assert(res[1] == blocky2.timestamp, "past tip amount should be correct")
    await token.approve(autopay.address,web3.utils.toWei("300"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("300"),'0x')
    let blocky3 = await h.getBlock();
    res = await autopay.getPastTipByIndex(QUERYID1,token.address,0)
    assert(res[0] == web3.utils.toWei("100"), "past tip amount should be correct")
    assert(res[1] == blocky1.timestamp, "past tip 1 timestamp should be correct")
    res = await autopay.getPastTipByIndex(QUERYID1,token.address,1)
    assert(res[0] == web3.utils.toWei("500"), "past tip amount 2 should be correct")
    assert(res[1] == blocky3.timestamp, "past tip 2 timestamp should be correct")
  });
  it("getPastTipCount", async () => {
    let res = await autopay.getPastTipCount(QUERYID1,token.address)
    assert(res == 0, "past tip count should be correct")
    await token.mint(accounts[0].address,web3.utils.toWei("1500"))
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    res = await autopay.getPastTipCount(QUERYID1,token.address)
    assert(res == 2, "past tip count2  should be correct")
    await token.approve(autopay.address,web3.utils.toWei("100"))
    await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')
    res = await autopay.getPastTipCount(QUERYID1,token.address)
    assert(res == 2, "past tip count 3 should be correct")
  });
  it("getFundedFeeds", async () => {
    // Check one existing funded feed
    let feedIds = await autopay.getFundedFeeds()
    console.log("one feed id", feedIds)
    assert(feedIds.length == 1, "should be one funded feed from previous test")
    let qId = await autopay.getQueryIdFromFeedId(feedIds[0])
    assert(qId == QUERYID1, "incorrect query ID")

    // Check adding one funded feed
    const QUERYID3 = h.uintTob32(3)
    await autopay.setupDataFeed(token.address,QUERYID3,h.toWei("1"),blocky.timestamp,600,400,0,"0x");
    let newFeedId = keccak256(abiCoder.encode(
      ["bytes32", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
      [QUERYID3,token.address,h.toWei("1"),blocky.timestamp,600,400,0]
    ));
    await token.approve(autopay.address, h.toWei("1"));
    await autopay.fundFeed(newFeedId,QUERYID3,h.toWei("1"))
    feedIds = await autopay.getFundedFeeds()
    console.log("2 feedIds",feedIds)
    assert(feedIds.length == 2, "should be two funded feeds")
    assert(feedIds[1] == newFeedId, "incorrect second funded feed query ID")

    // Check remove funded feed

    // await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    // await token.approve(autopay.address,web3.utils.toWei("100"))
    // await autopay.tip(token.address,QUERYID1,web3.utils.toWei("100"),'0x')

  });
});
