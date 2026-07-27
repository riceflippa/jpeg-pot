// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title JPEG Pot multichain EVM vault
/// @notice Custodies ERC-721/1155 assets and records a revocable, versioned media-rights attestation.
/// @dev Deploy one instance per EVM chain. Indexers merge Position events across deployments.
contract JpegPotVault is
    IERC721Receiver,
    IERC1155Receiver,
    Ownable2Step,
    Pausable,
    ReentrancyGuard
{
    enum Standard {
        ERC721,
        ERC1155
    }

    struct Position {
        address depositor;
        address collection;
        uint256 tokenId;
        uint256 amount;
        uint64 depositedAt;
        uint64 licensedUntil;
        uint32 termsVersion;
        Standard standard;
        bool active;
        bool commercialRightsAttested;
        bytes32 termsHash;
    }

    uint64 public immutable withdrawalCooldown;
    uint256 public nextPositionId = 1;
    uint256 public totalActivePositions;
    uint256 public totalNativeRevenue;

    uint32 public termsVersion;
    bytes32 public termsHash;
    string public termsURI;

    mapping(uint256 positionId => Position) public positions;
    mapping(address member => uint256 count) public activePositionsByMember;
    mapping(address collection => mapping(uint256 tokenId => bool active)) public activeERC721;
    mapping(address collection => mapping(uint256 tokenId => uint256 amount)) public custodiedERC1155;
    mapping(address operator => bool approved) public licenseOperators;

    bool private acceptingTransfer;
    address private expectedCollection;
    address private expectedFrom;
    uint256 private expectedTokenId;
    uint256 private expectedAmount;
    Standard private expectedStandard;

    event TermsPublished(uint32 indexed version, bytes32 indexed termsHash, string termsURI);
    event PositionOpened(
        uint256 indexed positionId,
        address indexed depositor,
        address indexed collection,
        uint256 tokenId,
        uint256 amount,
        Standard standard,
        bool commercialRightsAttested,
        uint32 termsVersion,
        bytes32 termsHash
    );
    event PositionWithdrawn(uint256 indexed positionId, address indexed depositor);
    event PositionLicenseLocked(uint256 indexed positionId, uint64 licensedUntil, bytes32 indexed dealId);
    event LicenseOperatorSet(address indexed operator, bool approved);
    event RevenueReceived(address indexed payer, uint256 amount, bytes32 indexed sourceId);
    event RevenueAllocated(address indexed recipient, uint256 amount, bytes32 indexed purposeId);

    error AssetAlreadyDeposited();
    error AssetLocked(uint64 licensedUntil);
    error CooldownActive(uint64 availableAt);
    error DirectTransferRejected();
    error InvalidAmount();
    error InvalidPosition();
    error InvalidTerms();
    error NotLicenseOperator();
    error NotDepositor();
    error RevenueTransferFailed();
    error UnsupportedBatchTransfer();
    error ZeroAddress();

    constructor(
        address initialOwner,
        uint64 initialWithdrawalCooldown,
        bytes32 initialTermsHash,
        string memory initialTermsURI
    ) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        withdrawalCooldown = initialWithdrawalCooldown;
        _publishTerms(initialTermsHash, initialTermsURI);
    }

    function publishTerms(bytes32 newTermsHash, string calldata newTermsURI) external onlyOwner {
        _publishTerms(newTermsHash, newTermsURI);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setLicenseOperator(address operator, bool approved) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        licenseOperators[operator] = approved;
        emit LicenseOperatorSet(operator, approved);
    }

    function depositERC721(
        address collection,
        uint256 tokenId,
        bytes32 acceptedTermsHash,
        bool commercialRightsAttested
    ) external whenNotPaused nonReentrant returns (uint256 positionId) {
        _validateDeposit(collection, 1, acceptedTermsHash);
        if (activeERC721[collection][tokenId]) revert AssetAlreadyDeposited();

        _prepareTransfer(collection, msg.sender, tokenId, 1, Standard.ERC721);
        IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);
        _clearTransfer();
        if (IERC721(collection).ownerOf(tokenId) != address(this)) revert InvalidPosition();

        activeERC721[collection][tokenId] = true;
        positionId = _openPosition(
            msg.sender,
            collection,
            tokenId,
            1,
            Standard.ERC721,
            commercialRightsAttested
        );
    }

    function depositERC1155(
        address collection,
        uint256 tokenId,
        uint256 amount,
        bytes32 acceptedTermsHash,
        bool commercialRightsAttested
    ) external whenNotPaused nonReentrant returns (uint256 positionId) {
        _validateDeposit(collection, amount, acceptedTermsHash);

        uint256 balanceBefore = IERC1155(collection).balanceOf(address(this), tokenId);
        _prepareTransfer(collection, msg.sender, tokenId, amount, Standard.ERC1155);
        IERC1155(collection).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        _clearTransfer();
        if (IERC1155(collection).balanceOf(address(this), tokenId) != balanceBefore + amount) {
            revert InvalidAmount();
        }

        custodiedERC1155[collection][tokenId] += amount;
        positionId = _openPosition(
            msg.sender,
            collection,
            tokenId,
            amount,
            Standard.ERC1155,
            commercialRightsAttested
        );
    }

    function withdraw(uint256 positionId) external nonReentrant {
        Position storage position = positions[positionId];
        if (!position.active) revert InvalidPosition();
        if (position.depositor != msg.sender) revert NotDepositor();

        uint64 availableAt = position.depositedAt + withdrawalCooldown;
        if (block.timestamp < availableAt) revert CooldownActive(availableAt);
        if (block.timestamp < position.licensedUntil) revert AssetLocked(position.licensedUntil);

        position.active = false;
        totalActivePositions -= 1;
        activePositionsByMember[msg.sender] -= 1;

        if (position.standard == Standard.ERC721) {
            activeERC721[position.collection][position.tokenId] = false;
            IERC721(position.collection).safeTransferFrom(address(this), msg.sender, position.tokenId);
        } else {
            custodiedERC1155[position.collection][position.tokenId] -= position.amount;
            IERC1155(position.collection).safeTransferFrom(
                address(this), msg.sender, position.tokenId, position.amount, ""
            );
        }

        emit PositionWithdrawn(positionId, msg.sender);
    }

    /// @notice Locks a licensable position until a commercial deal expires.
    /// @dev `dealId` should hash the signed offchain license record.
    function lockForLicense(uint256 positionId, uint64 until, bytes32 dealId) external {
        if (msg.sender != owner() && !licenseOperators[msg.sender]) revert NotLicenseOperator();
        Position storage position = positions[positionId];
        if (!position.active || !position.commercialRightsAttested) revert InvalidPosition();
        if (until <= block.timestamp) revert InvalidAmount();
        if (until > position.licensedUntil) position.licensedUntil = until;
        emit PositionLicenseLocked(positionId, until, dealId);
    }

    function isLicensable(uint256 positionId) external view returns (bool) {
        Position storage position = positions[positionId];
        return position.active && position.commercialRightsAttested;
    }

    function depositRevenue(bytes32 sourceId) external payable {
        if (msg.value == 0) revert InvalidAmount();
        totalNativeRevenue += msg.value;
        emit RevenueReceived(msg.sender, msg.value, sourceId);
    }

    /// @notice Allocates revenue to a prize winner, buy-and-burn executor, or member distributor.
    function allocateRevenue(address payable recipient, uint256 amount, bytes32 purposeId)
        external
        onlyOwner
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > address(this).balance) revert InvalidAmount();
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert RevenueTransferFailed();
        emit RevenueAllocated(recipient, amount, purposeId);
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external
        view
        override
        returns (bytes4)
    {
        if (
            !acceptingTransfer || operator != address(this) || msg.sender != expectedCollection
                || from != expectedFrom || tokenId != expectedTokenId || expectedAmount != 1
                || expectedStandard != Standard.ERC721
        ) revert DirectTransferRejected();
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(address operator, address from, uint256 tokenId, uint256 amount, bytes calldata)
        external
        view
        override
        returns (bytes4)
    {
        if (
            !acceptingTransfer || operator != address(this) || msg.sender != expectedCollection
                || from != expectedFrom || tokenId != expectedTokenId || amount != expectedAmount
                || expectedStandard != Standard.ERC1155
        ) revert DirectTransferRejected();
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert UnsupportedBatchTransfer();
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId
            || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    function _validateDeposit(address collection, uint256 amount, bytes32 acceptedTermsHash) private view {
        if (collection == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (acceptedTermsHash == bytes32(0) || acceptedTermsHash != termsHash) revert InvalidTerms();
    }

    function _prepareTransfer(
        address collection,
        address from,
        uint256 tokenId,
        uint256 amount,
        Standard standard
    ) private {
        acceptingTransfer = true;
        expectedCollection = collection;
        expectedFrom = from;
        expectedTokenId = tokenId;
        expectedAmount = amount;
        expectedStandard = standard;
    }

    function _clearTransfer() private {
        acceptingTransfer = false;
        expectedCollection = address(0);
        expectedFrom = address(0);
        expectedTokenId = 0;
        expectedAmount = 0;
        expectedStandard = Standard.ERC721;
    }

    function _openPosition(
        address depositor,
        address collection,
        uint256 tokenId,
        uint256 amount,
        Standard standard,
        bool commercialRightsAttested
    ) private returns (uint256 positionId) {
        positionId = nextPositionId++;
        positions[positionId] = Position({
            depositor: depositor,
            collection: collection,
            tokenId: tokenId,
            amount: amount,
            depositedAt: uint64(block.timestamp),
            licensedUntil: 0,
            termsVersion: termsVersion,
            standard: standard,
            active: true,
            commercialRightsAttested: commercialRightsAttested,
            termsHash: termsHash
        });
        totalActivePositions += 1;
        activePositionsByMember[depositor] += 1;

        emit PositionOpened(
            positionId,
            depositor,
            collection,
            tokenId,
            amount,
            standard,
            commercialRightsAttested,
            termsVersion,
            termsHash
        );
    }

    function _publishTerms(bytes32 newTermsHash, string memory newTermsURI) private {
        if (newTermsHash == bytes32(0) || bytes(newTermsURI).length == 0) revert InvalidTerms();
        termsVersion += 1;
        termsHash = newTermsHash;
        termsURI = newTermsURI;
        emit TermsPublished(termsVersion, newTermsHash, newTermsURI);
    }
}
