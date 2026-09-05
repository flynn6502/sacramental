<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'site.php';

/**
 * Cache-busting version derived from file contents (automatic).
 * Changes whenever the asset file changes on disk — no manual bump needed.
 */
function assetVersion(string $relativePath): string
{
    $fullPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);

    if (!file_exists($fullPath) || !is_readable($fullPath)) {
        return '0';
    }

    $hash = @md5_file($fullPath);
    if ($hash === false) {
        return (string) filemtime($fullPath) . 's' . (string) filesize($fullPath);
    }

    return substr($hash, 0, 12);
}

function assetUrl(string $relativePath): string
{
    $base = getSiteBaseUrl();
    $path = ltrim(str_replace('\\', '/', $relativePath), '/');

    return $base . '/' . $path . '?v=' . assetVersion($relativePath);
}

function inlineCss(string $relativePath): string
{
    $fullPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);

    if (!file_exists($fullPath)) {
        return '';
    }

    return (string) file_get_contents($fullPath);
}
