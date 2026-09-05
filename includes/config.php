<?php

declare(strict_types=1);

$configLocal = __DIR__ . DIRECTORY_SEPARATOR . 'config.local.php';
$configExample = __DIR__ . DIRECTORY_SEPARATOR . 'config.example.php';

if (is_readable($configLocal)) {
    require_once $configLocal;
} elseif (is_readable($configExample)) {
    require_once $configExample;
} else {
    // Fallback mínimo se nenhum arquivo de config estiver no servidor
    if (!defined('APP_NAME')) {
        define('APP_NAME', 'Agenda Sacramental');
    }
    if (!defined('APP_TIMEZONE')) {
        define('APP_TIMEZONE', 'America/Sao_Paulo');
    }
    if (!defined('SESSION_LIFETIME_DAYS')) {
        define('SESSION_LIFETIME_DAYS', 90);
    }
    if (!defined('ADMIN_USERNAME')) {
        define('ADMIN_USERNAME', 'admin');
    }
    if (!defined('ADMIN_PASSWORD')) {
        define('ADMIN_PASSWORD', 'altere-esta-senha');
    }
    if (!defined('ADMIN_SESSION_KEY')) {
        define('ADMIN_SESSION_KEY', 'altere-esta-chave-longa-e-aleatoria');
    }
    if (!defined('MAIL_FROM')) {
        define('MAIL_FROM', 'noreply@localhost');
    }
    if (!defined('MAIL_FROM_NAME')) {
        define('MAIL_FROM_NAME', 'Agenda Sacramental');
    }
    if (!defined('MAIL_SMTP_HOST')) {
        define('MAIL_SMTP_HOST', '');
    }
    if (!defined('MAIL_SMTP_PORT')) {
        define('MAIL_SMTP_PORT', 587);
    }
    if (!defined('MAIL_SMTP_USER')) {
        define('MAIL_SMTP_USER', '');
    }
    if (!defined('MAIL_SMTP_PASS')) {
        define('MAIL_SMTP_PASS', '');
    }
    if (!defined('MAIL_SMTP_SECURE')) {
        define('MAIL_SMTP_SECURE', 'tls');
    }
}

if (!defined('APP_TIMEZONE')) {
    define('APP_TIMEZONE', 'America/Sao_Paulo');
}

if (!defined('SESSION_LIFETIME_DAYS')) {
    define('SESSION_LIFETIME_DAYS', 90);
}

if (!defined('ADMIN_USERNAME')) {
    define('ADMIN_USERNAME', 'admin');
}
if (!defined('ADMIN_PASSWORD')) {
    define('ADMIN_PASSWORD', 'altere-esta-senha');
}
if (!defined('ADMIN_SESSION_KEY')) {
    define('ADMIN_SESSION_KEY', 'altere-esta-chave-longa-e-aleatoria');
}

@date_default_timezone_set(APP_TIMEZONE);
