<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/hymns.php';

header('Content-Type: application/json; charset=utf-8');
appSessionStart();
requireUser();

$q = trim((string) ($_GET['q'] ?? ''));
jsonResponse(['hymns' => searchHymns($q, 50)]);
