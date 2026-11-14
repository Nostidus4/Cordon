// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SimpleMultisig
/// @notice Minimal M-of-N multisig that holds the company treasury on C-Chain (OPS-002). Testnet stand-in for a
///         Safe 3/5: owners submit a transaction, other owners confirm it on chain, and any owner executes it once
///         `THRESHOLD` distinct owners confirmed. Not audited, not for real funds.
/// @dev Replay protection: every transaction has a unique id and is executed at most once (`executed`). There is no
///      owner management: the owner set and the threshold are fixed at deployment, which keeps the surface small.
// forge-lint: disable-start(missing-events-access-control, require-revert-in-loop)
contract SimpleMultisig {
    struct Tx {
        address to;
        uint256 value;
        bytes data;
        uint256 confirmations;
        bool executed;
    }

    error InvalidSetup();
    error NotOwner();
    error UnknownTx();
    error AlreadyConfirmed();
    error NotConfirmed();
    error AlreadyExecuted();
    error NotEnoughConfirmations();
    error CallFailed(bytes returnData);

    event Submitted(uint256 indexed id, address indexed owner, address indexed to, uint256 value, bytes data);
    event Confirmed(uint256 indexed id, address indexed owner);
    event Revoked(uint256 indexed id, address indexed owner);
    event Executed(uint256 indexed id, address indexed executor);
    event Received(address indexed from, uint256 amount);

    address[] private _owners;
    uint256 public immutable THRESHOLD;
    mapping(address owner => bool) public isOwner;
    mapping(uint256 id => mapping(address owner => bool)) public confirmedBy;
    Tx[] private _txs;

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner();
        _;
    }

    constructor(address[] memory owners_, uint256 threshold_) {
        if (threshold_ == 0 || threshold_ > owners_.length) revert InvalidSetup();
        for (uint256 i; i < owners_.length; ++i) {
            address o = owners_[i];
            if (o == address(0) || isOwner[o]) revert InvalidSetup();
            isOwner[o] = true;
            _owners.push(o);
        }
        THRESHOLD = threshold_;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function owners() external view returns (address[] memory) {
        return _owners;
    }

    function txCount() external view returns (uint256) {
        return _txs.length;
    }

    function getTx(uint256 id) external view returns (Tx memory) {
        if (id >= _txs.length) revert UnknownTx();
        return _txs[id];
    }

    /// @notice Propose a call. The proposer's own confirmation counts. Returns the transaction id.
    function submit(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256 id) {
        id = _txs.length;
        _txs.push(Tx({to: to, value: value, data: data, confirmations: 1, executed: false}));
        confirmedBy[id][msg.sender] = true;
        emit Submitted(id, msg.sender, to, value, data);
        emit Confirmed(id, msg.sender);
    }

    function confirm(uint256 id) external onlyOwner {
        Tx storage t = _open(id);
        if (confirmedBy[id][msg.sender]) revert AlreadyConfirmed();
        confirmedBy[id][msg.sender] = true;
        ++t.confirmations;
        emit Confirmed(id, msg.sender);
    }

    function revoke(uint256 id) external onlyOwner {
        Tx storage t = _open(id);
        if (!confirmedBy[id][msg.sender]) revert NotConfirmed();
        confirmedBy[id][msg.sender] = false;
        --t.confirmations;
        emit Revoked(id, msg.sender);
    }

    /// @notice Run a confirmed transaction. Marked executed before the call, so it can never run twice.
    function execute(uint256 id) external onlyOwner {
        Tx storage t = _open(id);
        if (t.confirmations < THRESHOLD) revert NotEnoughConfirmations();
        t.executed = true;
        emit Executed(id, msg.sender); // a failing call reverts the whole transaction, event included
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok, bytes memory ret) = t.to.call{value: t.value}(t.data);
        if (!ok) revert CallFailed(ret);
    }

    function _open(uint256 id) private view returns (Tx storage t) {
        if (id >= _txs.length) revert UnknownTx();
        t = _txs[id];
        if (t.executed) revert AlreadyExecuted();
    }
}
// forge-lint: disable-end(missing-events-access-control, require-revert-in-loop)
