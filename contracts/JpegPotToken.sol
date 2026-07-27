// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title JPEG Pot membership token
/// @notice Fixed-supply token intended for community rewards and buy-and-burn programs.
contract JpegPotToken is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    constructor(address treasury)
        ERC20("JPEG Pot", "POT")
        ERC20Permit("JPEG Pot")
    {
        if (treasury == address(0)) revert ZeroAddress();
        _mint(treasury, MAX_SUPPLY);
    }

    error ZeroAddress();
}
