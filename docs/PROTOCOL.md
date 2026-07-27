# Lucky Commons protocol reference

This document describes the protocol implemented in the repository. It is not a
claim that production contracts, active prizes, or verified licensing inventory
exist.

## Identifiers

Never identify an onchain object by its numeric ID alone.

- EVM position: chain ID + vault address + position ID.
- EVM package: chain ID + licensing address + package ID.
- EVM receipt: chain ID + licensing address + receipt ID.
- Solana position: cluster + program ID + position PDA.
- Solana package: cluster + program ID + package PDA.
- Solana receipt: cluster + program ID + receipt PDA.

This prevents collisions when the same contracts or program are deployed to
multiple networks.

## EVM contracts

### `LuckyCommonsToken`

Properties:

- Name: `Lucky Commons`.
- Symbol: `LUCK`.
- Maximum and initial supply: `1,000,000,000 LUCK`.
- The full supply is minted once to the constructor's treasury address.
- Holders can burn their own tokens.
- ERC-2612 permit is supported.
- There is no post-construction mint function.

The token is not currently referenced by the vault or licensing contract. A
revenue allocation labeled for buy-and-burn only transfers native currency to
an executor; swapping and burning remain separate actions.

### `LuckyCommonsVault`

The vault stores one `Position` for each deposit:

| Field | Meaning |
| --- | --- |
| `depositor` | Address permitted to withdraw |
| `collection` and `tokenId` | Originating NFT |
| `amount` | One for ERC-721; deposited quantity for ERC-1155 |
| `depositedAt` | Cooldown starting time |
| `licensedUntil` | Latest time through which withdrawal is blocked |
| `termsVersion` and `termsHash` | Terms accepted at deposit |
| `standard` | ERC-721 or ERC-1155 |
| `active` | Whether custody position remains open |
| `commercialRightsAttested` | Depositor's optional rights attestation |

#### Deposit

The depositor must approve the vault and pass the current terms hash. The vault
sets an expected-transfer context, calls the NFT contract, verifies custody,
clears the context, stores the position, and emits `PositionOpened`.

Unsolicited safe transfers and ERC-1155 batch transfers are rejected. This
prevents assets from entering custody without a recoverable position record.

#### Withdrawal

Only the recorded depositor may withdraw. The position must be active, its
cooldown must have elapsed, and `licensedUntil` must not be in the future. State
is closed before the external NFT transfer.

#### Terms

The owner can publish a new nonzero terms hash and nonempty URI. New deposits
must accept the current hash. Existing positions preserve the version and hash
they accepted.

#### Revenue

Anyone may deposit positive native value with a `sourceId`. Only the owner can
allocate spendable revenue, and every allocation records a recipient, amount,
and `purposeId`. The contract does not enforce the meaning of a purpose hash.

### `LuckyCommonsLicensing`

A `LicensePackage` stores:

- Manifest hash.
- License terms hash.
- Native-asset price.
- License duration.
- Rights source.
- Active status.
- Package metadata URI.
- License document URI.
- Up to 32 associated vault positions.

`PublicDomain` packages contain no deposited positions and may use a perpetual
duration. `DepositorAttestation` packages must contain active, rights-attested
positions and a positive duration.

#### Purchase

`purchaseNative` requires an active package, nonzero beneficiary, and exact
native payment. It derives a payment reference from chain, contract, package,
purchaser, beneficiary, and the next receipt ID.

For depositor-attested packages, every position is revalidated and locked until
the calculated expiry. The payment is deposited into the vault, and the
beneficiary receives a non-transferable ERC-721 receipt. The receipt records
package, purchaser, beneficiary, issue time, expiry, amount, and payment
reference.

Disabling a package prevents new purchases. It does not rewrite previously
issued receipts or shorten existing position locks.

## Solana program

### Program accounts

| Account | Derivation or role |
| --- | --- |
| Config | Global PDA containing authority, terms, counters, and revenue SOL |
| Vault authority | PDA controlling deposited assets |
| Position | PDA derived from the asset public key |
| License package | PDA derived from package ID |
| License receipt | PDA derived from package, purchaser, and receipt nonce |

The program supports canonical Token Metadata non-fungible and programmable
non-fungible standards, plus Metaplex Core assets. Deposits transfer ownership
to the program's vault authority. Withdrawals require the recorded depositor,
elapsed cooldown, and expired license lock.

### License purchase

The program validates package state, terms, beneficiary, and every position
PDA. It locks associated positions, transfers exact package lamports from the
purchaser to the config account, creates the receipt PDA, updates the receipt
counter, and emits `LicensePurchased`.

The config account retains enough SOL to remain rent-exempt when the authority
allocates revenue.

### Browser transaction flow

`src/lib/solana.ts` derives the required PDAs and creates the purchase
instruction. The client prepares and simulates the unsigned transaction before
requesting a connected wallet signature. The operator and user must still
verify cluster, program ID, package, price, beneficiary, and fee payer.

## Rights and licenses

The protocol stores assertions and hashes; it cannot determine legal ownership.

The canonical offchain record for a package should contain:

- Chain, contract or program, and position identifiers.
- Source media file identifiers and content hashes.
- Rights source and supporting evidence.
- Depositor attestation and wallet signature.
- Permitted and prohibited uses.
- Territory, duration, exclusivity, sublicensing, and revocation terms.
- Price and settlement chain.
- Reviewer identity, decision, and timestamp.
- Final manifest hash and license terms hash.

The exact reviewed bytes must remain retrievable at the published URIs. A URI
that later serves different content does not invalidate the onchain hash, but it
does make the product unusable unless the original bytes are retained.

## Revenue model

License payments settle in the source chain's native asset:

- ETH on Ethereum, Base, and Arbitrum.
- POL on Polygon.
- SOL on Solana.

Revenue can be allocated to a prize winner, member distributor, reserve, or
buy-and-burn executor. Current contracts authorize the owner or Solana authority
to choose the recipient. They do not implement a distribution formula,
trustless draw, decentralized exchange route, or automatic `$LUCK` burn.

Every production allocation needs an approved policy, decoded transaction,
multisig confirmation, and externally auditable purpose record.

## `$LUCK` token model

### Current implementation

`scripts/deploy-evm.ts` deploys a new `LuckyCommonsToken` whenever it deploys a chain
stack. Running that script on multiple chains creates independent one-billion
token supplies. Those deployments share metadata but are not synchronized
representations of one asset.

The Solana program has no SPL Token or Token-2022 `$LUCK` mint. There is no bridge
adapter, global supply registry, cross-chain mint limit, or synchronized burn
accounting in this repository.

Accordingly, `$LUCK` must be described as an EVM contract prototype, not a live
multichain token.

### Production design requirement

Before issuing `$LUCK`, the project must choose and audit one of these policies:

1. **Canonical-chain token:** mint the one-billion supply once and let users
   bridge through an audited lock-and-mint or burn-and-mint system.
2. **Chain-specific tokens:** use distinct names and economics per chain, with
   no claim that balances are interchangeable.

For a canonical multichain design, enforce this invariant:

```text
canonical circulating supply
+ canonical tokens locked for bridging
+ circulating representations on every supported chain
= 1,000,000,000 LUCK
```

Required controls include per-chain mint ceilings, global rate limits, replay
protection, pause controls, monitored bridge messages, independent accounting,
and multisig ownership. The Solana representation would use an SPL Token or
Token-2022 mint whose mint authority is controlled by the audited bridge design,
not a browser or ordinary deployer wallet.

NFTs should remain chain-local even if `$LUCK` becomes portable.

## Events and indexing

Production catalog and accounting services should index at least:

- `TermsPublished`
- `PositionOpened`
- `PositionWithdrawn`
- `PositionLicenseLocked`
- `PackageCreated` / `LicensePackageCreated`
- `PackageAvailabilitySet` / `LicensePackageAvailabilitySet`
- `LicenseIssued` / `LicensePurchased`
- `RevenueReceived`
- `RevenueAllocated`

Indexers must handle finality, reorganizations, duplicate delivery, backfills,
and deployment-specific starting blocks or slots. Indexed state is a cache; the
chain remains authoritative.
