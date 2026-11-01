<?php

require __DIR__ . '/lib.php';

$route = trim($_GET['r'] ?? '', '/');

if ($route === '') {
    page_index();
} elseif (preg_match('#^v/([^/]+)$#', $route, $m)) {
    page_version(rawurldecode($m[1]));
} elseif ($route === 'nightly') {
    page_nightly();
} else {
    not_found();
}


function page_index() {
    $all = versions();
    $kinds = ['all', 'stable', 'beta', 'alpha'];

    $kind = $_GET['kind'] ?? 'all';
    if (!in_array($kind, $kinds, true)) $kind = 'all';
    $q = trim($_GET['q'] ?? '');
    $only_hosted = isset($_GET['hosted']);

    $counts = ['all' => 0, 'stable' => 0, 'beta' => 0, 'alpha' => 0];
    foreach ($all as $v) {
        $counts['all']++;
        $counts[$v['kind']]++;
    }

    // which versions have files on this server
    $hosted = [];
    foreach ($all as $v) {
        if (!safe_name($v['tag'])) continue;
        $n = count(list_files(ROOT . '/files/releases/' . $v['tag']));
        if ($n) $hosted[$v['tag']] = $n;
    }

    $groups = [];
    foreach ($all as $v) {
        if ($kind !== 'all' && $v['kind'] !== $kind) continue;
        if ($q !== '' && stripos($v['tag'], $q) === false) continue;
        if ($only_hosted && !isset($hosted[$v['tag']])) continue;
        $groups[major_of($v['tag'])][] = $v;
    }
    krsort($groups);

    // keeps the other filters when you click a chip
    $link = function ($k, $hosted_flag) use ($q) {
        $params = [];
        if ($k !== 'all') $params['kind'] = $k;
        if ($q !== '') $params['q'] = $q;
        if ($hosted_flag) $params['hosted'] = 1;
        return url('', $params);
    };

    head('', 'releases');
    ?>
    <h1><?= h(config()['title']) ?></h1>
    <p class="lead"><?= h(config()['intro']) ?></p>
    <p class="dim">
        <?= $counts['stable'] ?> stable, <?= $counts['beta'] ?> beta, <?= $counts['alpha'] ?> alpha
        &middot; <?= count($hosted) ?> with files here
        &middot; <?= count(nightlies()) ?> nightlies
    </p>

    <form class="controls" method="get" action="<?= h(url()) ?>">
        <input type="search" name="q" value="<?= h($q) ?>" placeholder="Search versions, e.g. 4.6 or beta">
        <?php if ($kind !== 'all'): ?><input type="hidden" name="kind" value="<?= h($kind) ?>"><?php endif; ?>
        <?php if ($only_hosted): ?><input type="hidden" name="hosted" value="1"><?php endif; ?>
        <button>Search</button>
    </form>

    <div class="chips">
        <?php foreach ($kinds as $k): ?>
            <a href="<?= h($link($k, $only_hosted)) ?>" <?= $kind === $k ? 'class="on"' : '' ?>><?= $k ?> <span><?= $counts[$k] ?></span></a>
        <?php endforeach; ?>
        <a href="<?= h($link($kind, !$only_hosted)) ?>" <?= $only_hosted ? 'class="on"' : '' ?>>has files</a>
    </div>

    <?php if (!$groups): ?>
        <p>Nothing matches.</p>
    <?php endif; ?>

    <?php foreach ($groups as $major => $list): ?>
        <h2>v<?= $major ?>.x</h2>
        <div class="list">
            <?php foreach ($list as $v): $n = $hosted[$v['tag']] ?? 0; ?>
                <a class="row" href="<?= h(url('v/' . $v['tag'])) ?>">
                    <span class="tag"><?= h($v['tag']) ?></span>
                    <span class="label <?= h($v['kind']) ?>"><?= h($v['kind']) ?></span>
                    <span class="dim"><?= $n ? $n . ($n == 1 ? ' file' : ' files') : '' ?></span>
                    <span class="dim date"><?= h(nice_date($v['date'])) ?></span>
                </a>
            <?php endforeach; ?>
        </div>
    <?php endforeach; ?>
    <?php
    foot();
}


function page_version($tag) {
    if (!safe_name($tag)) return not_found();

    $all = versions();
    $i = null;
    foreach ($all as $n => $v) {
        if ($v['tag'] === $tag) $i = $n;
    }

    // a folder with no entry in versions.json still gets a page
    $dir = ROOT . '/files/releases/' . $tag;
    if ($i === null && !is_dir($dir)) return not_found();

    $v = $i !== null ? $all[$i] : ['tag' => $tag, 'kind' => 'stable', 'date' => null, 'commit' => null, 'notes' => ''];
    $repo = config()['repo'];
    $older = $i !== null ? ($all[$i + 1] ?? null) : null;   // list is newest first
    $newer = ($i !== null && $i > 0) ? $all[$i - 1] : null;
    $files = list_files($dir);

    head($tag, 'releases');
    ?>
    <h1 class="mono"><?= h($tag) ?> <span class="label <?= h($v['kind']) ?>"><?= h($v['kind']) ?></span></h1>
    <p class="dim">
        Released <?= h(nice_date($v['date'])) ?>
        <?php if ($v['commit']): ?>
            &middot; commit <a href="https://github.com/<?= h($repo) ?>/commit/<?= h($v['commit']) ?>"><code><?= h(substr($v['commit'], 0, 8)) ?></code></a>
        <?php endif; ?>
    </p>
    <p>
        <a class="btn" href="https://github.com/<?= h($repo) ?>/releases/tag/<?= h(rawurlencode($tag)) ?>">GitHub release</a>
        <?php if ($older): ?><a class="btn" href="<?= h(url('v/' . $older['tag'])) ?>">&larr; <?= h($older['tag']) ?></a><?php endif; ?>
        <?php if ($newer): ?><a class="btn" href="<?= h(url('v/' . $newer['tag'])) ?>"><?= h($newer['tag']) ?> &rarr;</a><?php endif; ?>
    </p>

    <section class="card">
        <h2>Files</h2>
        <?php if ($files): ?>
            <?php files_table($files, 'releases/' . $tag); ?>
        <?php else: ?>
            <p class="dim">No files yet. Put them in <code>files/releases/<?= h($tag) ?>/</code>.</p>
        <?php endif; ?>
    </section>

    <?php if (!empty($v['notes'])): ?>
        <section class="card">
            <h2>Release notes</h2>
            <div class="notes"><?= h($v['notes']) ?></div>
        </section>
    <?php endif; ?>
    <?php
    foot();
}


function page_nightly() {
    $all = nightlies();
    $per_page = max(1, (int)config()['nightly_per_page']);
    $pages = max(1, (int)ceil(count($all) / $per_page));
    $page = min($pages, max(1, (int)($_GET['page'] ?? 1)));
    $repo = config()['repo'];

    head('Nightlies', 'nightly');
    ?>
    <h1>Nightlies</h1>
    <p class="dim">
        <?= count($all) ?> build<?= count($all) == 1 ? '' : 's' ?>. Each folder in <code>files/nightly/</code> is one build.
        "Rebuilt" ones were compiled again from the old commit, so they are not identical to the originals.
    </p>

    <?php if (!$all): ?>
        <p>Nothing here yet. Make a folder <code>files/nightly/&lt;commit&gt;/</code> and put the build files in it.</p>
    <?php endif; ?>

    <?php foreach (array_slice($all, ($page - 1) * $per_page, $per_page) as $n): $files = list_files($n['dir']); ?>
        <section class="card">
            <h2 class="mono">
                <?php if ($n['commit']): ?>
                    <a href="https://github.com/<?= h($repo) ?>/commit/<?= h($n['commit']) ?>"><?= h(substr($n['commit'], 0, 8)) ?></a>
                <?php else: ?>
                    <?= h($n['name']) ?>
                <?php endif; ?>
                <?php if ($n['origin'] === 'original' || $n['origin'] === 'rebuilt'): ?>
                    <span class="label <?= h($n['origin']) ?>"><?= h($n['origin']) ?></span>
                <?php endif; ?>
            </h2>
            <p class="dim"><?= h(nice_date($n['date'])) ?><?= $n['note'] !== '' ? ' &middot; ' . h($n['note']) : '' ?></p>
            <?php if ($files): ?>
                <?php files_table($files, 'nightly/' . $n['name']); ?>
            <?php else: ?>
                <p class="dim">Empty folder.</p>
            <?php endif; ?>
        </section>
    <?php endforeach; ?>

    <?php if ($pages > 1): ?>
        <div class="chips">
            <?php for ($p = 1; $p <= $pages; $p++): ?>
                <a href="<?= h(url('nightly', $p > 1 ? ['page' => $p] : [])) ?>" <?= $p === $page ? 'class="on"' : '' ?>><?= $p ?></a>
            <?php endfor; ?>
        </div>
    <?php endif; ?>
    <?php
    foot();
}
