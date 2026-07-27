# JPEG Pot

[![Cloudflare Production](https://github.com/riceflippa/jpeg-pot/actions/workflows/deploy-cloudflare.yml/badge.svg)](https://github.com/riceflippa/jpeg-pot/actions/workflows/deploy-cloudflare.yml)
[![Live preview](https://img.shields.io/badge/live-Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://jpeg-pot.jpegpot.workers.dev)
[![Project overview](https://img.shields.io/badge/docs-GitHub%20Pages-222?logo=github)](https://riceflippa.github.io/jpeg-pot/)

JPEG Pot is a multichain prize-pool concept for idle NFTs. A holder deposits an
NFT into a chain-local vault and receives a pool position. If the holder can
document commercial media rights, the position may also enter a reviewed media
licensing catalog. Native-crypto license revenue can support prizes, member
distributions, reserves, or verifiable `$POT` buy-and-burn activity.

NFT ownership alone does not prove copyright ownership. Pool membership and
media licensing are deliberately separate: assets without reviewed licensing
authority are never sold as media packages.

- Product preview: [jpeg-pot.jpegpot.workers.dev](https://jpeg-pot.jpegpot.workers.dev)
- Technical showcase: [riceflippa.github.io/jpeg-pot](https://riceflippa.github.io/jpeg-pot/)
- Production workflow: [Cloudflare Production](https://github.com/riceflippa/jpeg-pot/actions/workflows/deploy-cloudflare.yml)

## Product status

The public website is a **testnet product preview**. There is no active prize,
trustless random draw, production contract deployment, or verified live media
inventory. Checkout remains disabled until contract addresses and reviewed
packages are configured.

Before production, the project requires independent contract audits, a funded
and enforceable prize policy, rights-review operations, production monitoring,
multisig authorities, and jurisdiction-specific legal review.

## Documentation

| Document | Purpose |
| --- | --- |
| [Operator guide](docs/OPERATOR_GUIDE.md) | Local setup, configuration, deployments, authority management, and operational gates |
| [Architecture](docs/ARCHITECTURE.md) | Components, trust boundaries, data flows, repository map, and chain model |
| [Protocol reference](docs/PROTOCOL.md) | EVM and Solana state transitions, licensing, revenue, receipts, and `$POT` behavior |
| [Cloudflare deployment](docs/CLOUDFLARE.md) | GitHub Actions bootstrap, repository secrets and variables, verification, and rollback |
| [Operations runbook](docs/RUNBOOK.md) | Routine checks, release procedure, incident response, and recovery |
| [Security policy](SECURITY.md) | Secret handling, vulnerability reporting, and production limitations |
| [Contributing](CONTRIBUTING.md) | Branch, validation, and pull-request expectations |

## Protocol loop

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
- **Solana:** Anchor implementation for Token Metadata and Metaplex Core
  assets; native SOL settlement.
- **No NFT bridge custody:** every NFT remains in a vault on its source chain.
- **Onchain receipts:** every purchase records its package, beneficiary,
  amount, payment reference, and validity period.

The current `$POT` contract is a fixed-supply EVM token. Deployments on
different EVM chains are independent, and the Solana program does not yet mint
an SPL `$POT`. The repository therefore does **not** claim a synchronized
cross-chain token supply. See [Protocol reference](docs/PROTOCOL.md#pot-token-model).

## Quick start

Requirements: Git, Node.js 22 or newer, npm, Rust, Solana CLI, and Anchor 0.32.1
for Solana work.

```bash
git clone https://github.com/riceflippa/jpeg-pot.git
cd jpeg-pot
npm ci
npm run compile
npm test
npm run lint
npm run build
NO_DNA=1 cargo test --workspace
```

Start the local web client:

```bash
cp .env.example .env.local
npm run dev
```

Only public chain identifiers and deployed contract addresses belong in the
frontend environment. Never place deployer keys, seed phrases, Solana keypair
files, or provider credentials in the repository.

## Automated Cloudflare deployment

Pushes to `main` run the complete verification suite and then deploy the
Cloudflare Worker defined by `wrangler.jsonc`. The workflow requires two GitHub
Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Frontend contract addresses are non-secret GitHub Actions variables. Complete
bootstrap and rollback instructions are in [Cloudflare deployment](docs/CLOUDFLARE.md).

## EVM testnet deployment

The deployment script creates the `$POT` token, vault, and licensing contracts,
then authorizes the licensing contract in the vault. It creates no catalog
packages; packages require ownership and rights review.

```bash
npx hardhat keystore set EVM_DEPLOYER_PRIVATE_KEY
npm run deploy:evm:amoy
```

Mainnet scripts exist for Ethereum, Polygon, Base, and Arbitrum, but must not be
used before audit, legal, authority, and deployment reviews.

## License and rights model

Every licensable position needs a documented rights source, affirmative
depositor attestation, operator review, immutable package manifest, and accepted
terms hash. Buyers should retain the package manifest, license terms, and
onchain receipt. See [Protocol reference](docs/PROTOCOL.md#rights-and-licenses).
