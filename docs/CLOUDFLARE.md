# Cloudflare deployment

The production preview is a Cloudflare Worker with static assets:

- Worker name: `lucky`
- Production URL: `https://lucky.luckycommons.workers.dev`
- Health URL: `https://lucky.luckycommons.workers.dev/api/health`
- Configuration source: `wrangler.jsonc`
- Deployment workflow: `.github/workflows/deploy-cloudflare.yml`

## Deployment lifecycle

```text
push to main
  -> npm ci
  -> Solidity compile
  -> contract and web tests
  -> Solana host tests
  -> lint
  -> Vite production build
  -> wrangler deploy
  -> production health check
```

Only `main` and a manual `workflow_dispatch` can run the production job. GitHub
concurrency prevents two production deployments from running at the same time.

## One-time GitHub connection

### 1. Create a Cloudflare token

In Cloudflare, create a custom API token using the **Edit Cloudflare Workers**
template. Restrict it to the single account containing the `lucky` Worker.
Do not use a Global API Key.

The workflow needs:

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account identifier.
- `CLOUDFLARE_API_TOKEN`: scoped deployment token.

### 2. Store encrypted GitHub secrets

Open repository **Settings → Secrets and variables → Actions → Secrets** and
create both values, or use authenticated GitHub CLI prompts:

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID --repo riceflippa/luckycommons
gh secret set CLOUDFLARE_API_TOKEN --repo riceflippa/luckycommons
```

Do not pass a secret as a command-line argument, write it to a shell-history
file, or store it in `.env.local`. The interactive commands read values without
adding them to Git history.

### 3. Configure public build variables

Repository variables are optional until contracts or a Solana program are
deployed. Create only values that have been independently verified:

| Variable | Preview default |
| --- | --- |
| `VITE_EVM_CHAIN` | `polygonAmoy` |
| `VITE_EVM_VAULT_ADDRESS` | Empty until deployment |
| `VITE_EVM_LICENSING_ADDRESS` | Empty fallback |
| `VITE_EVM_LICENSING_POLYGON_AMOY` | Empty until deployment |
| `VITE_EVM_LICENSING_POLYGON` | Empty until deployment |
| `VITE_EVM_LICENSING_ETHEREUM` | Empty until deployment |
| `VITE_EVM_LICENSING_BASE` | Empty until deployment |
| `VITE_EVM_LICENSING_ARBITRUM` | Empty until deployment |
| `VITE_SOLANA_CLUSTER` | `devnet` |
| `VITE_SOLANA_PROGRAM_ID` | Empty until deployment |

Every `VITE_` variable is public in the generated JavaScript bundle. Never put
an RPC credential, API token, deployer key, seed phrase, or keypair in one.

### 4. Protect production

Create a GitHub environment named `production`. Recommended settings:

- Allow deployments only from `main`.
- Require a reviewer before deployment once the preview becomes operational.
- Keep Cloudflare secrets at repository or production-environment scope.
- Protect `main` and require the Cloudflare workflow's verification job.

Requiring a reviewer pauses automatic deployment by design. For the current
preview, branch protection plus reviewed pull requests may be sufficient.

## Automatic deployment

After the secrets exist, merge a reviewed pull request into `main`. Follow the
workflow from the repository's **Actions → Cloudflare Production** page.

A successful run must show:

1. All validation steps green.
2. A Wrangler deployment result for Worker `lucky`.
3. A successful production health response.
4. The live page loading at the production URL.

The health response is expected to be:

```json
{"ok":true,"payments":"onchain-only"}
```

## Manual dispatch

Use **Actions → Cloudflare Production → Run workflow** to redeploy the current
`main` commit. Manual dispatch does not bypass compilation, tests, linting,
build, or the health check.

## Manual emergency deployment

If GitHub Actions is unavailable and a release is urgent:

```bash
npm ci
npm run compile
npm test
npm run lint
npm run deploy:web
```

Authenticate Wrangler interactively on the operator workstation. Record the
reason, Git commit, Cloudflare version, and operator. Reconcile the deployment
with GitHub as soon as service is restored.

## Rollback

Rollback is an external production state change and requires incident-lead
approval.

Preferred dashboard procedure:

1. Open Cloudflare **Workers & Pages → lucky → Deployments**.
2. Identify the last known-good version and its source commit.
3. Select that version's menu and choose **Rollback**.
4. Verify `/api/health` and the critical user paths.
5. Revert or fix the bad Git commit so the next `main` deployment does not
   reintroduce the incident.

Wrangler fallback:

```bash
npx wrangler deployments list
npx wrangler rollback <VERSION_ID> --message "Rollback approved for INCIDENT_ID"
```

Do not guess a version ID. A Worker rollback does not roll back external data or
blockchain state.

## Token rotation

Rotate `CLOUDFLARE_API_TOKEN` immediately if it is exposed or an operator loses
access:

1. Create a replacement account-scoped token.
2. Replace the GitHub secret.
3. Run the workflow manually and verify production.
4. Revoke the old token in Cloudflare.
5. Record the rotation without recording either token value.

The account ID is not an authentication secret, but storing it alongside the
token as an Actions secret keeps the workflow interface consistent.

## Troubleshooting

### Authentication failure

- Confirm both GitHub secrets exist and are available to `production`.
- Confirm the token is active and scoped to the correct Cloudflare account.
- Confirm the token has Workers edit permission.

### Worker not found or wrong URL

- Confirm `name` in `wrangler.jsonc` is exactly `lucky`.
- Confirm the account ID owns that Worker and workers.dev subdomain.
- Do not rename the Worker in the dashboard without a reviewed config change.

### Build failure

- Reproduce with `npm ci`, then the exact failing npm script.
- Do not bypass a failed compile, test, lint, or build step.
- Confirm Node.js 22 and the committed lockfile are in use.

### Health-check failure after deploy

- Open the Wrangler step and capture the deployment version.
- Check Cloudflare Worker logs and status.
- Test the root page and `/api/health` independently.
- Roll back if the deployed version is unhealthy.
