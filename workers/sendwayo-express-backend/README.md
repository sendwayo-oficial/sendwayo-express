# SENDWAYO EXPRESS secure RD → HT settlement

This Worker adds secure server-side approval for RD → HT NatCash / MonCash transfers. The repository change does not alter live balances until the Worker is deployed and V7 calls the endpoint.

## Behavior

- Verifies Firebase Authentication ID tokens with Firebase Identity Toolkit.
- Resolves Admin/Agent roles from sendwayo_express_v2/users and agentAuth; the browser cannot choose its own role.
- Approves only a pending RD → HT NatCash / MonCash operation. An Agent cannot approve an operation they created or one created by Admin.
- Calculates 8% DOP commission, net DOP, and fixed exchange rate 2.10.
- Debits Administration HTG by 97% of gross HTG; credits the remaining 3% to Administration HTG commission.
- Creates a read-only internal HT → HT entry for Admin and active Agents.
- Uses Firebase ETag + conditional PUT at the sendwayo_express_v2 root. This keeps the status, balances, internal entry and audit update together; on contention it retries.
- Admin can reverse a settlement once. Reversal is refused when its commissions have already been spent and cannot be restored safely.

## Required Cloudflare secrets

Create these Worker secrets; do not commit either value or put them in the HTML:

- FIREBASE_SERVICE_ACCOUNT_JSON: complete service-account JSON for the sendwayo-express Firebase project.
- FIREBASE_WEB_API_KEY: Firebase Web API key for the sendwayo-express project.

The service account needs permission to read and write the project's Realtime Database.

## Deploy

After signing in to the intended Cloudflare account, from this directory run:

1. npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
2. npx wrangler secret put FIREBASE_WEB_API_KEY
3. npx wrangler deploy

The Worker name is sendwayo-express-backend. Confirm in Cloudflare that this is the existing service whose workers.dev address is sendwayo-express-backend.ideletteismorin.workers.dev. Do not overwrite still-sky-1d34 or round-breeze-f715.

## Database rules

The browser needs read-only access to internalSettlements for Admin and active Agents. The companion rules change adds that read permission and an index on settlementRoleScope. Client writes remain denied. The Worker writes with its service-account secret.

## Tests

Run: node --test workers/sendwayo-express-backend/test/settlement.test.mjs

This code is not live until the Cloudflare secrets are configured and the Worker is deployed.
