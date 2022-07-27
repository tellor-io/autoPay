// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

/**
 @author Tellor Inc.
 @title Keeper
 @dev This is contract for automatically paying for Tellor oracle data at
 * specific time intervals. Any non-rebasing ERC20 token can be used for payment.
 * Only the first data submission within each time window gets a reward.
*/

import "./usingtellor/UsingTellor.sol";
import "./interfaces/IERC20.sol";

contract Keeper is UsingTellor {
    // Storage
    IERC20 public token; // TRB token address
    address public owner;
    uint256 public fee; // 1000 is 100%, 50 is 5%, etc.

    mapping(bytes32 => KeeperTip) public keeperTips; // mapping queryId to keeperTip
    mapping(bytes32 => KeeperJobDetails) jobs; // mapping jobId to queryId to JobDetails
    mapping(address => uint256) public userTipsTotal; // track user tip total per user

    address[] public gasPayment; // array of addresses that funded a job tracked to pay them back remainder

    // Structs
    struct KeeperJobDetails {
        address contractAddress;
        bytes functionSig;
        uint256 triggerStart;
        uint256 chainId;
        uint256 maxGasRefund;
        uint256 interval;
        uint256 window;
        uint256 payReward;
        uint256 balance;
        mapping(uint256 => bool) paid;
    }

    struct KeeperTip {
        uint256 amount;
        uint256 timestamp; // current timestamp
        uint256 timeToCallIt; // Timestamp for when to call the function after
        uint256 maxGasRefund; // Max gas price keeper is recommended to pay in payment token
        address creator;
    }

    // Events
    event JobPaid(
        bytes32 _jobId,
        bytes32 _queryId,
        uint256 _payment,
        address _keeper
    );
    event JobRemoved(bytes32 _queryId, address _creator);
    event KeeperJobFunded(address _creator, uint256 _amount, bytes32 _jobId);
    event KeeperTipAdded(
        uint256 _amount,
        bytes32 _queryId,
        bytes _queryData,
        address _tipper
    );
    event KeeperTipClaimed(bytes32 _queryId, uint256 _amount, address _keeper);
    event MaxGasCoverIncreased(
        uint256 _amount,
        bytes32 _queryId,
        address _creator
    );
    event NewKeeperJob(
        address _creator,
        bytes32 _jobId,
        bytes _queryData,
        uint256 _payment
    );

    // Functions
    /**
     * @dev Initializes system parameters
     * @param _tellor address of Tellor contract
     * @param _token address of token used for tips
     * @param _fee percentage, 1000 is 100%, 50 is 5%, etc.
     */
    constructor(
        address payable _tellor,
        address _token,
        address _owner,
        uint256 _fee
    ) UsingTellor(_tellor) {
        token = IERC20(_token);
        owner = _owner;
        fee = _fee;
    }

    /**
     * @notice Reporter queryId submission to oracle uses the triggerTimestamp not startTime(_triggerStart)
     * @dev Function for claiming tips for jobs, can be called by anyone
     * @param _jobId Hash of the queryId and the job details
     * @param _callTime Timestamp of when keeper triggered function
     */
    function claimJobTips(bytes32 _jobId, uint256 _callTime) external {
        require(
            block.timestamp - _callTime > 12 hours,
            "12 hour buffer not met"
        );
        KeeperJobDetails storage _j = jobs[_jobId];
        require(!_j.paid[_callTime], "Already paid!");
        require(_j.balance > 0, "no balance left");
        uint256 _interval = (_callTime - _j.triggerStart) / _j.interval; // finds closest interval _n to timestamp
        uint256 _window = _j.triggerStart + _j.interval * _interval;
        require((_callTime - _window) < _j.window, "Not within window");

        bytes32 _queryId = _generateQueryId(_jobId, _callTime);

        uint256 _submissionTimestamp = getTimestampbyQueryIdandIndex(
            _queryId,
            0
        );
        require(
            block.timestamp - _submissionTimestamp > 12 hours,
            "12 hour wait submitValue"
        );
        bytes memory _valueRetrieved = retrieveData(
            _queryId,
            _submissionTimestamp
        );
        require(
            keccak256(_valueRetrieved) != keccak256(bytes("")),
            "no value exists at timestamp"
        );

        (, address _keeperAddress, uint256 _triggerTime, uint256 _gasPaid) = abi
            .decode(_valueRetrieved, (bytes32, address, uint256, uint256));

        require(_callTime == _triggerTime, "Timestamp doesn't match");
        uint256 _paymentAmount;
        uint256 _gasRemainder;
        if (_gasPaid >= _j.maxGasRefund) {
            _paymentAmount = _j.maxGasRefund;
            _gasRemainder = 0;
        } else {
            _paymentAmount = _gasPaid;
            _gasRemainder = _j.maxGasRefund - _gasPaid;
        }
        if (_j.balance >= (_j.payReward + _gasRemainder) && _gasRemainder > 0) {
            _paymentAmount += _j.payReward;
            _j.balance -= _gasRemainder;
            _j.balance -= _paymentAmount;
            require(token.transfer(gasPayment[0], _gasRemainder));
        } else if (_j.balance > _j.payReward) {
            _paymentAmount += _j.payReward;
            _j.balance -= _paymentAmount;
        } else {
            _paymentAmount += _j.balance;
            _j.balance = 0;
        }
        require(
            token.transfer(
                _keeperAddress,
                _paymentAmount - ((_paymentAmount * fee) / 1000)
            )
        );
        // token.approve(address(master), (_paymentAmount * fee) / 1000);
        // master.addStakingRewards((_paymentAmount * fee) / 1000);
        require(token.transfer(owner, (_paymentAmount * fee) / 1000));
        _j.paid[_callTime] = true;
        _remove();
        emit JobPaid(_jobId, _queryId, _paymentAmount, _keeperAddress);
    }

    /**
     * @dev Function for funding jobs that have already been setup
     * @param _amount Amount of payment for calling the function excluding gas
     * @param _jobId ID of queryId and function(job) details
     */
    function fundJob(bytes32 _jobId, uint256 _amount) external {
        KeeperJobDetails storage _job = jobs[_jobId];
        require(_job.payReward > 0, "Job not initiated");
        uint256 _tipNGas = _amount + _job.maxGasRefund;
        require(_tipNGas > _job.payReward, "Not enough to cover payment");
        _job.balance += _tipNGas;
        gasPayment.push(msg.sender);
        userTipsTotal[msg.sender] += _amount;
        require(
            token.transferFrom(msg.sender, address(this), _tipNGas),
            "ERC20: transfer amount exceeds balance"
        );
        emit KeeperJobFunded(msg.sender, _amount, _jobId);
    }

    function increaseMaxGasForExistingJob(bytes32 _queryId, uint256 _amount)
        external
    {
        KeeperTip storage _keep = keeperTips[_queryId];
        require(_keep.maxGasRefund > 0, "Job not setup yet");
        require(msg.sender == _keep.creator, "Not job creator");
        _keep.maxGasRefund += _amount;
        require(
            token.transferFrom(msg.sender, address(this), _amount),
            "ERC20: transfer amount exceeds balance"
        );
        emit MaxGasCoverIncreased(_amount, _queryId, msg.sender);
    }

    /**
     * @dev Function for setting up a function call job
     * @param _contractAddress Address of smart contract
     * @param _functionSig Function signature data
     * @param _maxGasRefund Maximum amount of gas a keeper is able to claim
     * @param _triggerStart Timestamp of when the function needs to be called
     * @param _chainId Chain ID for the chain where the contract exists
     * @param _window Time in seconds of the size of window for when the function needs to be triggered
     * @param _interval Time in seconds of how often the function needs to be triggered
     * @param _payReward Payment amount for each function call
     */
    function initKeeperJob(
        bytes calldata _functionSig,
        address _contractAddress,
        uint256 _chainId,
        uint256 _triggerStart,
        uint256 _maxGasRefund,
        uint256 _window,
        uint256 _interval,
        uint256 _payReward
    ) external {
        string memory _type = "TellorKpr";
        bytes memory _encodedArgs = abi.encode(
            _functionSig,
            _contractAddress,
            _chainId,
            _triggerStart,
            _maxGasRefund
        );
        bytes memory _queryData = abi.encode(_type, _encodedArgs);
        require(_payReward > 0, "No free keeping");
        require(_interval > _window, "Interval has to be greater than window");

        bytes32 _jobId = keccak256(
            abi.encode(
                _functionSig,
                _contractAddress,
                _chainId,
                _triggerStart,
                _maxGasRefund,
                _window,
                _interval,
                _payReward
            )
        );
        KeeperJobDetails storage _job = jobs[_jobId];
        require(_job.payReward == 0, "job id already exists, fund Job");
        _job.contractAddress = _contractAddress;
        _job.functionSig = _functionSig;
        _job.triggerStart = _triggerStart;
        _job.chainId = _chainId;
        _job.maxGasRefund = _maxGasRefund;
        _job.interval = _interval;
        _job.window = _window;
        _job.payReward = _payReward;

        emit NewKeeperJob(msg.sender, _jobId, _queryData, _payReward);
    }

    /**
     * @dev Function for claiming a single function call tip
     * @param _queryId ID of query to claim tip for
     */
    function keeperClaimTip(bytes32 _queryId) external {
        uint256 _timestamp = getTimestampbyQueryIdandIndex(_queryId, 0);
        KeeperTip storage _keeperTips = keeperTips[_queryId];
        require(
            block.timestamp - _timestamp > 12 hours,
            "12 hour buffer not met"
        );
        bytes memory _valueRetrieved = retrieveData(_queryId, _timestamp);
        require(
            keccak256(_valueRetrieved) != keccak256(bytes("")),
            "no value exists at timestamp"
        );
        (
            ,
            address _keeperAddress,
            uint256 _whenItWasCalled,
            uint256 _gasPaid
        ) = abi.decode(_valueRetrieved, (bytes32, address, uint256, uint256));
        require(
            keccak256(_valueRetrieved) != keccak256(bytes("")),
            "no value exists at timestamp"
        );
        // require submitted timestamp is after submit timestamp
        require(
            _whenItWasCalled > _keeperTips.timeToCallIt,
            "Function called before its time!"
        );

        require(_keeperTips.amount > 0, "No tips available");
        if (_gasPaid >= _keeperTips.maxGasRefund) {
            _keeperTips.amount += _keeperTips.maxGasRefund;
        } else {
            _keeperTips.amount += _gasPaid;
            require(
                token.transfer(
                    _keeperTips.creator,
                    (_keeperTips.maxGasRefund - _gasPaid)
                )
            );
        }

        require(
            token.transfer(
                _keeperAddress,
                _keeperTips.amount - ((_keeperTips.amount * fee) / 1000)
            )
        );
        token.approve(address(tellor), (_keeperTips.amount * fee) / 1000);
        tellor.addStakingRewards(
            (_keeperTips.amount * fee) / 1000
        );
        _keeperTips.amount = 0;
        emit KeeperTipClaimed(_queryId, _keeperTips.amount, _keeperAddress);
    }

    /**
     * @dev Function to tip keepers to call a function
     * @param _functionSig The function signature data
     * @param _contractAddress The smart contract address where the function is to be called
     * @param _triggerTime The timestamp of when to trigger the function
     * @param _chainId The chain id
     * @param _maxGasRefund The amount of gas covered by creator in payment token
     * @param _tip Amount to tip
     */
    function tipKeeperJob(
        bytes calldata _functionSig,
        address _contractAddress,
        uint256 _chainId,
        uint256 _triggerTime,
        uint256 _maxGasRefund,
        uint256 _tip
    ) external {
        string memory _type = "TellorKpr";
        bytes memory _encodedArgs = abi.encode(
            _functionSig,
            _contractAddress,
            _chainId,
            _triggerTime,
            _maxGasRefund
        );
        bytes memory _queryData = abi.encode(_type, _encodedArgs);
        bytes32 _queryId = keccak256(_queryData);
        KeeperTip storage _k = keeperTips[_queryId];
        if (_k.amount == 0) {
            keeperTips[_queryId] = KeeperTip(
                _tip,
                block.timestamp,
                _triggerTime,
                _maxGasRefund,
                msg.sender
            );
            _tip += _maxGasRefund;
        } else {
            _k.amount += _tip;
        }
        userTipsTotal[msg.sender] += _tip;
        require(
            token.transferFrom(msg.sender, address(this), _tip),
            "ERC20: transfer amount exceeds balance"
        );
        emit KeeperTipAdded(_tip, _queryId, _queryData, msg.sender);
    }

    function unclaimedSingleTipsFallback(bytes32 _queryId) external {
        KeeperTip storage _keep = keeperTips[_queryId];
        require(
            (block.timestamp - _keep.timeToCallIt) > 12 weeks,
            "Wait 12 weeks to get unclaimed tips"
        );
        require(msg.sender == _keep.creator, "Not your job");
        require(_keep.amount > 0, "There are no tips to claim");
        require(token.transfer(msg.sender, _keep.amount + _keep.maxGasRefund));
        _keep.amount = 0;
        emit JobRemoved(_queryId, msg.sender);
    }

    // Getters
    function continuousJobById(bytes32 _jobId)
        external
        view
        returns (
            bytes memory,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        KeeperJobDetails storage _j = jobs[_jobId];
        return (
            _j.functionSig,
            _j.contractAddress,
            _j.chainId,
            _j.triggerStart,
            _j.maxGasRefund,
            _j.window,
            _j.interval,
            _j.payReward,
            _j.balance
        );
    }

    function gasPaymentListCount() external view returns (uint256) {
        return gasPayment.length;
    }

    function getTipsByAddress(address _user) external view returns (uint256) {
        return userTipsTotal[_user];
    }

    function singleJobById(bytes32 _queryId)
        external
        view
        returns (KeeperTip memory)
    {
        return keeperTips[_queryId];
    }

    // Internal functions
    /**
     * @dev Helper function to generate unique queryId for job
     * @param _jobId JobID to generate queryId for
     * @param _timestamp Unique timestamp used to generate queryId
     */
    function _generateQueryId(bytes32 _jobId, uint256 _timestamp)
        internal
        view
        returns (bytes32)
    {
        KeeperJobDetails storage _job = jobs[_jobId];
        string memory _type = "TellorKpr";
        bytes memory _encodedArgs = abi.encode(
            _job.functionSig,
            _job.contractAddress,
            _job.chainId,
            _timestamp,
            _job.maxGasRefund
        );
        bytes memory _queryData = abi.encode(_type, _encodedArgs);
        return keccak256(_queryData);
    }

    /**
     * @dev Helper function to delete first element in gasPayment array
     */
    function _remove() internal {
        for (uint256 i = 0; i < gasPayment.length - 1; i++) {
            gasPayment[i] = gasPayment[i + 1];
        }
        gasPayment.pop();
    }
}
