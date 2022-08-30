// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "../Autopay.sol";

contract AutopayMock is Autopay {
    constructor(
        address payable _tellor,
        address _queryDataStorage,
        uint256 _fee,
        bytes32 _stakingTokenPriceQueryId,
        bytes32 _baseTokenPriceQueryId,
        uint256 _baseTokenPriceDecimals) Autopay(_tellor, _queryDataStorage, _fee, _stakingTokenPriceQueryId, _baseTokenPriceQueryId, _baseTokenPriceDecimals) {}
    
    function bytesToUint(bytes memory _b) public pure returns(uint256) {
        return _bytesToUint(_b);
    }
}