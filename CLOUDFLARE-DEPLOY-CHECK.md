# Cloudflare deployment verification

This file was added to trigger a new GitHub push on `migration-cloudflare-pages`.

The Cloudflare build must check out the `migration-cloudflare-pages` branch, not `main`. The file `scripts/build-cloudflare.sh` exists only on the migration branch.

Build: `bash scripts/build-cloudflare.sh`
Deploy: `npx wrangler deploy --assets ./dist --name allo-psycho-test`

Do not change Vercel or app.allopsycho.fr during this test.
