# Geode Archive

A static archive of every Geode loader release (stable, beta, alpha) and snapshots of the rolling nightly build.
It started as a fork of the Geode website; the mod browser, login, install page and ads are gone.

## How it works

- `scripts/sync.mjs` builds `src/lib/data/versions.json` and `src/lib/data/nightlies.json` from `geode-sdk/geode`.
  - With `GITHUB_TOKEN` set it also pulls release notes, file lists, sizes and SHA-256 digests.
  - Without a token (or if the API rejects it) it falls back to git tags only: version, commit, date.
  - Entries are never removed, so releases deleted upstream stay archived.
- `.github/workflows/sync.yml` runs the script hourly and commits any change.
- The site is fully prerendered (`adapter-static`): `/` (all versions), `/v/<tag>` (one version), `/nightly`.

## Nightlies

Upstream publishes nightlies by overwriting a single `nightly` release, so GitHub has no history of older ones.
This archive can only hold nightlies from the moment the sync job first saw them: one entry per distinct commit.
For a gap-free record, keep the hourly job running and let it commit its snapshots.

## Files are linked, not hosted

File entries link to the original GitHub release assets. If you want the archive to survive upstream deletions,
the sync script would need to copy the assets to your own storage; that is not done yet.

## Developing

```bash
npm install
npm run sync   # refresh the data files (GITHUB_TOKEN optional)
npm run dev
npm run build  # static output in ./build
```
