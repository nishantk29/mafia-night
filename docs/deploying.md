# Deploying

## Usual path: GitHub Actions

`.github/workflows/deploy.yml` runs only when started by hand (the Actions tab, or `gh workflow run deploy.yml`). It never runs on push, so every deploy is deliberate. Steps: `npm ci`, `npm test`, `npm run deploy` (`wrangler deploy`), then `scripts/live-smoke.mjs` against the live Worker.

Repo secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never commit them.

## From a laptop

```bash
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
npm test && npm run deploy
BASE=https://mafia.hatethespurs.com node scripts/live-smoke.mjs
```

## Domains

- `https://mafia.hatethespurs.com` serves the app directly.
- The `workers.dev` address stays on (`workers_dev: true`) and preview URLs stay off. `test/deploy-workersdev.test.js` pins both values.

## Gotchas

- **Durable Objects on the free plan must be SQLite-backed.** The migration in `wrangler.jsonc` uses `new_sqlite_classes`. Don't switch it to `new_classes`, and don't rename the `Room` class without a new migration.
- **Service worker version.** `VERSION` in `public/sw.js` is a content hash of `public/`. `npm test` fails if it is stale, which would leave installed phones on old files. To see the expected value:
  `node -e "import('./scripts/sw-version.mjs').then((m) => console.log(m.computeVersion()))"`
- **Compatibility date.** `compatibility_date` is reviewed against flag changes. See `test/compat-date.test.js` before you bump it.
- **Workers AI.** The `AI` binding backs a rules helper that is server-only (`AI_MODE: "dark"`) until a UI ships.

## Alternative: a Cloudflare API deploy file

For deploying through the Cloudflare API without Wrangler. The Worker name, bindings and compatibility date are read from `wrangler.jsonc`. No migrations are sent, so this path only updates an existing Worker.

```bash
node scripts/build-embedded.mjs          # bundles the Worker with every file in public/ inlined (needs esbuild)
node scripts/build-deploy.mjs <outFile>  # runs the tests first; refuses a stale sw.js VERSION; no secrets embedded
```
