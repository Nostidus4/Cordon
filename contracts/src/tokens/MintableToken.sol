// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MintableToken
/// @notice ERC-20 whose `mint` is restricted to a single `minter`: the deployer until handover, then the Council
///         (docs/spec/CONTRACTS.md section 8). Handover is `setMinter(council)`, callable only by the current minter.
abstract contract MintableToken is ERC20 {
    uint8 private immutable _DECIMALS;

    /// @notice Address allowed to mint (and to hand the role over).
    address public minter;

    error NotMinter();

    event MinterChanged(address indexed oldMinter, address indexed newMinter);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _DECIMALS = decimals_;
        minter = msg.sender;
        emit MinterChanged(address(0), msg.sender);
    }

    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }

    // forge-lint: disable-next-line(missing-zero-check)
    function setMinter(address newMinter) external {
        if (msg.sender != minter) revert NotMinter();
        emit MinterChanged(minter, newMinter);
        minter = newMinter;
    }
}
