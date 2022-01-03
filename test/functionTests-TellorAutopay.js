const { expect } = require("chai");
const { ethers } = require("hardhat");
const h = require("./helpers/helpers");
const web3 = require('web3');

describe("Autopay - function tests", function() {

	let tellor;
  let autopay;
	let accounts;
	const QUERYID1 = h.uintTob32(1)

	beforeEach(async function () {
		accounts = await ethers.getSigners();
		const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
		tellor = await TellorPlayground.deploy();
		await tellor.deployed();
    const Autopay = await ethers.getContractFactory("Autopay");
    autopay = await Autopay.deploy(tellor.address)
    await autopay.deployed();
	});

	it("constructor", async function() {
		expect(await autopay.master()).to.equal(tellor.address)
	})


});
