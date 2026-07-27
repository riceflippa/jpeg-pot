# Lucky Commons operations runbook

This runbook covers the public preview and testnet components. It does not
authorize mainnet contract deployment or live prize operation.

## Service inventory

| Surface | Identifier | Primary check |
| --- | --- | --- |
| Public application | `luckycommons.luckycommons.workers.dev` | Load home page and `/api/health` |
| GitHub repository | `riceflippa/luckycommons` | `main` status and Actions history |
| GitHub Pages | `riceflippa.github.io/luckycommons` | Load project overview and documentation links |
| Cloudflare Worker | `luckycommons` | Active deployment and Worker logs |
| EVM preview | Addresses in GitHub Actions variables | Explorer code, owner, paused state, and events |
| Solana preview | Program ID in GitHub Actions variable | Cluster, executable account, authority, and logs |

Blank chain variables mean that surface is intentionally not deployed.

## Release procedure

### Before merge

1. Review all changed files and dependency changes.
2. Confirm no `.env`, keypair, credential, artifact, or generated secret is
   staged.
3. Run:

   ```bash
   npm ci
   npm run compile
   npm test
   npm run lint
   npm run build
   NO_DNA=1 cargo test --workspace
   ```

4. Review preview language for accidental production claims.
5. Review every changed contract address against the deployment register and
   chain explorer.
6. Merge through the protected `main` branch.

### After merge

1. Watch **Actions → Cloudflare Production**.
2. Record the Git commit and Cloudflare version.
3. Confirm the health endpoint returns HTTP 200 and expected JSON.
4. Load the site on a narrow mobile viewport and desktop viewport.
5. Confirm holder and buyer routes render.
6. Confirm wallet controls show the expected testnet or remain disabled when
   addresses are intentionally blank.
7. Confirm GitHub Pages documentation still loads.

## Routine health review

For an active preview, review at least weekly:

- Cloudflare deployment and error history.
- GitHub dependency and security alerts.
- Failed Actions runs.
- Unexpected repository secret or variable changes.
- EVM ownership, pause state, and revenue events.
- Solana program authority and revenue events.
- Rights disputes or takedown requests.
- Public copy that may overstate the implementation.

## Severity model

| Severity | Example | Initial action |
| --- | --- | --- |
| SEV-1 | Secret exposure, unauthorized deployment, asset loss, malicious contract address | Stop release activity, revoke access, pause affected onchain components |
| SEV-2 | Broken production preview, incorrect payment target, rights-disputed package | Disable or roll back affected surface; preserve evidence |
| SEV-3 | Noncritical UI defect or documentation error | File issue, prioritize fix, monitor impact |

## Web deployment incident

1. Declare an incident ID and lead.
2. Capture the failing commit, workflow run, Cloudflare version, symptoms, and
   first observed time.
3. Determine whether the failure is build-time or post-deployment.
4. For post-deployment failure, roll back to the verified last-known-good
   Cloudflare version using [CLOUDFLARE.md](CLOUDFLARE.md#rollback).
5. Verify the root page and health endpoint.
6. Revert or fix the Git commit through normal review.
7. Preserve logs and write a short root-cause record.

## Compromised Cloudflare token

1. Stop pending deployment workflows.
2. Create a replacement scoped token.
3. Replace `CLOUDFLARE_API_TOKEN` in GitHub Actions secrets.
4. Verify a manual workflow run.
5. Revoke the compromised token.
6. Review Cloudflare deployments and GitHub audit events for unauthorized use.
7. Rotate adjacent credentials if exposure scope is uncertain.

Never paste either token into the incident record.

## Incorrect frontend contract address

1. Treat the site as unsafe for transactions.
2. Remove or correct the affected GitHub Actions variable.
3. Redeploy `main` through the workflow.
4. Verify the generated site targets the reviewed address and chain.
5. Check whether any user signed a transaction to the incorrect target.
6. Preserve the prior bundle and workflow logs for analysis.

## EVM contract incident

1. Verify the chain ID and contract address independently.
2. Decode the suspicious transaction and determine affected state.
3. If pause authority exists and pausing reduces harm, prepare the exact pause
   transaction for multisig review.
4. Do not move revenue or NFTs without the documented incident authority.
5. Remove affected public contract variables and redeploy the frontend if user
   interaction must stop.
6. Notify auditors, counsel, and affected operators according to the incident
   plan.
7. Publish only verified facts; never disclose signer identities or recovery
   details unnecessarily.

## Solana program incident

1. Confirm cluster, program ID, program-data account, upgrade authority, and
   suspicious transaction signatures.
2. Decode instructions and validate all account owners and signers.
3. Stop frontend interaction by clearing the public program ID if necessary.
4. Use authority actions only after transaction simulation and multisig review.
5. Preserve RPC logs and transaction data.
6. Never replace the program or upgrade authority during uncertainty without an
   approved recovery plan.

## Rights dispute or takedown

1. Disable the affected package to prevent new purchases.
2. Preserve its manifest, terms, rights evidence, review record, and existing
   receipt identifiers.
3. Identify existing active licenses and their expiry dates.
4. Escalate to the designated rights reviewer and legal contact.
5. Do not destroy evidence or rewrite historical package content.
6. Record the outcome and any remediation before reactivation.

Disabling a package does not automatically invalidate previously issued
licenses; follow the applicable license terms and legal process.

## Recovery verification

An incident is not resolved until:

- The live and health URLs are stable.
- GitHub and Cloudflare state match a reviewed commit.
- Public chain variables match the deployment register.
- Exposed credentials are revoked, not merely replaced.
- Onchain owner and authority states are verified.
- Affected user and rights obligations are understood.
- Follow-up work has owners and deadlines.

## Evidence checklist

Retain without secrets:

- Incident timeline in UTC.
- Git commits and pull requests.
- GitHub workflow run IDs.
- Cloudflare deployment version IDs.
- EVM transaction hashes and decoded calldata.
- Solana signatures and decoded instructions.
- Relevant public addresses, program IDs, and chain identifiers.
- Screenshots or response bodies showing user impact.
- Decisions, approvers, and recovery verification.
