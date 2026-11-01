#!/usr/bin/env node
// Backfills old nightly builds into files/nightly/<commit>/ and src/lib/data/nightlies.json.
//
// For every successful upstream "Build Binaries" run on main (sampled, see --every):
//   1. if the run's artifacts still exist, download them            -> origin "original"
//   2. if they expired, push that commit to YOUR fork, run the same
//      workflow there on GitHub's runners (so macOS/iOS get built),
//      and download the result                                       -> origin "rebuilt"
//
// Needs: node 20+, git, and the `gh` CLI logged in with a token that can push and run workflows in the fork.
// Rebuilds are NOT byte-identical to the originals; they are labelled "rebuilt" everywhere.
//
// Usage:
//   node scripts/backfill.mjs --fork you/geode --repo-dir ../geode-clone [--since 2025-01-01] [--every 1] [--limit 50] [--dry-run]
//
//   --fork       your fork of geode-sdk/geode (Actions must be enabled there)
//   --repo-dir   a local clone of the fork or upstream; used only to push old commits to the fork
//   --since      only runs on or after this date (default: no limit)
//   --every      keep one run per N days (default 1 = one per day; 0 = every run)
//   --limit      stop after N builds this invocation (default 25), so it can be re-run in batches
//   --concurrency  rebuilds in flight at once (default 2)

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: flags } = parseArgs({
    options: {
        config: { type: "string" },
        upstream: { type: "string" },
        fork: { type: "string" },
        "repo-dir": { type: "string" },
        workflow: { type: "string" },
        since: { type: "string" },
        every: { type: "string" },
        limit: { type: "string" },
        concurrency: { type: "string" },
        "dry-run": { type: "boolean", default: false },
    },
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// settings come from archive.config.json; command-line flags override it
const CONFIG_PATH = flags.config ?? join(ROOT, "archive.config.json");
const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
const pick = (flag, key, fallback) => flags[flag] ?? config[key] ?? fallback;
const args = {
    upstream: pick("upstream", "upstream", "geode-sdk/geode"),
    fork: pick("fork", "fork", undefined),
    "repo-dir": pick("repo-dir", "repoDir", undefined),
    workflow: pick("workflow", "workflow", "build.yml"),
    since: pick("since", "since", undefined),
    every: String(pick("every", "every", 1)),
    limit: String(pick("limit", "limit", 25)),
    concurrency: String(pick("concurrency", "concurrency", 2)),
    "dry-run": flags["dry-run"],
};
// commit hashes (full or a unique prefix) to always archive / never archive
const INCLUDE = (config.include ?? []).map((s) => s.toLowerCase());
const EXCLUDE = (config.exclude ?? []).map((s) => s.toLowerCase());
const matches = (sha, list) => list.some((p) => sha.toLowerCase().startsWith(p));
if (args.fork?.startsWith("YOUR-USERNAME")) {
    console.error("Set \"fork\" in archive.config.json to your fork of geode-sdk/geode first.");
    process.exit(2);
}
const FILES_DIR = join(ROOT, "files", "nightly");
const NIGHTLIES_PATH = join(ROOT, "src", "lib", "data", "nightlies.json");
const FAILED_PATH = join(ROOT, "src", "lib", "data", "backfill-failed.json");
const FILES_BASE_URL = process.env.FILES_BASE_URL ?? "/files/nightly";

const UPSTREAM = args.upstream;
const FORK = args.fork;
const DRY = args["dry-run"];
const EVERY = Number(args.every);
const LIMIT = Number(args.limit);
const CONCURRENCY = Math.max(1, Number(args.concurrency));
const POLL_MS = 30_000;
const BUILD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

if (!DRY && (!FORK || !args["repo-dir"])) {
    console.error("--fork and --repo-dir are required (or use --dry-run)");
    process.exit(2);
}

const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const ghJson = (...a) => JSON.parse(gh(...a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : []);
const save = (p, d) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
};

// ---- choose which runs to handle --------------------------------------------------------

function listRuns() {
    const runs = ghJson(
        "run", "list", "-R", UPSTREAM, "-w", args.workflow, "-b", "main", "--status", "success",
        "--json", "databaseId,headSha,createdAt,event", "--limit", "1000",
    );
    const all = runs
        .filter((r) => r.event === "push" || r.event === "workflow_dispatch")
        .filter((r) => !matches(r.headSha, EXCLUDE))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    // commits listed under "include" are always kept (newest run per commit), regardless of --since / --every
    const included = new Map();
    for (const r of all) {
        if (matches(r.headSha, INCLUDE) && !included.has(r.headSha)) included.set(r.headSha, r);
    }
    for (const p of INCLUDE) {
        if (![...included.keys()].some((sha) => sha.toLowerCase().startsWith(p))) {
            console.warn(`include: no successful run found for commit ${p}`);
        }
    }

    let out = all.filter((r) => !args.since || Date.parse(r.createdAt) >= Date.parse(args.since));
    if (EVERY > 0) {
        // newest run in each N-day bucket
        const seen = new Set();
        out = out.filter((r) => {
            const bucket = Math.floor(Date.parse(r.createdAt) / (EVERY * 86_400_000));
            if (seen.has(bucket)) return false;
            seen.add(bucket);
            return true;
        });
    }
    const have = new Set(out.map((r) => r.headSha));
    return [...out, ...[...included.values()].filter((r) => !have.has(r.headSha))].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
}

const liveArtifacts = (runId) =>
    ghJson("api", `repos/${UPSTREAM}/actions/runs/${runId}/artifacts`, "--jq", "{a: [.artifacts[] | {name, expired}]}").a;

// ---- download / rebuild -----------------------------------------------------------------

function sha256(path) {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walk(dir) {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

function downloadRun(repo, runId, dest) {
    mkdirSync(dest, { recursive: true });
    gh("run", "download", String(runId), "-R", repo, "-D", dest);
}

async function rebuild(sha) {
    const branch = `rebuild/${sha.slice(0, 12)}`;
    const git = (...a) => execFileSync("git", ["-C", args["repo-dir"], ...a], { encoding: "utf8" });

    git("fetch", "--quiet", `https://github.com/${UPSTREAM}`, sha);
    git("push", "--force", `https://github.com/${FORK}`, `${sha}:refs/heads/${branch}`);
    try {
        gh("workflow", "run", args.workflow, "-R", FORK, "--ref", branch);
        const started = Date.now();
        await sleep(10_000);
        for (;;) {
            if (Date.now() - started > BUILD_TIMEOUT_MS) throw new Error("timed out");
            const [run] = ghJson("run", "list", "-R", FORK, "-w", args.workflow, "-b", branch, "--json", "databaseId,status,conclusion", "--limit", "1");
            if (run?.status === "completed") {
                // the last job publishes a nightly release in the fork; we only need the artifacts, so any
                // conclusion is acceptable as long as artifacts exist
                return run.databaseId;
            }
            await sleep(POLL_MS);
        }
    } finally {
        try {
            git("push", "--quiet", `https://github.com/${FORK}`, "--delete", branch);
        } catch {}
    }
}

async function handle(run) {
    const sha = run.headSha;
    const dest = join(FILES_DIR, sha);
    let origin;
    let sourceRun = run.databaseId;

    const artifacts = liveArtifacts(run.databaseId);
    if (artifacts.length > 0 && artifacts.every((a) => !a.expired)) {
        downloadRun(UPSTREAM, run.databaseId, dest);
        origin = "original";
    } else {
        sourceRun = await rebuild(sha);
        const forkArtifacts = ghJson("api", `repos/${FORK}/actions/runs/${sourceRun}/artifacts`, "--jq", "{a: [.artifacts[] | {name, expired}]}").a;
        if (forkArtifacts.length === 0) throw new Error("rebuild produced no artifacts");
        downloadRun(FORK, sourceRun, dest);
        origin = "rebuilt";
    }

    const assets = walk(dest).map((p) => {
        const name = relative(dest, p).split("\\").join("/");
        return {
            name,
            size: statSync(p).size,
            url: `${FILES_BASE_URL}/${sha}/${name.split("/").map(encodeURIComponent).join("/")}`,
            digest: `sha256:${sha256(p)}`,
        };
    });
    return { commit: sha, date: run.createdAt, capturedAt: new Date().toISOString(), capturedFrom: origin, sourceRun, assets };
}

// ---- main -------------------------------------------------------------------------------

const nightlies = load(NIGHTLIES_PATH);
const failed = load(FAILED_PATH);
const done = new Set(nightlies.filter((n) => n.assets.length > 0).map((n) => n.commit));
const failedShas = new Set(failed.map((f) => f.commit));

const todo = listRuns()
    .filter((r) => !done.has(r.headSha) && !failedShas.has(r.headSha))
    .slice(0, LIMIT);

console.log(`${todo.length} build(s) to process${DRY ? " (dry run)" : ""}`);
if (DRY) {
    for (const r of todo) console.log(`${r.createdAt}  ${r.headSha.slice(0, 8)}  run ${r.databaseId}`);
    process.exit(0);
}

const queue = [...todo];
async function worker() {
    for (let run; (run = queue.shift()); ) {
        const label = `${run.headSha.slice(0, 8)} (${run.createdAt})`;
        try {
            const entry = await handle(run);
            const i = nightlies.findIndex((n) => n.commit === entry.commit);
            if (i >= 0) nightlies[i] = entry;
            else nightlies.push(entry);
            console.log(`ok     ${label} ${entry.capturedFrom}, ${entry.assets.length} files`);
        } catch (e) {
            rmSync(join(FILES_DIR, run.headSha), { recursive: true, force: true });
            failed.push({ commit: run.headSha, date: run.createdAt, error: String(e.message ?? e).slice(0, 300) });
            console.warn(`failed ${label}: ${e.message}`);
        }
        // save after every build so an interrupted run loses nothing
        nightlies.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
        save(NIGHTLIES_PATH, nightlies);
        save(FAILED_PATH, failed);
    }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${nightlies.length} nightly entries, ${failed.length} failed overall`);
