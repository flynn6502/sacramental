<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/site.php';
require_once __DIR__ . '/includes/assets.php';

header('Cache-Control: no-cache, no-store, must-revalidate');

$baseUrl = getSiteBaseUrl();
$ogImage = $baseUrl . '/assets/sacramental-logo.png';
$pageUrl = $baseUrl . '/';
$pageTitle = 'Agenda Sacramental';
$pageDescription = 'Prepare a agenda da reunião sacramental da sua unidade de maneira celestial.';
$resetToken = trim((string) ($_GET['reset'] ?? ''));
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($pageTitle) ?></title>
    <meta name="description" content="<?= htmlspecialchars($pageDescription) ?>">
    <link rel="icon" type="image/png" href="assets/favicon.png">
    <link rel="apple-touch-icon" href="assets/favicon.png">
    <meta property="og:type" content="website">
    <meta property="og:url" content="<?= htmlspecialchars($pageUrl) ?>">
    <meta property="og:title" content="<?= htmlspecialchars($pageTitle) ?>">
    <meta property="og:description" content="<?= htmlspecialchars($pageDescription) ?>">
    <meta property="og:image" content="<?= htmlspecialchars($ogImage) ?>">
    <meta property="og:image:alt" content="Agenda Sacramental — Ramo Santo Estêvão">
    <meta property="og:locale" content="pt_BR">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?= htmlspecialchars($pageTitle) ?>">
    <meta name="twitter:description" content="<?= htmlspecialchars($pageDescription) ?>">
    <meta name="twitter:image" content="<?= htmlspecialchars($ogImage) ?>">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="Agenda Sacramental">
    <link rel="manifest" href="manifest.json">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <link rel="stylesheet" href="<?= htmlspecialchars(assetUrl('css/style.css')) ?>">
    <link rel="stylesheet" href="<?= htmlspecialchars(assetUrl('css/consent.css')) ?>">
</head>
<body>
    <div id="authView" class="auth-screen">
        <div class="auth-screen-main">
            <div class="auth-card">
                <div class="auth-brand">
                    <img src="assets/sacramental-logo.png" alt="Agenda Sacramental">
                    <h1>Agenda Sacramental</h1>
                </div>

            <div id="alertAuth" class="alert alert-danger py-2 small hidden"></div>
            <div id="alertAuthOk" class="alert alert-success py-2 small hidden"></div>

            <form id="formLogin" class="auth-form">
                <div class="mb-3">
                    <label class="form-label" for="loginUser">Usuário ou e-mail</label>
                    <input class="form-control" id="loginUser" autocomplete="username" required>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="loginPass">Senha</label>
                    <input class="form-control" id="loginPass" type="password" autocomplete="current-password" required>
                </div>
                <button class="btn btn-navy w-100 mb-3" type="submit">Entrar</button>
                <div class="d-flex justify-content-between">
                    <a class="link-quiet" href="#" data-auth="forgot">Esqueci minha senha</a>
                    <a class="link-quiet" href="#" data-auth="register">Primeiro acesso</a>
                </div>
            </form>

            <form id="formRegister" class="auth-form hidden">
                <p class="small text-muted">Cadastre a unidade e o primeiro usuário. Uma unidade já existente não pode ser registrada novamente.</p>
                <div class="mb-2">
                    <label class="form-label" for="regName">Seu nome</label>
                    <input class="form-control" id="regName" required>
                </div>
                <div class="mb-2">
                    <label class="form-label" for="regUser">Usuário</label>
                    <input class="form-control" id="regUser" required>
                </div>
                <div class="mb-2">
                    <label class="form-label" for="regEmail">E-mail</label>
                    <input class="form-control" id="regEmail" type="email" required>
                </div>
                <div class="mb-2">
                    <label class="form-label" for="regPass">Senha</label>
                    <input class="form-control" id="regPass" type="password" minlength="8" required>
                </div>
                <div class="mb-2">
                    <label class="form-label" for="regUnitNumber">Número da unidade</label>
                    <input class="form-control" id="regUnitNumber" required placeholder="Ex.: 123456">
                    <div id="unitExistsHint" class="form-text text-danger hidden">Esta unidade já existe. Peça a um líder para adicionar o seu usuário.</div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="regUnitName">Nome da unidade</label>
                    <input class="form-control" id="regUnitName" required value="Ramo Santo Estêvão">
                </div>
                <button class="btn btn-navy w-100 mb-3" type="submit">Cadastrar unidade</button>
                <a class="link-quiet" href="#" data-auth="login">Já tenho acesso</a>
            </form>

            <form id="formForgot" class="auth-form hidden">
                <p class="small text-muted">Informe o e-mail da conta. Enviaremos um link para alterar a senha.</p>
                <div class="mb-3">
                    <label class="form-label" for="forgotEmail">E-mail</label>
                    <input class="form-control" id="forgotEmail" type="email" required>
                </div>
                <button class="btn btn-navy w-100 mb-3" type="submit">Enviar link</button>
                <a class="link-quiet" href="#" data-auth="login">Voltar ao login</a>
            </form>

            <form id="formReset" class="auth-form <?= $resetToken === '' ? 'hidden' : '' ?>">
                <p class="small text-muted">Defina uma nova senha para a sua conta.</p>
                <input type="hidden" id="resetToken" value="<?= htmlspecialchars($resetToken) ?>">
                <div class="mb-3">
                    <label class="form-label" for="resetPass">Nova senha</label>
                    <input class="form-control" id="resetPass" type="password" minlength="8" required>
                </div>
                <button class="btn btn-navy w-100 mb-3" type="submit">Salvar senha</button>
                <a class="link-quiet" href="#" data-auth="login">Voltar ao login</a>
            </form>
        </div>
        </div>
        <footer class="auth-footer">
            <p>Este NÃO é um aplicativo oficial de <br> A Igreja de Jesus Cristo dos Santos dos Últimos Dias</p>
            <p>© 2026 Alta Software. Todos os direitos reservados.</p>
        </footer>
    </div>

    <div id="appView" class="app-shell hidden">
        <header class="app-header">
            <button type="button" class="btn-header-logout" id="btnLogout">Sair</button>
            <p class="unit-name" id="hdrUnit">Unidade</p>
            <h1 id="hdrTitle">Reunião sacramental</h1>
            <p class="sub" id="hdrSub"></p>
        </header>

        <main>
            <section id="page-agenda" class="page active"></section>
            <section id="page-calendar" class="page"></section>
            <section id="page-history" class="page"></section>
            <section id="page-dashboard" class="page"></section>
            <section id="page-settings" class="page"></section>
        </main>

        <nav class="bottom-nav" aria-label="Navegação principal">
            <button data-page="agenda" class="active"><span class="icon"><i class="bi bi-journal-richtext"></i></span>Agenda</button>
            <button data-page="calendar"><span class="icon"><i class="bi bi-calendar3"></i></span>Calendário</button>
            <button data-page="history"><span class="icon"><i class="bi bi-clock-history"></i></span>Histórico</button>
            <button data-page="dashboard"><span class="icon"><i class="bi bi-bar-chart"></i></span>Painel</button>
            <button data-page="settings"><span class="icon"><i class="bi bi-gear"></i></span>Configurações</button>
        </nav>
    </div>

    <div id="printRoot" class="print-sheet"></div>
    <div id="toastWrap" class="toast-wrap"></div>
    <div id="appConfirm" class="confirm-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="appConfirmTitle" aria-hidden="true">
        <div class="confirm-dialog">
            <h2 id="appConfirmTitle">Confirmar?</h2>
            <p id="appConfirmMessage"></p>
            <div class="confirm-dialog-actions">
                <button type="button" id="appConfirmCancel" class="btn-confirm-cancel">Cancelar</button>
                <button type="button" id="appConfirmOk" class="btn-confirm-ok">Remover</button>
            </div>
        </div>
    </div>

    <div id="consentBanner" class="consent-banner hidden" role="dialog" aria-labelledby="consentTitle" aria-hidden="true">
        <div class="consent-banner-inner">
            <h2 id="consentTitle" class="consent-banner-title">Privacidade e estatísticas</h2>
            <p class="consent-banner-text">
                Com o seu consentimento, registramos data, hora, IP e localização estimada (cidade, região e país)
                para estatísticas de uso do aplicativo. Não exibimos nomes de pessoas no painel administrativo.
                Você pode recusar sem deixar de usar o app.
                Leia a <a href="privacidade.php">Política de Privacidade</a>.
            </p>
            <div class="consent-banner-actions">
                <button type="button" id="consentAccept" class="btn-consent-accept">Aceitar</button>
                <button type="button" id="consentDecline" class="btn-consent-decline">Recusar</button>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js"></script>
    <script src="<?= htmlspecialchars(assetUrl('js/consent.js')) ?>"></script>
    <script src="<?= htmlspecialchars(assetUrl('js/app.js')) ?>"></script>
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js?v=<?= htmlspecialchars(assetVersion('sw.js')) ?>').catch(function () {});
        }
    </script>
</body>
</html>
