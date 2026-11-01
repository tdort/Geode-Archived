<script lang="ts">
    import Column from "$lib/components/Column.svelte";
    import Row from "$lib/components/Row.svelte";
    import Button from "$lib/components/Button.svelte";
    import Card from "$lib/components/Card.svelte";
    import Label from "$lib/components/Label.svelte";
    import Waves from "$lib/components/Waves.svelte";
    import Markdown from "svelte-exmarkdown";
    import { commitUrl, formatDate, formatSize, releaseUrl } from "$lib/archive";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();
    const v = $derived(data.version);
    const design = { stable: "accent", beta: "secondary", alpha: "primary" } as const;
</script>

<svelte:head>
    <title>{v.tag} - Geode Archive</title>
</svelte:head>

<Waves type="top-full" />
<div class="page">
    <Column align="start">
        <Row wrap="wrap" justify="start">
            <h1>{v.tag}</h1>
            <Label design={design[v.kind]}>{v.kind}</Label>
        </Row>

        <p class="meta">
            Released {formatDate(v.date)}
            {#if v.commit}
                &middot; commit
                <a href={commitUrl(v.commit)} target="_blank" rel="noreferrer"><code>{v.commit.slice(0, 8)}</code></a>
            {/if}
        </p>

        <Row wrap="wrap" justify="start">
            <Button href={releaseUrl(v.tag)} icon="github" design="primary-filled">GitHub release</Button>
            {#if data.older}<Button href="/v/{data.older.tag}" icon="left">{data.older.tag}</Button>{/if}
            {#if data.newer}<Button href="/v/{data.newer.tag}" icon="right" iconOnRight>{data.newer.tag}</Button>{/if}
        </Row>

        <Card semitransparent>
            <div class="block">
                <h2>Release notes</h2>
                {#if v.notes}
                    <div class="notes"><Markdown md={v.notes} /></div>
                {:else}
                    <p class="dim">No release notes archived for this version yet.</p>
                {/if}
            </div>
        </Card>

        <Card semitransparent>
            <div class="block">
                <h2>Release files</h2>
                {#if v.assets.length}
                    <table>
                        <tbody>
                            {#each v.assets as a (a.name)}
                                <tr>
                                    <td><a href={a.url} target="_blank" rel="noreferrer">{a.name}</a></td>
                                    <td class="dim">{formatSize(a.size)}</td>
                                    <td class="dim"><code>{a.digest?.replace("sha256:", "").slice(0, 12) ?? ""}</code></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {:else}
                    <p class="dim">File list not archived yet. See the GitHub release for the files.</p>
                {/if}
            </div>
        </Card>
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
        font-family: var(--font-monospace);
    }
    h2 {
        font-family: var(--font-heading);
        font-size: var(--font-size-heading);
        margin-bottom: 0.5rem;
    }
    .meta,
    .dim {
        color: var(--text-300);
    }
    .block {
        padding: 1rem 1.5rem;
        width: 100%;
    }
    table {
        width: 100%;
        border-collapse: collapse;
    }
    td {
        padding: 0.35rem 0.5rem;
        border-bottom: 1px solid var(--background-700);
    }
    a {
        color: var(--accent-300);
    }
    .notes :global(ul) {
        list-style: disc;
        padding-left: 1.5rem;
    }
    .notes :global(h1),
    .notes :global(h2),
    .notes :global(h3) {
        font-weight: 700;
        margin-block: 0.75rem 0.25rem;
    }
</style>
