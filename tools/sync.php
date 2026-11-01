<?php
// updates data/versions.json from the github releases
//   php tools/sync.php
// set GITHUB_TOKEN if you hit the anonymous rate limit (60 requests/hour).
// old entries are kept even if the release gets deleted upstream.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$config = require __DIR__ . '/../config.php';
$repo = $config['repo'];
$file = __DIR__ . '/../data/versions.json';

function kind_of($tag) {
    if (str_contains($tag, '-alpha')) return 'alpha';
    if (str_contains($tag, '-beta')) return 'beta';
    return 'stable';
}

function github($path) {
    $headers = "User-Agent: geode-archive-sync\r\nAccept: application/vnd.github+json";
    if ($token = getenv('GITHUB_TOKEN')) $headers .= "\r\nAuthorization: Bearer $token";

    $ctx = stream_context_create(['http' => ['header' => $headers, 'timeout' => 30, 'ignore_errors' => true]]);
    $body = @file_get_contents("https://api.github.com$path", false, $ctx);

    preg_match('#HTTP/\S+ (\d+)#', $http_response_header[0] ?? '', $m);
    if ($body === false || ($m[1] ?? 0) != 200) {
        fwrite(STDERR, "github said no for $path (" . ($m[1] ?? '?') . ")\n");
        exit(1);
    }
    return json_decode($body, true);
}

$versions = [];
if (is_file($file)) {
    foreach (json_decode(file_get_contents($file), true) as $v) {
        $versions[$v['tag']] = $v;
    }
}

$added = 0;
$page = 1;
do {
    $releases = github("/repos/$repo/releases?per_page=100&page=$page");
    foreach ($releases as $r) {
        $tag = $r['tag_name'];
        if ($r['draft'] || str_starts_with($tag, 'nightly')) continue;

        if (!isset($versions[$tag])) $added++;
        $versions[$tag] = [
            'tag' => $tag,
            'kind' => kind_of($tag),
            'name' => $r['name'] ?: $tag,
            'commit' => $versions[$tag]['commit'] ?? null,
            'date' => $r['published_at'] ?? $r['created_at'],
            'notes' => $r['body'] ?? '',
            'assets' => [],
        ];
    }
    $page++;
} while (count($releases) == 100);

// newest first. same x.y.z: stable, then beta, then alpha
$order = ['stable' => 2, 'beta' => 1, 'alpha' => 0];
$list = array_values($versions);
usort($list, function ($a, $b) use ($order) {
    preg_match('/(\d+)\.(\d+)\.(\d+)/', $a['tag'], $x);
    preg_match('/(\d+)\.(\d+)\.(\d+)/', $b['tag'], $y);
    for ($i = 1; $i <= 3; $i++) {
        $d = (int)($y[$i] ?? 0) - (int)($x[$i] ?? 0);
        if ($d) return $d;
    }
    if ($order[$a['kind']] != $order[$b['kind']]) return $order[$b['kind']] - $order[$a['kind']];
    return strtotime($b['date']) - strtotime($a['date']);
});

file_put_contents($file, json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX);
echo count($list) . " versions ($added new)\n";
