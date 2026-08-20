<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';

header('Content-Type: application/json; charset=utf-8');
appSessionStart();
$user = requireUser();
$pdo = getDb();

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD', 'OPTIONS'], true)) {
    requireCsrf();
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'me':
        jsonResponse([
            'user' => publicUser($user),
            'preferences' => getUserPreferences($pdo, (int) $user['id']),
        ]);
    case 'update_profile':
        handleUpdateProfile($pdo, $user);
        break;
    case 'update_password':
        handleUpdatePassword($pdo, $user);
        break;
    case 'preferences':
        handlePreferences($pdo, $user);
        break;
    case 'unit_users':
        handleUnitUsers($pdo, $user);
        break;
    case 'add_user':
        handleAddUser($pdo, $user);
        break;
    default:
        jsonResponse(['error' => 'Ação inválida.'], 400);
}

function handleUpdateProfile(PDO $pdo, array $user): void
{
    $data = readJsonBody();
    $display = trim((string) ($data['display_name'] ?? ''));
    $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
    $username = trim((string) ($data['username'] ?? ''));

    if ($display === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-zA-Z0-9._-]{3,40}$/', $username)) {
        jsonResponse(['error' => 'Dados de perfil inválidos.'], 400);
    }

    $dup = $pdo->prepare('SELECT id FROM users WHERE (LOWER(username) = LOWER(:u) OR LOWER(email) = LOWER(:e)) AND id != :id');
    $dup->execute([':u' => $username, ':e' => $email, ':id' => $user['id']]);
    if ($dup->fetch()) {
        jsonResponse(['error' => 'Usuário ou e-mail já utilizados por outra conta.'], 409);
    }

    $pdo->prepare('UPDATE users SET display_name = :d, email = :e, username = :u WHERE id = :id')
        ->execute([':d' => $display, ':e' => $email, ':u' => $username, ':id' => $user['id']]);

    jsonResponse(['success' => true, 'user' => publicUser(currentUserRow())]);
}

function handleUpdatePassword(PDO $pdo, array $user): void
{
    $data = readJsonBody();
    $current = (string) ($data['current_password'] ?? '');
    $next = (string) ($data['new_password'] ?? '');

    if (strlen($next) < 8) {
        jsonResponse(['error' => 'A nova senha deve ter pelo menos 8 caracteres.'], 400);
    }

    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id');
    $stmt->execute([':id' => $user['id']]);
    $hash = $stmt->fetchColumn();
    if (!$hash || !password_verify($current, (string) $hash)) {
        jsonResponse(['error' => 'Senha atual incorreta.'], 400);
    }

    $pdo->prepare('UPDATE users SET password_hash = :h WHERE id = :id')
        ->execute([':h' => password_hash($next, PASSWORD_DEFAULT), ':id' => $user['id']]);
    jsonResponse(['success' => true]);
}

function handlePreferences(PDO $pdo, array $user): void
{
    $data = readJsonBody();
    $cleanNames = static function ($list): array {
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        foreach ($list as $name) {
            $name = trim((string) $name);
            if ($name !== '') {
                $out[] = $name;
            }
        }
        return array_values(array_unique($out));
    };

    $time = trim((string) ($data['meeting_time'] ?? '09:00'));
    if (!preg_match('/^\d{2}:\d{2}$/', $time)) {
        $time = '09:00';
    }

    $week = strtolower(trim((string) ($data['week_starts_on'] ?? 'monday')));
    if ($week !== 'sunday') {
        $week = 'monday';
    }

    $pdo->prepare(
        'UPDATE user_preferences
         SET preside_names = :p, conduct_names = :c, chorister_names = :ch, pianist_names = :pi, meeting_time = :t, week_starts_on = :w
         WHERE user_id = :id'
    )->execute([
        ':p' => encodeJsonField($cleanNames($data['preside_names'] ?? [])),
        ':c' => encodeJsonField($cleanNames($data['conduct_names'] ?? [])),
        ':ch' => encodeJsonField($cleanNames($data['chorister_names'] ?? [])),
        ':pi' => encodeJsonField($cleanNames($data['pianist_names'] ?? [])),
        ':t' => $time,
        ':w' => $week,
        ':id' => $user['id'],
    ]);

    jsonResponse(['success' => true, 'preferences' => getUserPreferences($pdo, (int) $user['id'])]);
}

function handleUnitUsers(PDO $pdo, array $user): void
{
    $stmt = $pdo->prepare(
        'SELECT id, username, email, display_name, created_at
         FROM users WHERE unit_id = :u ORDER BY display_name'
    );
    $stmt->execute([':u' => $user['unit_id']]);
    jsonResponse(['users' => $stmt->fetchAll()]);
}

function handleAddUser(PDO $pdo, array $user): void
{
    $data = readJsonBody();
    $username = trim((string) ($data['username'] ?? ''));
    $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
    $password = (string) ($data['password'] ?? '');
    $display = trim((string) ($data['display_name'] ?? ''));

    if ($username === '' || $display === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
        jsonResponse(['error' => 'Preencha nome, usuário, e-mail válido e senha com 8+ caracteres.'], 400);
    }
    if (!preg_match('/^[a-zA-Z0-9._-]{3,40}$/', $username)) {
        jsonResponse(['error' => 'Usuário inválido.'], 400);
    }

    $dup = $pdo->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(:u) OR LOWER(email) = LOWER(:e)');
    $dup->execute([':u' => $username, ':e' => $email]);
    if ($dup->fetch()) {
        jsonResponse(['error' => 'Usuário ou e-mail já cadastrado.'], 409);
    }

    $pdo->prepare(
        'INSERT INTO users (unit_id, username, email, password_hash, display_name, created_at)
         VALUES (:uid, :u, :e, :h, :d, :c)'
    )->execute([
        ':uid' => $user['unit_id'],
        ':u' => $username,
        ':e' => $email,
        ':h' => password_hash($password, PASSWORD_DEFAULT),
        ':d' => $display,
        ':c' => appNow(),
    ]);
    $id = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO user_preferences (user_id) VALUES (:id)')->execute([':id' => $id]);

    jsonResponse(['success' => true]);
}
