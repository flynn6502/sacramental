<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'site.php';

function assetVersion(string $relativePath): string
{
    $fullPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    $stamp = file_exists($fullPath) ? (string) filemtime($fullPath) : '0';
    $appVer = defined('APP_ASSET_VERSION') ? APP_ASSET_VERSION : '1';

    return $appVer . '.' . $stamp;
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
