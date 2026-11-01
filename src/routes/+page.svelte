<script lang="ts">
    import Column from "$lib/components/Column.svelte";
    import Row from "$lib/components/Row.svelte";
    import Waves from "$lib/components/Waves.svelte";
    import GeodeLogo from "$lib/components/GeodeLogo.svelte";
    import Card from "$lib/components/Card.svelte";
    import Label from "$lib/components/Label.svelte";
    import { versions, nightlies, majorOf, formatDate, type Kind } from "$lib/archive";

    type Filter = "all" | Kind;

    let filter: Filter = $state("all");
    let query = $state("");

    const counts = {
        all: versions.length,
        stable: versions.filter((v) => v.kind === "stable").length,
        beta: versions.filter((v) => v.kind === "beta").length,
        alpha: versions.filter((v) => v.kind === "alpha").length,
    };

    const filtered = $derived(
        versions.filter(
            (v) => (filter === "all" || v.kind === filter) && v.tag.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    );

    const groups = $derived.by(() => {
        const byMajor = new Map<number, typeof versions>();
        for (const v of filtered) {
            const m = majorOf(v.tag);
            byMajor.set(m, [...(byMajor.get(m) ?? []), v]);
        }
        return [...byMajor.entries()].sort((a, b) => b[0] - a[0]);
    });

    const design = { stable: "accent", beta: "secondary", alpha: "primary" } as const;
    const filters: Filter[] = ["all", "stable", "beta", "alpha"];
</script>

<svelte:head>
    <title>Geode Archive</title>
    <meta name="description" content="Every Geode loader release, including betas, alphas and nightlies." />
</svelte:head>

<Waves type="top-full" />
<div class="page">
    <Column>
        <Row wrap="wrap">
            <GeodeLogo type="plain-mono" />
            <h1>Geode Archive</h1>
        </Row>
        <p class="lead">
            Every tagged Geode loader release: {counts.stable} stable, {counts.beta} beta and {counts.alpha} alpha
            builds, plus {nightlies.length} nightly snapshot{nightlies.length === 1 ? "" : "s"}.
        </p>

        <Card semitransparent>
            <div class="controls">
                <input type="search" placeholder="Search versions, e.g. 4.6 or beta" bind:value={query} />
                <div class="chips">
                    {#each filters as f}
                        <button class:active={filter === f} onclick={() => (filter = f)} type="button">
                            {f} <span>{counts[f]}</span>
                        </button>
                    {/each}
                </div>
            </div>
        </Card>

        {#each groups as [major, list] (major)}
            <section>
                <h2>v{major}.x</h2>
                <div class="list">
                    {#each list as v (v.tag)}
                        <a class="row" href="/v/{v.tag}">
                            <span class="tag">{v.tag}</span>
                            <Label design={design[v.kind]}>{v.kind}</Label>
                            <span class="date">{formatDate(v.date)}</span>
                        </a>
                    {/each}
                </div>
            </section>
        {:else}
            <p>No versions match.</p>
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
        font-family: var(--font-heading);
        font-size: var(--font-size-heading);
        margin-block: 1.5rem 0.5rem;
    }
    .lead {
        text-align: center;
    }
    section {
        width: 100%;
    }
    .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
        justify-content: space-between;
        padding: 1rem;
    }
    input {
        flex: 1 1 14rem;
        padding: 0.5rem 0.75rem;
        border-radius: 0.5rem;
        border: 1px solid var(--background-400);
        background: var(--background-900);
        color: var(--text-50);
    }
    .chips {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .chips button {
        padding: 0.35rem 0.8rem;
        border-radius: 999px;
        border: 1px solid var(--background-400);
        background: transparent;
        color: var(--text-100);
        text-transform: capitalize;
        cursor: pointer;
    }
    .chips button span {
        opacity: 0.6;
        margin-left: 0.25rem;
    }
    .chips button.active {
        background: var(--primary-400);
        border-color: var(--primary-400);
        color: var(--text-950);
    }
    .list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .row {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 1rem;
        padding: 0.6rem 1rem;
        border-radius: 0.5rem;
        background: color-mix(in srgb, var(--background-900) 70%, transparent);
        color: var(--text-50);
        text-decoration: none;
        transition: background var(--transition-duration);
    }
    .row:hover {
        background: var(--background-700);
    }
    .tag {
        font-family: var(--font-monospace);
        font-weight: 600;
    }
    .date {
        color: var(--text-300);
        font-size: var(--font-size-small);
        min-width: 7rem;
        text-align: right;
    }
</style>
