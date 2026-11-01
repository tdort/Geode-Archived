# Geode Archive (PHP)

A tiny PHP site: no database, no build step. Upload this folder to any PHP 8 host and it works.

## Adding files

Just put files in folders. The site lists whatever it finds, with sizes and SHA-256 hashes.

- Releases: `files/releases/<tag>/`, for example `files/releases/v4.0.0/Geode-v4.0.0-win.zip`
- Nightlies: `files/nightly/<commit>/`, for example `files/nightly/163b831f04f8.../geode-nightly-win.zip`

Optional `meta.json` inside a nightly folder:

```json
{ "date": "2026-10-30T12:00:00Z", "origin": "original", "commit": "full-commit-hash", "note": "anything" }
```

`origin` is `original` or `rebuilt`. Without a `meta.json`, the folder's modified time is used as the date.

## Setup

1. Upload the contents of this folder so `index.php` is in your web root (or a subfolder).
2. Apache with `.htaccess` is enough. On nginx, send unknown paths to `index.php?r=<path>`,
   or set `'pretty_urls' => false` in `config.php` and everything works without rewrites.
3. Edit `config.php` for the title and repo.

## Keeping the version list current

`data/versions.json` ships with every release up to now. To refresh it (run on the server, or on a cron):

```bash
php tools/sync.php
```

Everything under `files/` is served as download-only: `.php` files are never executed or served.
