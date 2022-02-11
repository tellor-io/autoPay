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
    await autopay.setupDataFeed(token.address,QUERYID1,h.toWei("1"),firstBlocky.timestamp,3600,600,"0x");
    bytesId = keccak256(abiCoder.encode(["bytes32", "address", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,token.address,h.toWei("1"),firstBlocky.timestamp,3600,600]));
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

  it("Tests constructor()", async () => {
    expect(await autopay.master()).to.equal(tellor.address);
  });

  it("Tests claimTip()", async () => {
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

  it("Tests _claimTip()", async () => {
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
    bytesId = keccak256(abiCoder.encode(["bytes32", "address", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,token.address,h.toWei("1"),firstBlocky.timestamp,3600,600]));
    result = await h.expectThrowMessage(autopay.claimTip(accounts[1].address, bytesId, QUERYID1, [0]));
    assert.include(result.message, "no value exists at timestamp");
    blocky = await h.getBlock();
    await autopay.connect(accounts[10]).setupDataFeed(token.address,QUERYID1,h.toWei("1"),blocky.timestamp,3600,600,"0x");
    bytesId = keccak256(abiCoder.encode(["bytes32", "address", "uint256", "uint256", "uint256", "uint256"],[QUERYID1,token.address,h.toWei("1"),blocky.timestamp,3600,600]));
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
  
  it("Tests fundFeed()", async () => {
    let result;
    let dataFeedDetails;
    //REQUIRE CHECKS
    // require(_feed.reward > 0,"feed not set up");
    result = await h.expectThrowMessage(autopay.fundFeed(bytesId, QUERYID2, h.toWei("1000000")));
    assert.include(result.message, "feed not set up");
    // require(IERC20(_feed.token).transferFrom(msg.sender,address(this),_amount),"ERC20: transfer amount exceeds balance");
    result = await h.expectThrowMessage(autopay.fundFeed(bytesId, QUERYID1, h.toWei("1000300")));
    assert.include(result.message, "ERC20: transfer amount exceeds balance");
    //VARIABLE UPDATES
    // _feed.balance += _amount;
    dataFeedDetails = await autopay.getDataFeed(bytesId,QUERYID1);
    expect(dataFeedDetails.balance).to.equal(h.toWei("1000000"));
    //EVENT DETAILS
    // emit DataFeedFunded(_feedId,_queryId,_amount);
    await token.approve(autopay.address, h.toWei("100"));
    await expect(autopay.fundFeed(bytesId, QUERYID1, h.toWei("10"))).to.emit(autopay, "DataFeedFunded").withArgs(bytesId, QUERYID1, h.toWei("10"));
  });

  it("Tests setupDataFeed()", async () => {
    let queryIdToUse;
    //Require Checks
    //require(_queryId == keccak256(_queryData) || uint256(_queryId) <= 100, "id must be hash of bytes data");
    autopay.setupDataFeed()
  });
});

//Now testing setupDataFeed function
describe("setupDataFeed function", () => {
  describe("require statements", () => {
    let result;
    it("checks if payer balance is zero during setupDataFeed process", async () => {
      result = await h.expectThrowMessage(
        autopay.setupDataFeed(
          token.address,
          QUERYID1,
          h.toWei("1"),
          blocky.timestamp,
          3600,
          600,
          "0x"
        )
      );
      assert.include(result.message, "payer balance must be zero");
    });
    it("checks if someone tries to initialize a zero reward", async () => {
      result = await h.expectThrowMessage(
        autopay.setupDataFeed(
          token.address,
          QUERYID2,
          h.toWei("0"),
          blocky.timestamp,
          3600,
          600,
          "0x"
        )
      );
      assert.include(result.message, "reward must be greater than zero");
    });
    it("checks if window is less than interval", async () => {
      result = await h.expectThrowMessage(
        autopay.setupDataFeed(
          token.address,
          QUERYID2,
          h.toWei("1"),
          blocky.timestamp,
          600,
          3600,
          "0x"
        )
      );
      assert.include(
        result.message,
        "window must be less than interval length"
      );
    });
  });
  describe("variable updates", () => {
    let result;
    it("checks if payer struct is updated correctly after setupDataFeed is called", async () => {
      result = await autopay.getDataFeed(accounts[0].address, QUERYID1);
      expect(result[0]).to.equal(token.address);
      expect(result[1]).to.equal(h.toWei("1"));
      expect(result[2]).to.equal(h.toWei("1000000"));
      expect(result[3]).to.equal(firstBlocky.timestamp);
      expect(result[4]).to.equal(3600);
      expect(result[5]).to.equal(600);
      expect(result[6]).to.equal(600);
    });
  });
  describe("event checks", () => {
    it("checks if NewPayerAccount event is emitted correctly", async () => {
      await expect(
        autopay
          .connect(accounts[10])
          .setupDataFeed(
            token.address,
            QUERYID1,
            h.toWei("1"),
            blocky.timestamp,
            3600,
            600,
            "0x"
          )
      )
        .to.emit(autopay, "NewPayerAccount")
        .withArgs(accounts[10].address, QUERYID1, "0x");
    });
  });
});

//Now testing fundFeed function
describe("fundFeed function", () => {
  describe("require statements", () => {
    let result;
    it("checks if payer is set up or not", async () => {
      result = await h.expectThrowMessage(
        autopay.fundFeed(bytesId, QUERYID1, h.toWei("100000"))
      );
      assert.include(result.message, "payer not set up");
    });
    it("checks if msg.sender has enough ERC20 tokens to fundFeed", async () => {
      result = await h.expectThrowMessage(
        autopay.fundFeed(bytesId, QUERYID1, h.toWei("100"))
      );
      assert.include(result.message, "ERC20: transfer amount exceeds balance");
    });
  });
  describe("variable updates", () => {
    let result;
    it("increases payer balance by amount specified at function call", async () => {
      //mint
      await token.mint(accounts[0].address, h.toWei("1000"));
      //aprrove
      await token.approve(autopay.address, h.toWei("1000"));
      //fill
      await autopay.fundFeed(bytesId, QUERYID1, h.toWei("10"));
      //check if balance was updated
      result = await autopay.getDataFeed(accounts[0].address, QUERYID1);
      expect(result[2]).to.equal(h.toWei("1000010"));
    });
  });
});

//Testing getters
describe("getDataFeed function", () => {
  let result;
  it("checks if getDataFeed retrieves the proper values", async () => {
    result = await autopay.getDataFeed(accounts[0].address, QUERYID1);
    expect(result[0]).to.equal(token.address);
    expect(result[1]).to.equal(h.toWei("1"));
    expect(result[2]).to.equal(h.toWei("1000000"));
    expect(result[3]).to.equal(firstBlocky.timestamp);
    expect(result[4]).to.equal(3600);
    expect(result[5]).to.equal(600);
    expect(result[6]).to.equal(600);
  });
});
describe("getRewardClaimedStatus function", () => {
  let result;
  it("checks if getRewardClaimedStatus retrieves the proper value", async () => {
    result = await autopay.getRewardClaimedStatus(
      accounts[0].address,
      QUERYID1,
      array[0]
    );
    expect(result).to.be.false;
    await autopay.claimTip(accounts[0].address, QUERYID1, array[0]);
    result = await autopay.getRewardClaimedStatus(
      accounts[0].address,
      QUERYID1,
      array[0]
    );
    expect(result).to.be.true;
  });
});
