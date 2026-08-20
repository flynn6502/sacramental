<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/geo.php';
require_once dirname(__DIR__) . '/includes/mail.php';

header('Content-Type: application/json; charset=utf-8');

appSessionStart();

$action = $_GET['action'] ?? ($_POST['action'] ?? '');

switch ($action) {
    case 'session':
        handleSession();
        break;
    case 'login':
        handleLogin();
        break;
    case 'register':
        handleRegister();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'forgot':
        handleForgot();
        break;
    case 'reset':
        handleReset();
        break;
    case 'check_unit':
        handleCheckUnit();
        break;
    default:
        jsonResponse(['error' => 'Ação inválida.'], 400);
}

function handleSession(): void
{
    $user = currentUserRow();
    if (!$user) {
        jsonResponse(['authenticated' => false, 'csrf_token' => ensureCsrfToken()]);
    }

    jsonResponse([
        'authenticated' => true,
        'csrf_token' => ensureCsrfToken(),
        'user' => publicUser($user),
        'preferences' => getUserPreferences(getDb(), (int) $user['id']),
    ]);
}

function handleLogin(): void
{
    $data = readJsonBody();
    $username = trim((string) ($data['username'] ?? ''));
    $password = (string) ($data['password'] ?? '');
    $consent = !empty($data['consent']);

    if ($username === '' || $password === '') {
        jsonResponse(['error' => 'Informe usuário e senha.'], 400);
    }

    checkLoginRateLimit($username);

    $pdo = getDb();
    $stmt = $pdo->prepare(
        'SELECT u.*, un.unit_number, un.unit_name
         FROM users u
         INNER JOIN units un ON un.id = u.unit_id
         WHERE LOWER(u.username) = LOWER(:username) OR LOWER(u.email) = LOWER(:email)'
    );
    $stmt->execute([':username' => $username, ':email' => $username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        recordLoginFailure($username);
        jsonResponse(['error' => 'Usuário ou senha inválidos.'], 401);
    }

    clearLoginFailures($username);
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['unit_id'] = (int) $user['unit_id'];
    ensureCsrfToken();

    if ($consent) {
        $ip = getClientIp();
        $geo = lookupGeoLocation($ip);
        logAccess($pdo, [
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
    }

    jsonResponse([
        'success' => true,
        'csrf_token' => ensureCsrfToken(),
        'user' => publicUser($user),
        'preferences' => getUserPreferences($pdo, (int) $user['id']),
    ]);
}

function handleRegister(): void
{
    $data = readJsonBody();
    $username = trim((string) ($data['username'] ?? ''));
    $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
    $password = (string) ($data['password'] ?? '');
    $displayName = trim((string) ($data['display_name'] ?? ''));
    $unitNumber = trim((string) ($data['unit_number'] ?? ''));
    $unitName = trim((string) ($data['unit_name'] ?? ''));

    if ($username === '' || $email === '' || $password === '' || $displayName === '' || $unitNumber === '' || $unitName === '') {
        jsonResponse(['error' => 'Preencha todos os campos do primeiro acesso.'], 400);
    }
    if (!preg_match('/^[a-zA-Z0-9._-]{3,40}$/', $username)) {
        jsonResponse(['error' => 'O usuário deve ter 3 a 40 caracteres (letras, números, ponto, hífen ou underline).'], 400);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => 'Informe um e-mail válido.'], 400);
    }
    if (strlen($password) < 8) {
        jsonResponse(['error' => 'A senha deve ter pelo menos 8 caracteres.'], 400);
    }

    $pdo = getDb();

    $existsUnit = $pdo->prepare('SELECT id FROM units WHERE unit_number = :n');
    $existsUnit->execute([':n' => $unitNumber]);
    if ($existsUnit->fetch()) {
        jsonResponse(['error' => 'Esta unidade já está cadastrada. Peça a um líder da unidade para adicionar o seu usuário.'], 409);
    }

    $existsUser = $pdo->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(:u) OR LOWER(email) = LOWER(:e)');
    $existsUser->execute([':u' => $username, ':e' => $email]);
    if ($existsUser->fetch()) {
        jsonResponse(['error' => 'Usuário ou e-mail já cadastrado.'], 409);
    }

    $now = appNow();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO units (unit_number, unit_name, created_at) VALUES (:n, :name, :c)')
            ->execute([':n' => $unitNumber, ':name' => $unitName, ':c' => $now]);
        $unitId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            'INSERT INTO users (unit_id, username, email, password_hash, display_name, created_at)
             VALUES (:unit_id, :username, :email, :hash, :display_name, :created_at)'
        )->execute([
            ':unit_id' => $unitId,
            ':username' => $username,
            ':email' => $email,
            ':hash' => password_hash($password, PASSWORD_DEFAULT),
            ':display_name' => $displayName,
            ':created_at' => $now,
        ]);
        $userId = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO user_preferences (user_id) VALUES (:id)')->execute([':id' => $userId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        jsonResponse(['error' => 'Não foi possível concluir o cadastro. Tente novamente.'], 500);
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['unit_id'] = $unitId;

    $user = currentUserRow();
    jsonResponse([
        'success' => true,
        'csrf_token' => ensureCsrfToken(),
        'user' => publicUser($user),
        'preferences' => getUserPreferences($pdo, $userId),
    ]);
}

function handleLogout(): void
{
    appSessionStart();
    if (!empty($_SESSION['user_id'])) {
        requireCsrf();
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    jsonResponse(['success' => true]);
}

function handleForgot(): void
{
    $data = readJsonBody();
    $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => 'Informe o e-mail cadastrado.'], 400);
    }

    $pdo = getDb();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE LOWER(email) = :e');
    $stmt->execute([':e' => $email]);
    $user = $stmt->fetch();

    $generic = ['success' => true, 'message' => 'Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.'];

    if (!$user) {
        jsonResponse($generic);
    }

    $token = bin2hex(random_bytes(32));
    $pdo->prepare(
        'INSERT INTO password_resets (user_id, token_hash, expires_at, used, created_at)
         VALUES (:uid, :hash, :exp, 0, :c)'
    )->execute([
        ':uid' => $user['id'],
        ':hash' => hash('sha256', $token),
        ':exp' => (new DateTime('now', appTimezone()))->modify('+1 hour')->format('Y-m-d H:i:s'),
        ':c' => appNow(),
    ]);

    $link = getSiteBaseUrl() . '/index.php?reset=' . urlencode($token);
    $html = '<p>Olá, ' . htmlspecialchars($user['display_name']) . '.</p>'
        . '<p>Recebemos um pedido para redefinir a senha da <strong>Agenda Sacramental</strong>.</p>'
        . '<p><a href="' . htmlspecialchars($link) . '">Clique aqui para criar uma nova senha</a>.</p>'
        . '<p>Este link expira em 1 hora. Se você não solicitou a alteração, ignore este e-mail.</p>'
        . '<p>Alta Software</p>';

    sendAppMail($user['email'], 'Redefinição de senha — Agenda Sacramental', $html);
    jsonResponse($generic);
}

function handleReset(): void
{
    $data = readJsonBody();
    $token = trim((string) ($data['token'] ?? ''));
    $password = (string) ($data['password'] ?? '');

    if ($token === '' || strlen($password) < 8) {
        jsonResponse(['error' => 'Token inválido ou senha muito curta (mínimo 8 caracteres).'], 400);
    }

    $pdo = getDb();
    $stmt = $pdo->prepare(
        'SELECT * FROM password_resets
         WHERE token_hash = :h AND used = 0 AND expires_at >= :now
         ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([':h' => hash('sha256', $token), ':now' => appNow()]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonResponse(['error' => 'Este link expirou ou já foi usado. Solicite uma nova redefinição.'], 400);
    }

    $pdo->prepare('UPDATE users SET password_hash = :h WHERE id = :id')
        ->execute([':h' => password_hash($password, PASSWORD_DEFAULT), ':id' => $row['user_id']]);
    $pdo->prepare('UPDATE password_resets SET used = 1 WHERE id = :id')->execute([':id' => $row['id']]);

    jsonResponse(['success' => true, 'message' => 'Senha alterada. Você já pode entrar.']);
}

function handleCheckUnit(): void
{
    $number = trim((string) ($_GET['unit_number'] ?? ''));
    if ($number === '') {
        jsonResponse(['exists' => false]);
    }
    $stmt = getDb()->prepare('SELECT id FROM units WHERE unit_number = :n');
    $stmt->execute([':n' => $number]);
    jsonResponse(['exists' => (bool) $stmt->fetch()]);
}
