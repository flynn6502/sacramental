<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/site.php';

$baseUrl = getSiteBaseUrl();
$pageTitle = 'Política de Privacidade — Agenda Sacramental';
$lastUpdated = formatDatePt('2026-08-19');
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($pageTitle) ?></title>
    <meta name="robots" content="noindex">
    <link rel="icon" type="image/png" href="assets/favicon.png">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/privacy.css">
</head>
<body class="privacy-page">
    <div class="privacy-container">
        <header class="privacy-header">
            <a href="index.php" class="privacy-back">&larr; Voltar ao app</a>
            <h1>Política de Privacidade</h1>
            <p class="privacy-updated">Última atualização: <?= htmlspecialchars($lastUpdated) ?></p>
        </header>

        <main class="privacy-content">
            <section>
                <h2>1. Quem somos</h2>
                <p>
                    A <strong>Agenda Sacramental</strong> é um aplicativo web para preparação da agenda da
                    reunião sacramental, operado por <strong>Trajano Lima / Alta Software</strong>, disponível
                    para unidades que preparam a reunião sacramental.
                </p>
                <p>
                    Para questões sobre privacidade, escreva para
                    <a href="mailto:suporte@altasoftware.com.br">suporte@altasoftware.com.br</a>.
                </p>
            </section>

            <section>
                <h2>2. Resumo</h2>
                <ul>
                    <li>Contas de usuário guardam nome, usuário, e-mail, senha (somente em hash) e dados da unidade.</li>
                    <li>Agendas da reunião ficam isoladas por unidade: cada usuário vê apenas os registros da sua unidade.</li>
                    <li>Com <strong>consentimento</strong>, registramos IP, data, hora e localização estimada para estatísticas administrativas.</li>
                    <li>O painel admin <strong>não exibe nomes de pessoas</strong> (discursantes, orações etc.).</li>
                    <li><strong>Não vendemos</strong> dados e <strong>não fazemos marketing</strong>.</li>
                </ul>
            </section>

            <section>
                <h2>3. Dados que tratamos</h2>
                <table class="privacy-table">
                    <thead>
                        <tr><th>Dado</th><th>Origem</th><th>Obrigatório?</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Nome, usuário, e-mail e senha (hash)</td><td>Cadastro</td><td>Sim, para autenticar</td></tr>
                        <tr><td>Número e nome da unidade</td><td>Cadastro</td><td>Sim, para isolar os dados</td></tr>
                        <tr><td>Agendas, frequências, hinos e temas</td><td>Uso do app</td><td>Sim, finalidade do serviço</td></tr>
                        <tr><td>Endereço IP e localização estimada</td><td>Servidor + ip-api.com</td><td>Somente com consentimento</td></tr>
                        <tr><td>Data e hora do acesso</td><td>Servidor</td><td>Com consentimento</td></tr>
                        <tr><td>Navegador (User-Agent)</td><td>Cabeçalho HTTP</td><td>Parcial, diagnóstico</td></tr>
                    </tbody>
                </table>
                <p>Se você recusar o consentimento, o app continua funcionando. Apenas as estatísticas de acesso deixam de ser registradas.</p>
            </section>

            <section>
                <h2>4. Finalidade</h2>
                <ul>
                    <li>Permitir que líderes preparem e arquivem a agenda sacramental da unidade;</li>
                    <li>Oferecer painel interno da unidade (frequência, temas, hinos, participação);</li>
                    <li>Com consentimento, medir o uso agregado do aplicativo (unidades, regiões, volume de reuniões).</li>
                </ul>
            </section>

            <section>
                <h2>5. Base legal (LGPD)</h2>
                <p>
                    O cadastro e as agendas fundamentam-se na <strong>execução de contrato / prestação do serviço</strong>
                    solicitado por você (Art. 7º, V, Lei nº 13.709/2018).
                </p>
                <p>
                    IP e geolocalização fundamentam-se no <strong>consentimento</strong> (Art. 7º, I), pedido no banner
                    da primeira visita de cada dia.
                </p>
            </section>

            <section>
                <h2>6. Isolamento por unidade e identificação</h2>
                <p>
                    Usuários de uma unidade não acessam agendas de outras unidades. Um novo cadastro público
                    não pode reivindicar uma unidade já existente; apenas um usuário da própria unidade pode
                    adicionar novos acessos.
                </p>
                <p>
                    Nomes de irmãos e irmãs nas agendas existem para o uso pastoral da unidade.
                    No painel administrativo global esses nomes <strong>não são exibidos</strong>.
                </p>
            </section>

            <section>
                <h2>7. Compartilhamento</h2>
                <p>
                    O IP pode ser enviado a <strong>ip-api.com</strong> apenas para estimar cidade, região e país,
                    após o consentimento. Política:
                    <a href="https://ip-api.com/docs/legal" target="_blank" rel="noopener noreferrer">ip-api.com/docs/legal</a>.
                </p>
                <p>Não vendemos, alugamos nem cedemos dados a anunciantes.</p>
            </section>

            <section>
                <h2>8. Armazenamento</h2>
                <p>
                    Os dados ficam em SQLite no servidor, com senhas em hash. A preferência de consentimento
                    fica no <strong>localStorage</strong> do navegador, válida por dia, e não é enviada ao servidor.
                </p>
            </section>

            <section>
                <h2>9. Cookies e similares</h2>
                <ul>
                    <li><strong>localStorage</strong> — consentimento LGPD;</li>
                    <li><strong>sacramental_sid</strong> — sessão autenticada do app;</li>
                    <li><strong>PHPSESSID / sessão admin</strong> — área /admin/;</li>
                    <li><strong>Service Worker</strong> — apoio PWA, sem dados pessoais extras.</li>
                </ul>
            </section>

            <section>
                <h2>10. Seus direitos</h2>
                <p>Nos termos dos Arts. 17 a 22 da LGPD, você pode solicitar acesso, correção, eliminação, revogação do consentimento e informação sobre compartilhamento.</p>
                <p>Canal: <a href="mailto:suporte@altasoftware.com.br">suporte@altasoftware.com.br</a>.</p>
            </section>

            <section>
                <h2>11. Segurança</h2>
                <p>
                    Usamos hash de senha, sessão HTTP-only, CSRF nas ações autenticadas, isolamento por unidade
                    e restrição de acesso ao banco (.htaccess). Nenhum sistema é 100% seguro.
                </p>
            </section>

            <section>
                <h2>12. Transferência internacional</h2>
                <p>
                    A geolocalização (ip-api.com) pode processar o IP fora do Brasil, somente após consentimento
                    e apenas para obter a localização estimada.
                </p>
            </section>

            <section>
                <h2>13. Alterações</h2>
                <p>Esta política pode ser atualizada. A data da revisão consta no topo. Mudanças relevantes podem reexibir o banner.</p>
            </section>

            <section>
                <h2>14. Auditoria LGPD</h2>
                <ul>
                    <li>Consentimento prévio para IP/localização</li>
                    <li>Recusa sem bloqueio do app</li>
                    <li>Renovação diária do consentimento</li>
                    <li>Política acessível</li>
                    <li>Senhas com hash; bancos no servidor</li>
                    <li>Minimização no admin (sem nomes de pessoas)</li>
                    <li>Canal para direitos do titular</li>
                </ul>
            </section>
        </main>

        <footer class="privacy-footer">
            <a href="index.php">← Voltar à Agenda Sacramental</a>
        </footer>
    </div>
</body>
</html>
