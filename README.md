[![Tests](https://github.com/tellor-io/autopay/actions/workflows/tests.yml/badge.svg)](https://github.com/tellor-io/autopay/actions/workflows/tests.ymli)

## Overview <a name="overview"> </a>  

<b>Autopay</b> is a system for creating and funding data feeds for use with Tellor. 

## To Use

### Create a recurring data feed

Run `setUpFeed` then `fundFeed`

```solidity 

    /**
     * @param _token address of ERC20 token used for tipping
     * @param _queryId unique identifier of desired data feed
     * @param _reward tip amount per eligible data submission
     * @param _startTime timestamp of first autopay window
     * @param _interval amount of time between autopay windows
     * @param _window amount of time after each new interval when reports are eligible for tips
     * @param _priceThreshold amount price must change to automate update regardless of time (negated if 0, 100 = 1%)
     * @param _queryData the data used by reporters to fulfill the query
    function setupDataFeed(
        address _token,
        bytes32 _queryId,
        uint256 _reward,
        uint256 _startTime,
        uint256 _interval,
        uint256 _window,
        uint256 _priceThreshold,
        bytes calldata _queryData
    )

    .......


    /**
     * @param _feedId unique feed identifier
     * @param _queryId identifier of reported data type associated with feed
     * @param _amount quantity of tokens to fund feed
     */
    function fundFeed(
        bytes32 _feedId,
        bytes32 _queryId,
        uint256 _amount
    ) 

```

### Tip a Query ID

To tip a queryId, giving the tip to the next reporter to sumbit for that ID, run:

```solidity 

    /** 
     * @param _token address of token to tip
     * @param _queryId ID of tipped data
     * @param _amount amount to tip
     * @param _queryData the data used by reporters to fulfill the query
     */
    function tip(
        address _token,
        bytes32 _queryId,
        uint256 _amount,
        bytes calldata _queryData
    ) external {

```


### Receive rewards as a reporter

To receive fees from a recurring feed: 

```solidity 

    /**
     * @param _reporter address of Tellor reporter
     * @param _feedId unique feed identifier
     * @param _queryId ID of reported data
     * @param _timestamps[] batch of timestamps array of reported data eligible for reward
     */
    function claimTip(
        address _reporter,
        bytes32 _feedId,
        bytes32 _queryId,
        uint256[] memory _timestamps
    )

```

To receive fees from a one time tip: 

```solidity 

    /**
     * @param _token address of token tipped
     * @param _queryId ID of reported data
     * @param _timestamps[] batch of timestamps array of reported data eligible for reward
     */
    function claimOneTimeTip(
        address _token,
        bytes32 _queryId,
        uint256[] calldata _timestamps
    )

```

## Setting up and testing

Install Dependencies
```
npm i
```
Compile Smart Contracts
```
npx hardhat compile
```

Test Locally
```
npx hardhat test
```

## Maintainers <a name="maintainers"> </a>
This repository is maintained by the [Tellor team](https://github.com/orgs/tellor-io/people)


## How to Contribute<a name="how2contribute"> </a>  

Check out our issues log here on Github or feel free to reach out anytime [info@tellor.io](mailto:info@tellor.io)

## Copyright

Tellor Inc. 2022
