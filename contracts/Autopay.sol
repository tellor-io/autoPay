// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

/**
 @author Tellor Inc.
 @title Autopay
 @dev This is contract for automatically paying for Tellor oracle data at
 * specific time intervals. Any non-rebasing ERC20 token can be used for payment.
 * Only the first data submission within each time window gets a reward.
*/
import "usingtellor/contracts/UsingTellor.sol";
import "./interfaces/IERC20.sol";

contract Autopay is UsingTellor {
    mapping(address => mapping(bytes32 => Payer)) public payers; // payer address => queryId => Payer
    ITellor public master; // Tellor contract address
    address public owner;
    uint256 public fee; // 1000 is 100%, 50 is 5%, etc.

    mapping(bytes32 => mapping(address => uint256)) tips;

    struct Payer {
        address token; // token used for tipping
        uint256 reward; // amount paid for each eligible data submission
        uint256 balance; // payer account remaining balance
        uint256 startTime; // time of first payment window
        uint256 interval; // time between pay periods
        uint256 window; // amount of time data can be submitted per interval
        mapping(uint256 => bool) rewardClaimed; // tracks which tips were already paid out
    }

    // Events
    event NewPayerAccount(address _payerAddress,bytes32 _queryId,bytes _queryData);
    event PayerAccountFilled(
        address _payerAddress,
        bytes32 _queryId,
        address _token,
        uint256 _amount
    );
    event TipAdded(address _token, bytes32 _queryId,uint256 _amount);
    event TipClaimed(address _payerAddress,bytes32 _queryId,address _token,uint256 _amount);

    /**
     * @dev Initializes system parameters
     * @param _tellor address of Tellor contract
     */
    constructor(address payable _tellor, address _owner,uint256 _fee) UsingTellor(_tellor) {
        master = ITellor(_tellor);
        owner = _owner;
        fee = _fee;
    }

    /**
     * @dev Allows Tellor reporters to claim their tips in batches
     * @param _reporter address of Tellor reporter
     * @param _payerAddress address of payer account
     * @param _queryId id of reported data
     * @param _timestamps[] timestamps array of reported data eligible for reward
     */
    function claimTip(
        address _reporter,
        address _payerAddress,
        bytes32 _queryId,
        uint256[] memory _timestamps
    ) external {
        address _reporterAtTimestamp;
        uint256 _reward;
        uint256  _cumulativeReward;
        for (uint256 i = 0; i < _timestamps.length; i++) {
            (_reporterAtTimestamp, _reward) = _claimTip(
                _payerAddress,
                _queryId,
                _timestamps[i]
            );
            require(_reporterAtTimestamp == _reporter, "reporter mismatch");
            _cumulativeReward += _reward;
        }
        if(tips[_queryId][payers[_payerAddress][_queryId].token] > 0){
            _cumulativeReward += tips[_queryId][payers[_payerAddress][_queryId].token];
            tips[_queryId][payers[_payerAddress][_queryId].token] = 0;
        }
        IERC20(payers[_payerAddress][_queryId].token).transfer(
            _reporter,
            (_cumulativeReward * (1000-fee))/1000
        );
        IERC20(payers[_payerAddress][_queryId].token).transfer(
            owner,
            (_cumulativeReward * fee)/1000
        );
        emit TipClaimed(
            _payerAddress,
            _queryId,
            payers[_payerAddress][_queryId].token,
            _cumulativeReward
        );
    }

    /**
     * @dev Allows payer account to be filled with tokens
     * @param _payerAddress address of payer account
     * @param _queryId id of reported data associated with payer account
     * @param _amount quantity of tokens to fund payer account
     */
    function fillPayer(address _payerAddress,bytes32 _queryId,uint256 _amount) external {
        Payer storage _payer = payers[_payerAddress][_queryId];
        require(_payer.reward > 0, "payer not set up");
        require(
            IERC20(_payer.token).transferFrom(
                msg.sender,
                address(this),
                _amount
            ),
            "ERC20: transfer amount exceeds balance"
        );
        _payer.balance += _amount;
        emit PayerAccountFilled(
            _payerAddress,
            _queryId,
            payers[_payerAddress][_queryId].token,
            _amount
        );
    }

    /**
     * @dev Initializes payer parameters. Each payer address can have a single
     * payer account for each queryId.
     * @param _token address of ERC20 token used for tipping
     * @param _queryId id of specific desired data feet
     * @param _reward tip amount per eligible data submission
     * @param _startTime timestamp of first autopay window
     * @param _interval amount of time between autopay windows
     * @param _window amount of time after each new interval when reports are eligible for tips
     */
    function setupPayer(
        address _token,
        bytes32 _queryId,
        uint256 _reward,
        uint256 _startTime,
        uint256 _interval,
        uint256 _window,
        bytes memory _queryData
    ) external {
        require(
            _queryId == keccak256(_queryData) || uint256(_queryId) <= 100,
            "id must be hash of bytes data"
        );
        Payer storage _payer = payers[msg.sender][_queryId];
        require(_payer.balance == 0, "payer balance must be zero to set up");
        require(_reward > 0, "reward must be greater than zero");
        require(
            _window < _interval,
            "window must be less than interval length"
        );
        _payer.token = _token;
        _payer.reward = _reward;
        _payer.startTime = _startTime;
        _payer.interval = _interval;
        _payer.window = _window;
        emit NewPayerAccount(msg.sender, _queryId, _queryData);
    }

    function tip(address _token,bytes32 _queryId,uint256 _amount) external{
        require(
            IERC20(_token).transferFrom(
                msg.sender,
                address(this),
                _amount
            ),
            "ERC20: transfer amount exceeds balance"
        );
        tips[_queryId][_token] += _amount;
        emit TipAdded(_token,_queryId,_amount);
    }

    /**
     * @dev Getter function to read a specific payer struct
     * @param _payerAddress address of payer account
     * @param _queryId id of reported data
     * @return address token
     * @return uint256 reward
     * @return uint256 balance
     * @return uint256 startTime
     * @return uint256 interval
     * @return uint256 window
     */
    function getPayer(address _payerAddress, bytes32 _queryId)
        external
        view
        returns (
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        Payer storage _payer = payers[_payerAddress][_queryId];
        return (
            _payer.token,
            _payer.reward,
            _payer.balance,
            _payer.startTime,
            _payer.interval,
            _payer.window
        );
    }

    /**
     * @dev Getter function to read if a reward has been claimed
     * @param _payerAddress address of payer account
     * @param _queryId id of reported data
     * @param _timestamp id or reported data
     * @return bool rewardClaimed
     */
    function getRewardClaimedStatus(
        address _payerAddress,
        bytes32 _queryId,
        uint256 _timestamp
    ) external view returns (bool) {
        return payers[_payerAddress][_queryId].rewardClaimed[_timestamp];
    }

    /**
     * @dev Internal function which allows Tellor reporters to claim their tips
     * @param _payerAddress address of payer account
     * @param _queryId id of reported data
     * @param _timestamp timestamp of reported data eligible for reward
     * @return address reporter
     * @return uint256 reward amount
     */
    function _claimTip(
        address _payerAddress,
        bytes32 _queryId,
        uint256 _timestamp
    ) internal returns (address, uint256) {
        Payer storage _payer = payers[_payerAddress][_queryId];
        require(_payer.balance > 0, "insufficient payer balance");
        require(!_payer.rewardClaimed[_timestamp], "reward already claimed");
        require(block.timestamp - _timestamp > 12 hours,"buffer time has not passed");
        // ITellor _oracle = ITellor(master.addresses(keccak256(abi.encode("_ORACLE_CONTRACT")))); // use this for tellorX
        address _reporter = master.getReporterByTimestamp(_queryId, _timestamp);
        require(_reporter != address(0), "no value exists at timestamp");
        uint256 _n = (_timestamp - _payer.startTime) / _payer.interval; // finds closest interval _n to timestamp
        uint256 _c = _payer.startTime + _payer.interval * _n; // finds timestamp _c of interval _n
        require(_timestamp - _c < _payer.window, "timestamp not within window");
        (, , uint256 _timestampBefore) = getDataBefore(_queryId, _timestamp);
        require(
            _timestampBefore < _c,
            "timestamp not first report within window"
        );
        uint256 _rewardAmount;
        if (_payer.balance >= _payer.reward) {
            _rewardAmount = _payer.reward;
            _payer.balance -= _payer.reward;
        } else {
            _rewardAmount = _payer.balance;
            _payer.balance = 0;
        }
        _payer.rewardClaimed[_timestamp] = true;
        return (_reporter, _rewardAmount);
    }
}
