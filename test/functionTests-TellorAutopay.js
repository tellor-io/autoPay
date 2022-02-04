const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");

require("chai").use(require("chai-as-promised")).should();

describe("Autopay - function tests", function () {
  let tellor;
  let autopay;
  let accounts;
  let token;
  let firstBlocky;
  let blocky;
  let array = [];
  let badArray = [];
  let payerBefore;
  const QUERYID1 = h.uintTob32(1);
  const QUERYID2 = h.uintTob32(2);

  beforeEach(async function () {
    accounts = await ethers.getSigners();
    const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
    tellor = await TellorPlayground.deploy();
    await tellor.deployed();
    const Autopay = await ethers.getContractFactory("Autopay");
    autopay = await Autopay.deploy(tellor.address,accounts[0].address,10);
    await autopay.deployed();
    //Instantiating a Token to interact with
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy();
    await token.deployed();
    //Minting 1000000 tokens
    await token.mint(accounts[0].address, h.toWei("1000000"));
    //Setting up a block to interact with
    firstBlocky = await h.getBlock();
    //Setup Payers to interact with
    await autopay.setupPayer(
      token.address,
      QUERYID1,
      h.toWei("1"),
      firstBlocky.timestamp,
      3600,
      600,
      600,
      '0x'
    );

    //Approving token amount
    await token.approve(autopay.address, h.toWei("1000000"));
    //Filling Payer balance
    await autopay.fillPayer(accounts[0].address, QUERYID1, h.toWei("1000000"));
    //Getting the state of Payer Struct before reward being claimed
    payerBefore = await autopay.getPayer(accounts[0].address, QUERYID1);
    //Tellor playground dummy data values
    await tellor
      .connect(accounts[1])
      .submitValue(QUERYID1, h.uintTob32(3500), 0, "0x");
    //Setting up a block to interact with
    blocky = await h.getBlock();
    array[0] = blocky.timestamp;
    //Creating a "bad" timestamp
    await tellor
      .connect(accounts[2])
      .submitValue(QUERYID1, h.uintTob32(3525), 0, "0x");
    //Adding it to
    blocky = await h.getBlock();
    badArray[0] = blocky.timestamp;
    await tellor
      .connect(accounts[1])
      .submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    //Advancing Time by one hour
    h.advanceTime(3600);
    //Adding new values after first window
    await tellor
      .connect(accounts[1])
      .submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
    //Setting up a block to interact with
    blocky = await h.getBlock();
    array[1] = blocky.timestamp;
    //Creating more "bad" timestamps for badArray
    badArray[1] = blocky.timestamp;
    //Advancing Time by one hour again
    h.advanceTime(3600);
    //Adding new values after second window
    await tellor
      .connect(accounts[1])
      .submitValue(QUERYID1, h.uintTob32(3575), 0, "0x");
    //Setting up a block to interact with
    blocky = await h.getBlock();
    array[2] = blocky.timestamp;
  });

  describe("constructor function", () => {
    it("constructor", async function () {
      expect(await autopay.master()).to.equal(tellor.address);
    });
  });

  describe("batchClaimTip function", () => {
    it("batchClaimTip", async function () {
      let payerAfter;
      await h.advanceTime(600);
      await h.expectThrow(
        autopay.batchClaimTip(
          accounts[1].address,
          accounts[0].address,
          QUERYID1,
          badArray
        )
      );
      await autopay.batchClaimTip(
        accounts[1].address,
        accounts[0].address,
        QUERYID1,
        array
      );

      //Then check if Contract variables have been changed/updated properly
      payerAfter = await autopay.getPayer(accounts[0].address, QUERYID1);
      expect(payerBefore[2]).to.not.equal(payerAfter[2]);
      expect(payerAfter[2]).to.equal(h.toWei("999997"));
    });
  });

  describe("internal claimTip function", () => {
    describe("require statement checks", () => {
      let result;
      it("checks if payer balance is above 0", async () => {

        await autopay
          .connect(accounts[10])
          .setupPayer(
            token.address,
            QUERYID1,
            h.toWei("1"),
            blocky.timestamp,
            3600,
            600,
            600,
            '0x'
          )

        await h.expectThrow(
          autopay.claimTip(accounts[10].address, QUERYID1, blocky.timestamp)
        );
      });
      it("checks if reward was already claimed", async () => {
        //Advancing Time by one hour to be able to claim tip
        h.advanceTime(600);
        await autopay.claimTip(accounts[0].address, QUERYID1, blocky.timestamp);
        //Call this good for now, maybe something to look
        await h.expectThrow(
          autopay.claimTip(accounts[0].address, QUERYID1, blocky.timestamp)
        );
      });
      it("checks if buffer time has not passed yet", async () => {
        await h.expectThrow(
          autopay.claimTip(accounts[0].address, QUERYID1, blocky.timestamp)
        );
      });
      it("checks if buffer time has not passed yet, VERBOSELY", async () => {
        result = await h.expectThrowMessage(
          autopay.claimTip(accounts[0].address, QUERYID1, blocky.timestamp)
        );
        assert.include(result.message, "buffer time has not passed");
      });
      it("checks if reporter is a valid address", async () => {
        result = await h.expectThrowMessage(
          autopay.claimTip(accounts[0].address, QUERYID1, 0)
        );
        assert.include(result.message, "no value exists at timestamp");
      });
      it("checks if timestamp is within payer designated window", async () => {
        //advance time 20 minutes to get out of designated window
        h.advanceTime(1200);
        //submitting value after designated window
        await tellor
          .connect(accounts[1])
          .submitValue(QUERYID1, h.uintTob32(3550), 0, "0x");
        //accessing block timestamp after advancing time
        blocky = await h.getBlock();
        //advancing time to get out of buffer zone
        h.advanceTime(660);
        result = await h.expectThrowMessage(
          autopay.claimTip(accounts[0].address, QUERYID1, blocky.timestamp)
        );
        assert.include(result.message, "timestamp not within window");
      });
      it("checks if timestamp is not the first report within payer designated window", async () => {
        result = await h.expectThrowMessage(
          autopay.claimTip(accounts[0].address, QUERYID1, badArray[0])
        );
        assert.include(
          result.message,
          "timestamp not first report within window"
        );
      });
    });
    describe("variable updates", () => {
      let payerAfter;
      let claimedStatus;
      beforeEach(async () => {
        payerBefore = await autopay.getPayer(accounts[0].address, QUERYID1);
        await autopay.claimTip(accounts[0].address, QUERYID1, array[0]);
        payerAfter = await autopay.getPayer(accounts[0].address, QUERYID1);
        claimedStatus = await autopay.getRewardClaimedStatus(
          accounts[0].address,
          QUERYID1,
          array[0]
        );
      });

      it("checks if balance was corectly deducted by reward amount", () => {
        expect(payerAfter[2]).to.equal(h.toWei("999999"));
      });
      it("checks if rewardClaimed is now true", () => {
        expect(claimedStatus).to.be.true;
      });
    });
  });

  describe("public claimTip function", () => {
    describe("ERC20 Token transfer", () => {
      it("properly updates the reporters balance with the ERC20 token reward", async () => {
        await autopay.claimTip(accounts[0].address, QUERYID1, array[0]);
        expect(await token.balanceOf(accounts[1].address)).to.equal(
          h.toWei("1")
        );
      });
      it("properly updates the balance of the Autopay contract", async () => {
        await autopay.claimTip(accounts[0].address, QUERYID1, array[0]);
        expect(await token.balanceOf(autopay.address)).to.equal(
          h.toWei("999999")
        );
      });
    });
    describe("event checks", () => {

    })
  });

  //Now testing setupPayer function
  describe("setupPayer function", () => {
    describe("require statements", () => {
      let result;
      it("checks if payer balance is zero during setupPayer process", async () => {
        result = await h.expectThrowMessage(
          autopay.setupPayer(
            token.address,
            QUERYID1,
            h.toWei("1"),
            blocky.timestamp,
            3600,
            600,
            600,
            '0x'
          )
        );
        assert.include(result.message, "payer balance must be zero");
      });
      it("checks if someone tries to initialize a zero reward", async () => {
        result = await h.expectThrowMessage(
          autopay.setupPayer(
            token.address,
            QUERYID2,
            h.toWei("0"),
            blocky.timestamp,
            3600,
            600,
            600,
            '0x'
          )
        );
        assert.include(result.message, "reward must be greater than zero");
      });
      it("checks if window is less than interval", async () => {
        result = await h.expectThrowMessage(
          autopay.setupPayer(
            token.address,
            QUERYID2,
            h.toWei("1"),
            blocky.timestamp,
            600,
            3600,
            600,
            '0x'
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
      it("checks if payer struct is updated correctly after setupPayer is called", async () => {
        result = await autopay.getPayer(accounts[0].address, QUERYID1);
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
        await expect(autopay
          .connect(accounts[10])
          .setupPayer(
            token.address,
            QUERYID1,
            h.toWei("1"),
            blocky.timestamp,
            3600,
            600,
            600,
            '0x'
          )).to.emit(autopay, 'NewPayerAccount').withArgs(accounts[10].address, QUERYID1, '0x');
      })
    })
  });

  //Now testing fillPayer function
  describe("fillPayer function", () => {
    describe("require statements", () => {
      let result;
      it("checks if payer is set up or not", async () => {
        result = await h.expectThrowMessage(
          autopay.fillPayer(accounts[3].address, QUERYID1, h.toWei("100000"))
        );
        assert.include(result.message, "payer not set up");
      });
      it("checks if msg.sender has enough ERC20 tokens to fillPayer", async () => {
        result = await h.expectThrowMessage(
          autopay.fillPayer(accounts[0].address, QUERYID1, h.toWei("100"))
        );
        assert.include(
          result.message,
          "ERC20: transfer amount exceeds balance"
        );
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
        await autopay.fillPayer(accounts[0].address, QUERYID1, h.toWei("10"));
        //check if balance was updated
        result = await autopay.getPayer(accounts[0].address, QUERYID1);
        expect(result[2]).to.equal(h.toWei("1000010"));
      });
    });
  });

  //Testing getters
  describe("getPayer function", () => {
    let result;
    it("checks if getPayer retrieves the proper values", async () => {
      result = await autopay.getPayer(accounts[0].address, QUERYID1);
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
});
