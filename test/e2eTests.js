const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require("web3");

require("chai").use(require("chai-as-promised")).should();

describe("Autopay - e2e tests", function () {
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
      const Token = await ethers.getContractFactory("TestToken");
      token = await Token.deploy();
      await token.deployed();
      await token.mint(accounts[0].address, h.toWei("1000000"));
      firstBlocky = await h.getBlock();
      await autopay.setupPayer(token.address,QUERYID1,h.toWei("1"),firstBlocky.timestamp,3600,600,600,'0x');
      await token.approve(autopay.address, h.toWei("1000000"));
      await autopay.fillPayer(accounts[0].address, QUERYID1, h.toWei("1000000"));
      payerBefore = await autopay.getPayer(accounts[0].address, QUERYID1);
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
    describe("multiple queryID's, refills, pulls", () => {
        await token.mint(accounts[1].address, h.toWei("100"));
        ownerBalance = await token.balanceOf(accounts[0].address)
        reporterBalance = await token.balanceOf(accounts[2].address)
        await autopay.connect(accounts[1]).setupPayer(token.address,QUERYID1,h.toWei("1"),firstBlocky.timestamp,3600,600,'0x');
        await token.approve(autopay.address, h.toWei("1000000"));
        await autopay.fillPayer(accounts[1].address, QUERYID1, h.toWei("1000000"));
        for(i=0;i<10;i++){
            await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3575+i), 0, "0x");
        }
        await token.approve(autopay.address, h.toWei("1000000"));
        await autopay.fillPayer(accounts[1].address, QUERYID1, h.toWei("1000000"));
        for(i=0;i<10;i++){
            await tellor.connect(accounts[2]).submitValue(QUERYID1, h.uintTob32(3575+i), 0, "0x");
        }
        //withdraw funds and check that correct
        //single tip
        //more add funds
        //withdraw
        //assure fee taken is correct
        assert(0 ==1)
      });
    describe("multiple queryID's, several disputes and refills", () => {

        assert(0 ==1)
      });
    describe("test no pay structure, but a tip", () => {
        
        assert(0 ==1)
    });
});