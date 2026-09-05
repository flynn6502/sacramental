<?php

declare(strict_types=1);

define('APP_NAME', 'Agenda Sacramental');
define('APP_TIMEZONE', 'America/Sao_Paulo');
define('SESSION_LIFETIME_DAYS', 90);

define('ADMIN_USERNAME', 'admin');
define('ADMIN_PASSWORD', 'altere-esta-senha');
define('ADMIN_SESSION_KEY', 'altere-esta-chave-longa-e-aleatoria');

// E-mail — deixe MAIL_SMTP_HOST vazio para usar PHP mail() do HostGator.
// MAIL_FROM deve ser um endereço do seu domínio (ex.: suporte@altasoftware.com.br).
define('MAIL_FROM', 'suporte@altasoftware.com.br');
define('MAIL_FROM_NAME', 'Agenda Sacramental');
define('MAIL_SMTP_HOST', '');
define('MAIL_SMTP_PORT', 587);
define('MAIL_SMTP_USER', '');
define('MAIL_SMTP_PASS', '');
define('MAIL_SMTP_SECURE', 'tls');
