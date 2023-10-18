// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "../Autopay.sol";
import "./TellorPlayground.sol";
import "hardhat/console.sol";

// Test contract for tipping and reporting in same block
contract TipAndReport {
    Autopay public autopay;
    TellorPlayground public tellor;
    TellorPlayground public token;

    constructor(address _tellor, address _autopay) {
        autopay = Autopay(_autopay);
        tellor = TellorPlayground(_tellor);
        token = TellorPlayground(tellor.token());
    }

    function claimOneTimeTip(bytes32 _queryId, uint256[] calldata _timestamps) public {
        autopay.claimOneTimeTip(_queryId, _timestamps);
    }

    function tipAndSubmitValue(bytes32 _queryId, uint256 _amount, bytes memory _value, bytes memory _queryData) public {
        _tip(_queryId, _amount, _queryData);
        _submitValue(_queryId, _value, 0, _queryData);
    }

    function depositStake(uint256 _amount) public {
        token.transferFrom(msg.sender, address(this), _amount);
        token.approve(address(tellor), _amount);
        tellor.depositStake(_amount);
    }

    function _tip(bytes32 _queryId, uint256 _amount, bytes memory _queryData) internal {
        token.approve(address(autopay), _amount);
        autopay.tip(_queryId, _amount, _queryData);
    }

    function _submitValue(bytes32 _queryId, bytes memory _value, uint256 _nonce, bytes memory _queryData) internal {
        tellor.submitValue(_queryId, _value, _nonce, _queryData);
    }
}