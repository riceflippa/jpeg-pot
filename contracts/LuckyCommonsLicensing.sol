// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILuckyCommonsVault {
    function isLicensable(uint256 positionId) external view returns (bool);
    function lockForLicense(uint256 positionId, uint64 until, bytes32 dealId) external;
    function depositRevenue(bytes32 sourceId) external payable;
}

/// @title Lucky Commons media licensing marketplace
/// @notice Sells usage licenses for verified packages and mints non-transferable receipts.
/// @dev Settlement is native-chain only. Payment and receipt issuance are atomic.
contract LuckyCommonsLicensing is ERC721, Ownable2Step, Pausable, ReentrancyGuard {
    enum RightsSource {
        PublicDomain,
        DepositorAttestation
    }

    struct LicensePackage {
        bytes32 manifestHash;
        bytes32 licenseTermsHash;
        uint96 nativePrice;
        uint64 duration;
        RightsSource rightsSource;
        bool active;
        string metadataURI;
        string licenseURI;
    }

    struct LicenseReceipt {
        uint256 packageId;
        address purchaser;
        address beneficiary;
        uint64 issuedAt;
        uint64 validUntil;
        uint96 amount;
        bytes32 paymentReference;
    }

    uint256 public constant MAX_POSITIONS_PER_PACKAGE = 32;

    ILuckyCommonsVault public immutable vault;
    uint256 public nextPackageId = 1;
    uint256 public nextReceiptId = 1;

    mapping(uint256 packageId => LicensePackage) public packages;
    mapping(uint256 packageId => uint256[] positionIds) private packagePositions;
    mapping(uint256 receiptId => LicenseReceipt) public receipts;
    event PackageCreated(
        uint256 indexed packageId,
        RightsSource indexed rightsSource,
        bytes32 indexed manifestHash,
        bytes32 licenseTermsHash,
        uint96 nativePrice,
        uint64 duration,
        string metadataURI,
        string licenseURI
    );
    event PackageAvailabilitySet(uint256 indexed packageId, bool active);
    event LicenseIssued(
        uint256 indexed receiptId,
        uint256 indexed packageId,
        address indexed beneficiary,
        address purchaser,
        uint64 validUntil,
        uint96 amount,
        bytes32 paymentReference
    );

    error InvalidAmount();
    error InvalidBeneficiary();
    error InvalidPackage();
    error InvalidRightsSource();
    error InvalidTerms();
    error NativeRailUnavailable();
    error NonTransferable();
    error TooManyPositions();
    error ZeroAddress();

    constructor(address initialOwner, address vaultAddress)
        ERC721("Lucky Commons License", "LC-LICENSE")
        Ownable(initialOwner)
    {
        if (initialOwner == address(0) || vaultAddress == address(0)) revert ZeroAddress();
        vault = ILuckyCommonsVault(vaultAddress);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function createPackage(
        bytes32 manifestHash,
        bytes32 licenseTermsHash,
        uint96 nativePrice,
        uint64 duration,
        RightsSource rightsSource,
        string calldata metadataURI,
        string calldata licenseURI,
        uint256[] calldata positionIds
    ) external onlyOwner returns (uint256 packageId) {
        if (
            manifestHash == bytes32(0) || licenseTermsHash == bytes32(0)
                || bytes(metadataURI).length == 0 || bytes(licenseURI).length == 0
        ) revert InvalidTerms();
        if (nativePrice == 0) revert InvalidAmount();
        if (positionIds.length > MAX_POSITIONS_PER_PACKAGE) revert TooManyPositions();

        if (rightsSource == RightsSource.PublicDomain) {
            if (positionIds.length != 0) revert InvalidRightsSource();
        } else {
            if (positionIds.length == 0 || duration == 0) revert InvalidRightsSource();
            for (uint256 i; i < positionIds.length; ++i) {
                if (!vault.isLicensable(positionIds[i])) revert InvalidRightsSource();
            }
        }

        packageId = nextPackageId++;
        packages[packageId] = LicensePackage({
            manifestHash: manifestHash,
            licenseTermsHash: licenseTermsHash,
            nativePrice: nativePrice,
            duration: duration,
            rightsSource: rightsSource,
            active: true,
            metadataURI: metadataURI,
            licenseURI: licenseURI
        });
        for (uint256 i; i < positionIds.length; ++i) {
            packagePositions[packageId].push(positionIds[i]);
        }

        emit PackageCreated(
            packageId,
            rightsSource,
            manifestHash,
            licenseTermsHash,
            nativePrice,
            duration,
            metadataURI,
            licenseURI
        );
    }

    function setPackageActive(uint256 packageId, bool active) external onlyOwner {
        if (packages[packageId].manifestHash == bytes32(0)) revert InvalidPackage();
        packages[packageId].active = active;
        emit PackageAvailabilitySet(packageId, active);
    }

    function purchaseNative(uint256 packageId, address beneficiary)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 receiptId)
    {
        LicensePackage storage licensePackage = _activePackage(packageId);
        if (licensePackage.nativePrice == 0) revert NativeRailUnavailable();
        if (msg.value != licensePackage.nativePrice) revert InvalidAmount();

        bytes32 paymentReference = keccak256(
            abi.encode(block.chainid, address(this), packageId, msg.sender, beneficiary, nextReceiptId)
        );
        receiptId = _issue(
            packageId,
            msg.sender,
            beneficiary,
            licensePackage.nativePrice,
            paymentReference
        );
        vault.depositRevenue{value: msg.value}(paymentReference);
    }

    function getPackagePositions(uint256 packageId) external view returns (uint256[] memory) {
        return packagePositions[packageId];
    }

    function receiptIsValid(uint256 receiptId) external view returns (bool) {
        LicenseReceipt storage receipt = receipts[receiptId];
        return receipt.beneficiary != address(0) && block.timestamp <= receipt.validUntil;
    }

    function tokenURI(uint256 receiptId) public view override returns (string memory) {
        _requireOwned(receiptId);
        return packages[receipts[receiptId].packageId].metadataURI;
    }

    function _activePackage(uint256 packageId) private view returns (LicensePackage storage licensePackage) {
        licensePackage = packages[packageId];
        if (!licensePackage.active || licensePackage.manifestHash == bytes32(0)) revert InvalidPackage();
    }

    function _issue(
        uint256 packageId,
        address purchaser,
        address beneficiary,
        uint96 amount,
        bytes32 paymentReference
    ) private returns (uint256 receiptId) {
        if (purchaser == address(0) || beneficiary == address(0)) revert InvalidBeneficiary();

        LicensePackage storage licensePackage = packages[packageId];
        uint256 validUntil256 = licensePackage.duration == 0
            ? type(uint64).max
            : block.timestamp + licensePackage.duration;
        if (validUntil256 > type(uint64).max) revert InvalidAmount();
        uint64 validUntil = uint64(validUntil256);

        if (licensePackage.rightsSource == RightsSource.DepositorAttestation) {
            uint256[] storage positionIds = packagePositions[packageId];
            for (uint256 i; i < positionIds.length; ++i) {
                if (!vault.isLicensable(positionIds[i])) revert InvalidRightsSource();
                vault.lockForLicense(positionIds[i], validUntil, paymentReference);
            }
        }

        receiptId = nextReceiptId++;
        receipts[receiptId] = LicenseReceipt({
            packageId: packageId,
            purchaser: purchaser,
            beneficiary: beneficiary,
            issuedAt: uint64(block.timestamp),
            validUntil: validUntil,
            amount: amount,
            paymentReference: paymentReference
        });
        _safeMint(beneficiary, receiptId);

        emit LicenseIssued(
            receiptId,
            packageId,
            beneficiary,
            purchaser,
            validUntil,
            amount,
            paymentReference
        );
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }
}
