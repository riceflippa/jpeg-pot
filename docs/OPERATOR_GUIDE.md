# Lucky Commons operator guide

This guide is the operational source of truth for the testnet preview. It
describes what an operator can do with the repository today and labels every
step that is not production-ready.

## 1. Operating boundaries

Lucky Commons currently has three independently deployed surfaces:

1. A React web client and Cloudflare Worker.
2. EVM contracts deployed once per supported EVM chain.
3. A Solana Anchor program deployed once per Solana cluster.

The public site is a preview. Do not advertise an active prize, accept live
license payments, or custody production NFTs until the production gates at the
end of this guide are complete.

## 2. Roles and authorities

| Role | Current capability | Production requirement |
| --- | --- | --- |
| GitHub maintainer | Merge code and trigger deployment | Protected `main`, reviewed pull requests, required checks |
| Cloudflare deployer | Publish the web client and Worker | Account-scoped API token stored only as a GitHub secret |
| EVM owner | Pause contracts, publish terms, manage license operators, packages, and revenue | Multisig with documented signer and recovery policy |
| Solana authority | Manage config, packages, license locks, and revenue | Multisig or governed authority; separate upgrade authority |
| Rights reviewer | Approve assets for paid licensing | Written evidence checklist and retained review record |
| Incident lead | Pause affected contracts and coordinate recovery | Named rotation, tested runbook, independent communication channel |

No operator secret belongs in source control, frontend variables, issue text,
Actions logs, or documentation.

## 3. Workstation setup

Required tools:

- Git
- Node.js 22 or newer and npm
- Rust toolchain
- Solana CLI and Anchor 0.32.1 for Solana development
- A browser wallet for user-flow testing

Clone and verify:

```bash
git clone https://github.com/riceflippa/luckycommons.git
cd luckycommons
npm ci
npm run compile
npm test
npm run lint
npm run build
NO_DNA=1 cargo test --workspace
```

`npm ci` is preferred for operator and CI builds because it installs exactly
the dependency graph in `package-lock.json`.

## 4. Frontend configuration

Create an ignored local environment file:

```bash
cp .env.example .env.local
```

| Variable | Meaning | Secret? |
| --- | --- | --- |
| `VITE_EVM_CHAIN` | Default EVM chain key; normally `polygonAmoy` for preview | No |
| `VITE_EVM_VAULT_ADDRESS` | Default EVM vault address | No |
| `VITE_EVM_LICENSING_ADDRESS` | Backward-compatible default licensing address | No |
| `VITE_EVM_LICENSING_POLYGON_AMOY` | Polygon Amoy licensing address | No |
| `VITE_EVM_LICENSING_POLYGON` | Polygon licensing address | No |
| `VITE_EVM_LICENSING_ETHEREUM` | Ethereum licensing address | No |
| `VITE_EVM_LICENSING_BASE` | Base licensing address | No |
| `VITE_EVM_LICENSING_ARBITRUM` | Arbitrum licensing address | No |
| `VITE_SOLANA_CLUSTER` | `devnet` or `mainnet-beta` | No |
| `VITE_SOLANA_PROGRAM_ID` | Deployed Anchor program public key | No |

Every `VITE_` value is embedded in the browser bundle and must be treated as
public. RPC credentials, deployer keys, and keypair material must never use a
`VITE_` variable.

Run locally:

```bash
npm run dev
```

Verify the production-shaped build:

```bash
npm run build
npm run preview
```

## 5. Cloudflare deployment

Production web deployments are owned by
`.github/workflows/deploy-cloudflare.yml`. A push to `main`:

1. Installs locked dependencies.
2. Compiles EVM contracts.
3. Runs contract and web tests.
4. Runs the Solana host tests using the locked Cargo graph.
5. Runs ESLint.
6. Builds the Vite assets.
7. Deploys `worker/index.ts` and `dist/` with Wrangler.
8. Calls `/api/health` on the live site.

The GitHub repository needs `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` as Actions secrets. Public frontend configuration is
stored as Actions variables. Follow [CLOUDFLARE.md](CLOUDFLARE.md) for the
one-time connection and rollback procedure.

Manual deployment is an emergency fallback, not the normal release path:

```bash
npm run deploy:web
```

Record the commit, operator, reason, and resulting Cloudflare version whenever
the fallback is used.

## 6. EVM deployment

### 6.1 Testnet

Hardhat reads deployer and RPC configuration through encrypted configuration
variables. Store the testnet deployer key in the Hardhat keystore:

```bash
npx hardhat keystore set EVM_DEPLOYER_PRIVATE_KEY
npm run deploy:evm:amoy
```

The script deploys, in order:

1. `LuckyCommonsToken`, minting its fixed supply to the deployer address.
2. `LuckyCommonsVault`, with a seven-day withdrawal cooldown and current terms hash.
3. `LuckyCommonsLicensing`, pointing to the new vault.
4. A vault transaction authorizing the licensing contract as a license
   operator.

The command prints a JSON deployment record. Preserve it in an operator-owned
deployment register, not in an unreviewed frontend commit. Verify each address
and constructor argument in the chain explorer before setting GitHub variables.

### 6.2 Mainnet configuration

The supported commands are:

```bash
npm run deploy:evm:polygon
npm run deploy:evm:ethereum
npm run deploy:evm:base
npm run deploy:evm:arbitrum
```

Mainnet RPC URLs and the deployer key belong in Hardhat's encrypted keystore:

```bash
npx hardhat keystore set POLYGON_RPC_URL
npx hardhat keystore set ETHEREUM_RPC_URL
npx hardhat keystore set BASE_RPC_URL
npx hardhat keystore set ARBITRUM_RPC_URL
```

These commands exist for reproducibility; their existence is not authorization
to deploy. Complete the production gates first.

### 6.3 Post-deployment checks

- Confirm the token name, symbol, supply, and treasury balance.
- Confirm vault `owner`, cooldown, terms hash, version, and URI.
- Confirm licensing `owner` and vault address.
- Confirm the licensing contract is an approved vault operator.
- Confirm all contracts can be paused by the intended authority.
- Transfer ownership with the two-step Ownable flow to the production multisig.
- Verify source code and constructor arguments in the chain explorer.
- Set only the reviewed public addresses as GitHub Actions variables.
- Run a small, reversible testnet deposit and withdrawal.
- Run a testnet package purchase and verify its non-transferable receipt.

## 7. Solana program

Install and select the repository's Anchor version:

```bash
avm install 0.32.1
avm use 0.32.1
```

Build with a local program keypair and synchronize its public program ID:

```bash
NO_DNA=1 anchor build
NO_DNA=1 anchor keys sync
NO_DNA=1 anchor build
NO_DNA=1 anchor test
```

The generated `target/deploy/*-keypair.json` is ignored and must remain outside
Git. Back up a production program keypair using an operator-controlled secret
process; do not send it through chat, email, an issue, or a CI variable.

For a reviewed devnet deployment:

```bash
solana config set --url devnet
solana airdrop 2
NO_DNA=1 anchor deploy --provider.cluster devnet
```

After deployment, set `VITE_SOLANA_CLUSTER=devnet` and
`VITE_SOLANA_PROGRAM_ID` to the public program ID. The repository currently
lacks an operator client for `initialize` and package administration, so a
deployment is not operational until those transactions are generated, decoded,
simulated, reviewed, and signed by the authority.

Before every Solana signature, verify cluster, program ID, instruction,
accounts, recipient, amount, fee payer, and simulation result.

## 8. Rights-review procedure

An NFT may join the pool without licensing rights. Paid catalog inclusion
requires all of the following:

1. Identify the exact chain, collection or mint, token ID, and pool position.
2. Capture the rights source independently of marketplace metadata.
3. Obtain the depositor's affirmative commercial-rights attestation.
4. Review scope, territory, duration, exclusivity, prohibited uses, and
   sublicensing.
5. Create an immutable manifest listing every included asset and media file.
6. Hash the final manifest and final license terms.
7. Retain the evidence, review decision, reviewer, and timestamp.
8. Create the onchain package only after the hashes and price are approved.
9. Disable the package immediately if authority or source material is disputed.

The contracts validate onchain position state and stored attestations; they do
not adjudicate copyright ownership.

## 9. Routine operations

Before a release:

- Review the exact diff and dependency changes.
- Run the complete local verification suite.
- Confirm the workflow uses the intended Cloudflare account and Worker.
- Confirm public contract variables match the deployment register.
- Confirm the preview still labels undeployed functionality honestly.

After a release:

- Confirm the GitHub workflow succeeded.
- Check `https://luckycommons.luckycommons.workers.dev/api/health`.
- Exercise the home page on desktop and mobile.
- Confirm wallet prompts target the expected chain and contract.
- Record the Git commit and Cloudflare deployment version.

For incidents, use [RUNBOOK.md](RUNBOOK.md).

## 10. Production gates

Production remains blocked until all applicable items are complete:

- Independent EVM and Solana security audits.
- Threat model and remediation review.
- Trustless, reviewed prize-selection implementation.
- Public prize funding, eligibility, draw, and claims policy.
- Jurisdiction-specific gambling, consumer, sanctions, tax, and IP review.
- Rights evidence and takedown operations.
- Multisig ownership and separate program upgrade authority.
- Unified `$LUCK` supply architecture or explicit chain-specific token policy.
- Monitoring, alerting, indexing, backups, and rehearsed incident response.
- Tested pause, rollback, ownership transfer, and recovery procedures.
