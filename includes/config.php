<?php

declare(strict_types=1);

$configLocal = __DIR__ . DIRECTORY_SEPARATOR . 'config.local.php';

if (file_exists($configLocal)) {
    require_once $configLocal;
} else {
    require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.example.php';
}

if (!defined('APP_TIMEZONE')) {
    define('APP_TIMEZONE', 'America/Sao_Paulo');
}

if (!defined('APP_ASSET_VERSION')) {
    define('APP_ASSET_VERSION', '1');
}

if (!defined('SESSION_LIFETIME_DAYS')) {
    define('SESSION_LIFETIME_DAYS', 90);
}

date_default_timezone_set(APP_TIMEZONE);
