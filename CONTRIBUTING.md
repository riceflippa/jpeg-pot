# Contributing to JPEG Pot

JPEG Pot welcomes focused, reviewable contributions. The repository is a
testnet preview, so correctness and honest product language take priority over
shipping production claims.

## Development flow

1. Branch from current `main`.
2. Keep one concern per branch.
3. Add or update tests for behavioral changes.
4. Update operator and protocol documentation when behavior changes.
5. Run the complete validation suite.
6. Open a pull request describing impact, risks, and verification.

```bash
npm ci
npm run compile
npm test
npm run lint
npm run build
NO_DNA=1 cargo test --workspace
```

For a clean Solana SBF change, also run the appropriate Anchor build and local
integration tests with `NO_DNA=1`.

## Pull-request expectations

A pull request should explain:

- What changed and why.
- User and operator impact.
- Contract, program, rights, or deployment risks.
- Tests and manual verification performed.
- Any migration, new address, variable, secret name, or authority change.
- Whether public product claims need updating.

Never commit generated build directories, local environment files, keypairs,
private keys, seed phrases, RPC credentials, API tokens, or deployment secrets.

## Contract and program changes

For Solidity or Solana changes:

- State the invariant being protected.
- Add positive, negative, authorization, and boundary tests.
- Identify storage or account-layout changes.
- Document upgrade or redeployment requirements.
- Review external calls, signer constraints, account ownership, arithmetic,
  replay behavior, and pause paths.
- Do not deploy to mainnet as part of a code contribution.

## Rights and product changes

- Do not infer licensing authority from NFT ownership alone.
- Keep pool eligibility separate from media licensing eligibility.
- Label mock inventory, testnets, disabled checkout, and unimplemented prize
  behavior explicitly.
- Do not add real media to the catalog without a retained rights-review record.

## Deployment changes

`wrangler.jsonc` is the Cloudflare configuration source of truth. Changes to the
production workflow require review of permissions, secret usage, target Worker,
and rollback implications.

Pull requests must not print, transform, upload, or expose deployment secrets.
