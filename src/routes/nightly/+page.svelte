<script lang="ts">
    import Column from "$lib/components/Column.svelte";
    import Card from "$lib/components/Card.svelte";
    import Waves from "$lib/components/Waves.svelte";
    import InfoBox from "$lib/components/InfoBox.svelte";
    import { nightlies, commitUrl, formatDate, formatSize } from "$lib/archive";
</script>

<svelte:head>
    <title>Nightlies - Geode Archive</title>
</svelte:head>

<Waves type="top-full" />
<div class="page">
    <Column align="start">
        <h1>Nightlies</h1>
        <InfoBox type="info">
            GitHub only keeps the latest nightly, because the <code>nightly</code> release is overwritten on every build.
            This list is built from snapshots taken by the sync job, so it starts when archiving started and has one entry
            per commit the job saw. Builds between two snapshots were never captured.
        </InfoBox>

        {#each nightlies as n (n.commit)}
            <Card semitransparent>
                <div class="block">
                    <h2>
                        <a href={commitUrl(n.commit)} target="_blank" rel="noreferrer"><code>{n.commit.slice(0, 8)}</code></a>
                    </h2>
                    <p class="dim">
                        Commit date {formatDate(n.date)} &middot; captured {formatDate(n.capturedAt)}
                    </p>
                    {#if n.assets.length}
                        <table>
                            <tbody>
                                {#each n.assets as a (a.name)}
                                    <tr>
                                        <td><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a></td>
                                        <td class="dim">{formatSize(a.size)}</td>
                                        <td class="dim"><code>{a.digest?.replace("sha256:", "").slice(0, 12) ?? ""}</code></td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    {:else}
                        <p class="dim">Recorded without a file list (git-only capture).</p>
                    {/if}
                </div>
            </Card>
        {/each}
    </Column>
</div>

<style lang="css">
    .page {
        padding: 2rem;
        width: 100%;
        max-width: 60rem;
    }
    h1 {
        font-family: var(--font-heading);
        font-size: var(--font-size-long-title);
    }
    h2 {
        font-family: var(--font-monospace);
        font-size: var(--font-size-heading);
    }
    .block {
        padding: 1rem 1.5rem;
        width: 100%;
    }
    .dim {
        color: var(--text-300);
    }
    td {
        padding: 0.35rem 0.5rem;
        border-bottom: 1px solid var(--background-700);
    }
    a {
        color: var(--accent-300);
    }
</style>
