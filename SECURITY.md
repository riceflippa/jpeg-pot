# Security policy

Lucky Commons is a testnet product preview. The contracts and Solana program have not
completed an independent production audit and must not be treated as approved
for mainnet custody, live prizes, or commercial licensing.

## Reporting a vulnerability

Do not publish an exploitable vulnerability, private key, seed phrase, API
token, or sensitive incident detail in a public GitHub issue.

Until a dedicated private security contact is published, use GitHub's private
vulnerability reporting feature for this repository. Include:

- Affected commit and component.
- Reproduction steps or proof of concept.
- Expected and observed behavior.
- Potential asset, rights, or user impact.
- Suggested mitigation, if known.

Do not interact with deployed contracts beyond the minimum safe reproduction.
Do not move assets, test against third-party wallets, or access data you do not
own.

## Supported scope

The latest commit on `main` is the supported source version. The public preview
may lag while its deployment workflow is running. No production onchain
deployment is currently declared as supported.

## Secret-handling rules

- User keys remain in user wallets.
- EVM deployer keys belong in an encrypted operator keystore or hardware-backed
  signing flow, never a frontend environment file.
- Solana keypair files and seed phrases never enter Git.
- Cloudflare credentials are scoped to the required account and stored as
  encrypted GitHub Actions secrets.
- RPC credentials are server-side or operator-side values, never `VITE_`
  variables.
- Secrets must not appear in command arguments, shell history, workflow logs,
  screenshots, issues, pull requests, or chat.
- Exposed credentials are revoked and replaced; deleting the visible copy is
  insufficient.

Repository ignore rules block common key and environment-file patterns, but an
ignore rule is not a security boundary. Review staged changes before every
commit.

## Production security gates

Before production:

- Independent EVM and Solana audits and remediation review.
- Documented threat model and invariant tests.
- Multisig ownership, deployment, revenue, and program-upgrade authorities.
- Verified bytecode, source, program IDs, and deployment registry.
- Monitored events and alerts for pause, ownership, package, revenue, and
  upgrade operations.
- Rights-review and takedown controls.
- Trustless prize mechanism and funded claims policy.
- Bridge review or explicit chain-specific `$LUCK` policy.
- Tested incident, pause, rollback, and recovery procedures.
- Jurisdiction-specific legal review.

## Security properties already present

- Reentrancy guards on value-moving EVM paths.
- Pausable EVM vault and licensing contracts.
- Two-step EVM ownership transfer.
- Exact-value native license payment.
- Rejection of unsolicited NFT safe transfers.
- Cooldown and active-license withdrawal locks.
- Non-transferable EVM license receipts.
- Solana PDA and account-owner validation.
- Rent-floor preservation for Solana revenue allocation.
- Browser-side Solana simulation before wallet signature.
- Cloudflare security headers and a minimal health endpoint.

These controls reduce specific risks but do not replace an audit.
