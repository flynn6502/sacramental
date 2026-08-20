<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/geo.php';

header('Content-Type: application/json; charset=utf-8');
appSessionStart();
requireCsrf();
$user = requireUser();

$data = readJsonBody();
if (empty($data['consent'])) {
    jsonResponse(['ok' => true, 'logged' => false]);
}

$ip = getClientIp();
$geo = lookupGeoLocation($ip);
logAccess(getDb(), [
    'user_id' => (int) $user['id'],
    'unit_id' => (int) $user['unit_id'],
    'unit_number' => $user['unit_number'],
    'unit_name' => $user['unit_name'],
    'ip_address' => $ip,
    'city' => $geo['city'],
    'region' => $geo['region'],
    'country' => $geo['country'],
    'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 250),
]);

jsonResponse(['ok' => true, 'logged' => true]);
