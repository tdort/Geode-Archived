import versionsJson from "./data/versions.json";
import nightliesJson from "./data/nightlies.json";

export type Kind = "stable" | "beta" | "alpha";

export interface Asset {
    name: string;
    size: number;
    url: string;
    digest?: string;
}

export interface Version {
    tag: string;
    kind: Kind;
    name: string;
    commit: string | null;
    date: string;
    notes: string;
    assets: Asset[];
}

export interface Nightly {
    commit: string;
    date: string;
    capturedAt: string;
    capturedFrom: "git" | "api" | "original" | "rebuilt";
    sourceRun?: number;
    assets: Asset[];
}

export const REPO_URL = "https://github.com/geode-sdk/geode";

export const versions = versionsJson as Version[];
export const nightlies = nightliesJson as Nightly[];

export function majorOf(tag: string): number {
    return Number(/^v?(\d+)/.exec(tag)?.[1] ?? 0);
}

export function getVersion(tag: string): Version | undefined {
    return versions.find((v) => v.tag === tag);
}

export function releaseUrl(tag: string): string {
    return `${REPO_URL}/releases/tag/${tag}`;
}

export function commitUrl(commit: string): string {
    return `${REPO_URL}/commit/${commit}`;
}

export function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
}

export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
