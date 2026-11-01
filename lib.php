<?php

define('ROOT', __DIR__);

function config() {
    static $c;
    if (!$c) $c = require ROOT . '/config.php';
    return $c;
}

// escape for html
function h($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

// urls

function base() {
    return rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
}

function url($route = '', $query = []) {
    if (config()['pretty_urls']) {
        $u = base() . '/' . $route;
    } else {
        if ($route !== '') $query = ['r' => $route] + $query;
        $u = base() . '/index.php';
    }
    return $query ? $u . '?' . http_build_query($query) : $u;
}

function file_url($rel) {
    $parts = array_map('rawurlencode', explode('/', $rel));
    return base() . '/files/' . implode('/', $parts);
}

function asset($path) {
    return base() . '/' . $path;
}

// folder names come from the url so keep them boring
function safe_name($s) {
    if (strlen($s) > 100 || str_contains($s, '..')) return false;
    return preg_match('/^[A-Za-z0-9][A-Za-z0-9._+-]*$/', $s) === 1;
}

// all the files in a folder (recursive), sorted by name
function list_files($dir) {
    if (!is_dir($dir) || is_link($dir)) return [];

    $out = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (!$f->isFile() || $f->isLink()) continue;

        $name = str_replace('\\', '/', substr($f->getPathname(), strlen($dir) + 1));
        // skip hidden stuff, meta.json and anything php
        if (preg_match('#(^|/)\.#', $name)) continue;
        if ($name === 'meta.json' || str_ends_with($name, '.php')) continue;

        $out[] = [
            'name' => $name,
            'size' => $f->getSize(),
            'path' => $f->getPathname(),
        ];
    }
    usort($out, fn($a, $b) => strcmp($a['name'], $b['name']));
    return $out;
}

// hashing big files on every page load would be slow, so remember the result
function sha256_of($path) {
    static $cache;
    $cache_file = ROOT . '/data/cache/hashes.json';
    if ($cache === null) {
        $cache = is_file($cache_file) ? json_decode(file_get_contents($cache_file), true) : [];
        if (!$cache) $cache = [];
    }

    $key = substr($path, strlen(ROOT));
    $sig = filesize($path) . ':' . filemtime($path);
    if (isset($cache[$key]) && $cache[$key]['sig'] === $sig) {
        return $cache[$key]['sha'];
    }

    $sha = hash_file('sha256', $path);
    $cache[$key] = ['sig' => $sig, 'sha' => $sha];
    if (is_dir(dirname($cache_file)) || @mkdir(dirname($cache_file), 0755, true)) {
        @file_put_contents($cache_file, json_encode($cache), LOCK_EX);
    }
    return $sha;
}

function nice_size($bytes) {
    if ($bytes < 1024) return $bytes . ' B';
    if ($bytes < 1024 * 1024) return round($bytes / 1024, 1) . ' KB';
    if ($bytes < 1024 * 1024 * 1024) return round($bytes / 1024 / 1024, 1) . ' MB';
    return round($bytes / 1024 / 1024 / 1024, 2) . ' GB';
}

function nice_date($iso) {
    $t = $iso ? strtotime($iso) : false;
    return $t ? gmdate('j M Y', $t) : 'unknown date';
}

// data

function versions() {
    static $v;
    if ($v === null) {
        $file = ROOT . '/data/versions.json';
        $v = is_file($file) ? json_decode(file_get_contents($file), true) : [];
        if (!$v) $v = [];
    }
    return $v;
}

function major_of($tag) {
    return preg_match('/^v?(\d+)/', $tag, $m) ? (int)$m[1] : 0;
}

// every folder in files/nightly is one nightly (named after the commit usually).
// a meta.json inside can have: date, commit, origin (original/rebuilt), note
function nightlies() {
    $out = [];
    foreach (glob(ROOT . '/files/nightly/*', GLOB_ONLYDIR) as $dir) {
        $name = basename($dir);
        if (!safe_name($name) || is_link($dir)) continue;

        $meta = [];
        if (is_file($dir . '/meta.json')) {
            $meta = json_decode(file_get_contents($dir . '/meta.json'), true) ?: [];
        }

        $commit = $meta['commit'] ?? '';
        if ($commit === '' && preg_match('/^[0-9a-f]{7,40}$/i', $name)) $commit = $name;

        $out[] = [
            'name' => $name,
            'commit' => $commit,
            'date' => $meta['date'] ?? gmdate('c', filemtime($dir)),
            'origin' => $meta['origin'] ?? '',
            'note' => $meta['note'] ?? '',
            'dir' => $dir,
        ];
    }
    usort($out, fn($a, $b) => strtotime($b['date']) <=> strtotime($a['date']));
    return $out;
}

// page layout

function head($title = '', $active = '') {
    $site = config()['title'];
    $full = $title ? "$title - $site" : $site;
    ?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= h($full) ?></title>
    <link rel="stylesheet" href="<?= h(asset('style.css')) ?>">
</head>
<body>
<header>
    <a class="brand" href="<?= h(url()) ?>"><?= h($site) ?></a>
    <nav>
        <a href="<?= h(url()) ?>" <?= $active === 'releases' ? 'class="on"' : '' ?>>Releases</a>
        <a href="<?= h(url('nightly')) ?>" <?= $active === 'nightly' ? 'class="on"' : '' ?>>Nightlies</a>
        <a href="https://github.com/<?= h(config()['repo']) ?>">GitHub</a>
    </nav>
</header>
<main>
<?php
}

function foot() {
    ?>
</main>
<footer>Unofficial archive. Geode is made by the Geode Team.</footer>
</body>
</html>
<?php
}

function files_table($files, $prefix) {
    ?>
<table>
    <tr><th>File</th><th>Size</th><th>SHA-256</th></tr>
    <?php foreach ($files as $f): $sha = sha256_of($f['path']); ?>
        <tr>
            <td><a href="<?= h(file_url($prefix . '/' . $f['name'])) ?>"><?= h($f['name']) ?></a></td>
            <td class="dim"><?= h(nice_size($f['size'])) ?></td>
            <td class="dim"><code title="<?= h($sha) ?>"><?= h(substr($sha, 0, 16)) ?></code></td>
        </tr>
    <?php endforeach; ?>
</table>
<?php
}

function not_found() {
    http_response_code(404);
    head('Not found');
    ?>
    <h1>Not found</h1>
    <p><a href="<?= h(url()) ?>">Back to the archive</a></p>
    <?php
    foot();
}
