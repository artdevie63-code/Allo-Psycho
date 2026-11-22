# Cloudflare deployment verification

Production target: **app.allopsycho.fr**

Source branch: `migration-cloudflare-pages`
Build command: `bash scripts/build-cloudflare.sh`
Build output: `dist`

Required release markers:
- V9.5.8 single-window navigation
- 66 public resources library
- Mes rappels kept in Options
- Long sophrology session
- PWA cache `allo-psycho-shell-v9.5.8-navfix-20261122`

This commit is intended to trigger a fresh Cloudflare build from the production branch.


Deployment trigger after production project rename:
- Wrangler project: allopsycho
- Source commit includes V9.5.8 navigation and PWA cache bump
