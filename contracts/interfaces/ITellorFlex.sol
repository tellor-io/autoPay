// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

interface ITellorFlex {
    function addStakingRewards(uint256 _amount) external;
    function isInDispute(bytes32 _queryId, uint256 _timestamp) external returns(bool);
}