<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'db.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'site.php';

function sessionLifetimeSeconds(): int
{
    $days = defined('SESSION_LIFETIME_DAYS') ? (int) SESSION_LIFETIME_DAYS : 90;

    return max(1, $days) * 86400;
}

function appCookiePath(): string
{
    $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/');
    $dir = dirname($scriptName);
    if (substr($dir, -6) === '/admin' || substr($dir, -4) === '/api') {
        $dir = dirname($dir);
    }
    if ($dir === '/' || $dir === '\\' || $dir === '.') {
        return '/';
    }

    return rtrim($dir, '/') . '/';
}

function refreshSessionCookie(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE || empty($_SESSION['user_id'])) {
        return;
    }

    $params = session_get_cookie_params();
    setcookie(session_name(), session_id(), [
        'expires' => time() + sessionLifetimeSeconds(),
        'path' => $params['path'],
        'domain' => $params['domain'],
        'secure' => $params['secure'],
        'httponly' => $params['httponly'],
        'samesite' => $params['samesite'] ?? 'Lax',
    ]);
}

function appSessionStart(): void
{
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }

    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443)
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string) sessionLifetimeSeconds());

    session_set_cookie_params([
        'lifetime' => sessionLifetimeSeconds(),
        'path' => appCookiePath(),
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_name('sacramental_sid');
    session_start();
}

function jsonResponse(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return $_POST ?: [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function ensureCsrfToken(): string
{
    appSessionStart();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function requireCsrf(): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' || empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
        jsonResponse(['error' => 'Token de segurança inválido. Recarregue a página.'], 403);
    }
}

function currentUserRow(): ?array
{
    appSessionStart();
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $pdo = getDb();
    $stmt = $pdo->prepare(
        'SELECT u.id, u.unit_id, u.username, u.email, u.display_name, u.created_at,
                un.unit_number, un.unit_name
         FROM users u
         INNER JOIN units un ON un.id = u.unit_id
         WHERE u.id = :id'
    );
    $stmt->execute([':id' => (int) $_SESSION['user_id']]);
    $user = $stmt->fetch();
    if ($user) {
        refreshSessionCookie();
    }

    return $user ?: null;
}

function publicUser(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'username' => $row['username'],
        'email' => $row['email'],
        'display_name' => $row['display_name'],
        'unit_id' => (int) $row['unit_id'],
        'unit_number' => $row['unit_number'],
        'unit_name' => $row['unit_name'],
    ];
}

function requireUser(): array
{
    $user = currentUserRow();
    if (!$user) {
        jsonResponse(['error' => 'Sessão expirada. Entre novamente.'], 401);
    }
    return $user;
}

function loginFailuresKey(string $username): string
{
    return 'login_fail_' . md5(mb_strtolower($username));
}

function checkLoginRateLimit(string $username): void
{
    appSessionStart();
    $key = loginFailuresKey($username);
    $info = $_SESSION[$key] ?? ['count' => 0, 'until' => 0];
    if ((int) $info['until'] > time()) {
        jsonResponse(['error' => 'Muitas tentativas. Aguarde um minuto e tente novamente.'], 429);
    }
}

function recordLoginFailure(string $username): void
{
    appSessionStart();
    $key = loginFailuresKey($username);
    $info = $_SESSION[$key] ?? ['count' => 0, 'until' => 0];
    $info['count'] = (int) $info['count'] + 1;
    if ($info['count'] >= 8) {
        $info['until'] = time() + 60;
        $info['count'] = 0;
    }
    $_SESSION[$key] = $info;
}

function clearLoginFailures(string $username): void
{
    appSessionStart();
    unset($_SESSION[loginFailuresKey($username)]);
}

function adminSessionStart(): void
{
    appSessionStart();
}

function isAdminLoggedIn(): bool
{
    adminSessionStart();
    return !empty($_SESSION[ADMIN_SESSION_KEY]);
}

function requireAdminPage(): void
{
    if (!isAdminLoggedIn()) {
        header('Location: login.php');
        exit;
    }
}

function loginAdmin(string $username, string $password): bool
{
    adminSessionStart();
    if ($username === ADMIN_USERNAME && hash_equals((string) ADMIN_PASSWORD, $password)) {
        session_regenerate_id(true);
        $_SESSION[ADMIN_SESSION_KEY] = true;
        return true;
    }
    return false;
}

function logoutAdmin(): void
{
    adminSessionStart();
    unset($_SESSION[ADMIN_SESSION_KEY]);
}

function getUserPreferences(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT * FROM user_preferences WHERE user_id = :id');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        $pdo->prepare('INSERT INTO user_preferences (user_id) VALUES (:id)')->execute([':id' => $userId]);
        return [
            'preside_names' => [],
            'conduct_names' => [],
            'chorister_names' => [],
            'pianist_names' => [],
            'meeting_time' => '09:00',
            'week_starts_on' => 'monday',
        ];
    }

    $week = strtolower(trim((string) ($row['week_starts_on'] ?? 'monday')));
    if ($week !== 'sunday') {
        $week = 'monday';
    }

    return [
        'preside_names' => decodeJsonField($row['preside_names']),
        'conduct_names' => decodeJsonField($row['conduct_names']),
        'chorister_names' => decodeJsonField($row['chorister_names']),
        'pianist_names' => decodeJsonField($row['pianist_names']),
        'meeting_time' => $row['meeting_time'] ?: '09:00',
        'week_starts_on' => $week,
    ];
}
