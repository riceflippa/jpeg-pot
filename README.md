# JPEG Pot

JPEG Pot is a multichain prize-pool concept for idle NFTs: lock an old NFT in a
chain-local vault, receive a pool position, and give the asset one more chance
to create value. The NFT is not sold to fund the pot and can be withdrawn after
the cooldown, subject to any active license.

The product has two connected layers:

1. **The pool:** supported NFTs can become membership positions under a public
   eligibility and prize policy.
2. **The revenue engine:** depositors who actually control commercial media
   rights can opt into a searchable media marketplace with category, chain, and
   license filters. Native-crypto license revenue can be allocated to prizes,
   member distributions, reserves, or verifiable `$POT` buy-and-burn activity.

Rights are optional for pool membership. An NFT with no verified commercial
rights is never included in a paid media package.

## Product status

The public website is a **testnet product preview**. There is no active prize,
live draw, or deployed production vault. Its gallery contains generic CSS
interface samples—not real listings—and checkout is intentionally disabled.

Before a production launch, the project needs audited contracts, a public and
enforceable prize policy, funded prize sources, rights-review operations, and
jurisdiction-specific legal review.

Preview: [jpeg-pot.jpegpot.workers.dev](https://jpeg-pot.jpegpot.workers.dev)

Project overview: [riceflippa.github.io/jpeg-pot](https://riceflippa.github.io/jpeg-pot/)

## How the protocol is intended to work

```text
NFT deposit -> pool position -> published prize eligibility
                       |
             optional rights review
                       |
              paid media licenses
                       |
       prizes / member drops / reserves / $POT burn
```

- **EVM:** ERC-721 and ERC-1155 custody on Ethereum, Polygon, Base, and
  Arbitrum; native-asset license settlement.
- **Solana:** planned adapters for Token Metadata NFTs, programmable NFTs,
  Token-2022 NFTs, and Metaplex Core assets; native SOL settlement.
- **No bridge custody:** each NFT remains in a vault on its source chain.
- **Onchain receipts:** a license purchase identifies its package, terms hash,
  beneficiary, payment reference, and validity period.

The current EVM vault can receive revenue and lets its owner allocate funds to a
winner, member distributor, reserve, or buy-and-burn executor. It does **not**
yet implement a trustless random draw. That gap must be closed before the prize
language can describe a live protocol.

## Development

```bash
npm install
npm run compile
npm test
npm run lint
npm run build
NO_DNA=1 cargo test --workspace
```

Copy `.env.example` to `.env.local` and add only public contract addresses.
Never put seed phrases, private keys, or Solana keypair files in the repository.
Local Hardhat accounts are deterministic test identities and must never be used
on a public network.

## EVM deployment

The deployment script creates the token, vault, and licensing contracts, then
authorizes the licensing contract in the vault. It creates no catalog packages;
those must be added only after ownership and rights review.

Store the operator-owned deployer key in Hardhat's encrypted keystore, outside
the web application and repository:

```bash
npx hardhat keystore set EVM_DEPLOYER_PRIVATE_KEY
npm run deploy:evm:amoy
```

Mainnet scripts exist for Ethereum, Polygon, Base, and Arbitrum, but should not
be used before audit, legal review, and an explicit deployment review.

## Solana deployment

The client prepares and simulates a purchase, displays the program, amount, fee
payer, and cluster, and only then asks a connected mobile wallet to sign.
Program and upgrade authorities remain operator-controlled and outside the
repository. A clean SBF build is required before devnet deployment; passing host
tests alone is insufficient.

## Rights and licenses

Token ownership alone does not prove copyright ownership or licensing
authority. Every licensable position needs a documented rights source, an
affirmative depositor attestation, a review, and an accepted-terms hash. Buyers
should retain the package manifest, terms, and onchain receipt.
