#!/usr/bin/env node
// Builds the archive data files from geode-sdk/geode.
//
//   src/lib/data/versions.json   every tagged release (stable, beta, alpha)
//   src/lib/data/nightlies.json  append-only snapshots of the rolling `nightly` release
//
// Two modes:
//   - GITHUB_TOKEN set: uses the GitHub API (release notes, assets, sizes, digests)
//   - no token: falls back to `git` only (tags, commits, dates; no notes or assets)
//
// Existing entries are never dropped, so releases that are later deleted upstream stay archived.
// Nightlies are overwritten upstream, so this script has to run regularly to catch them.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.GEODE_REPO ?? "geode-sdk/geode";
const TOKEN = process.env.GITHUB_TOKEN;
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "data");
const VERSIONS_PATH = join(DATA_DIR, "versions.json");
const NIGHTLIES_PATH = join(DATA_DIR, "nightlies.json");

function load(path) {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
}

function save(path, data) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function kindOf(tag) {
    if (/^nightly/.test(tag)) return "nightly";
    if (/-alpha/.test(tag)) return "alpha";
    if (/-beta/.test(tag)) return "beta";
    return "stable";
}

function semverParts(tag) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

const RANK = { alpha: 0, beta: 1, stable: 2 };

function compareVersions(a, b) {
    const pa = semverParts(a.tag);
    const pb = semverParts(b.tag);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
    // same x.y.z: stable first, then beta, then alpha; then by date
    if (RANK[a.kind] !== RANK[b.kind]) return RANK[b.kind] - RANK[a.kind];
    return Date.parse(b.date) - Date.parse(a.date);
}

// ---- git mode ----------------------------------------------------------------------------

function gitTags() {
    const dir = mkdtempSync(join(tmpdir(), "geode-tags-"));
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } });
    git("init", "-q", "--bare");
    git("remote", "add", "origin", `https://github.com/${REPO}`);
    git("fetch", "-q", "--filter=blob:none", "--tags", "origin");
    const out = git(
        "for-each-ref",
        "--format=%(refname:short)|%(objectname)|%(*objectname)|%(creatordate:iso-strict)",
        "refs/tags",
    );
    return out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [tag, obj, deref, date] = line.split("|");
            return { tag, commit: deref || obj, date };
        });
}

// ---- API mode ----------------------------------------------------------------------------

async function api(path) {
    const res = await fetch(`https://api.github.com${path}`, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
}

async function apiReleases() {
    const all = [];
    for (let page = 1; ; page++) {
        const batch = await api(`/repos/${REPO}/releases?per_page=100&page=${page}`);
        all.push(...batch);
        if (batch.length < 100) break;
    }
    return all.filter((r) => !r.draft);
}

const mapAssets = (assets) =>
    (assets ?? []).map((a) => ({
        name: a.name,
        size: a.size,
        url: a.browser_download_url,
        ...(a.digest ? { digest: a.digest } : {}),
    }));

// ---- main --------------------------------------------------------------------------------

const versions = new Map(load(VERSIONS_PATH).map((v) => [v.tag, v]));
const nightlies = load(NIGHTLIES_PATH);
const tags = new Map(gitTags().map((t) => [t.tag, t]));

let apiOk = Boolean(TOKEN);
let releases = [];
if (TOKEN) {
    try {
        releases = await apiReleases();
    } catch (e) {
        apiOk = false;
        console.warn(`GitHub API unavailable (${e.message}); continuing in git-only mode`);
    }
}

if (apiOk) {
    for (const r of releases) {
        if (kindOf(r.tag_name) === "nightly") continue;
        const t = tags.get(r.tag_name);
        versions.set(r.tag_name, {
            ...(versions.get(r.tag_name) ?? {}),
            tag: r.tag_name,
            kind: kindOf(r.tag_name),
            name: r.name || r.tag_name,
            commit: t?.commit ?? versions.get(r.tag_name)?.commit ?? null,
            date: r.published_at ?? r.created_at ?? t?.date,
            notes: r.body ?? "",
            assets: mapAssets(r.assets),
        });
    }
}

// tags with no release (or git-only mode)
for (const [tag, t] of tags) {
    if (kindOf(tag) === "nightly") continue;
    const prev = versions.get(tag);
    versions.set(tag, {
        ...prev,
        tag,
        kind: kindOf(tag),
        name: prev?.name ?? tag,
        commit: prev?.commit ?? t.commit,
        date: prev?.date ?? t.date,
        notes: prev?.notes ?? "",
        assets: prev?.assets ?? [],
    });
}

// nightly snapshot: one entry per distinct commit
const nightlyTag = tags.get("nightly");
if (nightlyTag) {
    let assets = [];
    let capturedFrom = "git";
    if (apiOk) {
        try {
            const rel = await api(`/repos/${REPO}/releases/tags/nightly`);
            assets = mapAssets(rel.assets);
            capturedFrom = "api";
        } catch (e) {
            console.warn(`nightly release lookup failed: ${e.message}`);
        }
    }
    const existing = nightlies.find((n) => n.commit === nightlyTag.commit);
    if (!existing) {
        nightlies.push({
            commit: nightlyTag.commit,
            date: nightlyTag.date,
            capturedAt: new Date().toISOString(),
            capturedFrom,
            assets,
        });
        console.log(`new nightly ${nightlyTag.commit.slice(0, 8)}`);
    } else if (assets.length && !existing.assets.length) {
        existing.assets = assets;
        existing.capturedFrom = capturedFrom;
    }
}

const sortedVersions = [...versions.values()].sort(compareVersions);
const sortedNightlies = nightlies.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
save(VERSIONS_PATH, sortedVersions);
save(NIGHTLIES_PATH, sortedNightlies);
console.log(`${sortedVersions.length} versions, ${sortedNightlies.length} nightly snapshots (${apiOk ? "api" : "git-only"} mode)`);
