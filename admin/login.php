<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';

if (isAdminLoggedIn()) {
    header('Location: index.php');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    if (loginAdmin($username, $password)) {
        header('Location: index.php');
        exit;
    }

    $error = 'Usuário ou senha incorretos.';
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin — Agenda Sacramental</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/admin.css">
</head>
<body class="admin-login-body">
    <main class="login-card">
        <div class="login-header">
            <img src="../assets/sacramental-logo.png" alt="" width="64" height="64" class="login-icon">
            <h1>Painel Admin</h1>
            <p>Agenda Sacramental</p>
        </div>
        <?php if ($error !== ''): ?>
            <div class="alert alert-danger" role="alert"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <form method="post">
            <div class="mb-3">
                <label class="form-label" for="username">Usuário</label>
                <input class="form-control" id="username" name="username" required autofocus>
            </div>
            <div class="mb-3">
                <label class="form-label" for="password">Senha</label>
                <input class="form-control" id="password" name="password" type="password" required>
            </div>
            <button class="btn btn-admin w-100" type="submit">Entrar</button>
        </form>
    </main>
</body>
</html>
