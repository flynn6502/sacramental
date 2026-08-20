<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/db.php';
require_once dirname(__DIR__) . '/includes/geo.php';
require_once dirname(__DIR__) . '/includes/hymns.php';
require_once dirname(__DIR__) . '/includes/site.php';

requireAdminPage();

$pdo = getDb();
$tz = appTimezone();
$nowBr = new DateTime('now', $tz);
$todayIso = todayIso();
$cutoff30 = (clone $nowBr)->modify('-30 days')->format('Y-m-d H:i:s');

$units = (int) $pdo->query('SELECT COUNT(*) FROM units')->fetchColumn();
$users = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
$meetings = (int) $pdo->query("SELECT COUNT(*) FROM meetings WHERE meeting_type = 'sacramental'")->fetchColumn();
$accesses = (int) $pdo->query('SELECT COUNT(*) FROM access_logs')->fetchColumn();

$stmtToday = $pdo->prepare('SELECT COUNT(*) FROM access_logs WHERE date(created_at) = :today');
$stmtToday->execute([':today' => $todayIso]);
$today = (int) $stmtToday->fetchColumn();

$stmtDaily = $pdo->prepare(
    "SELECT date(created_at) AS day, COUNT(*) AS count
     FROM access_logs
     WHERE created_at >= :cutoff
     GROUP BY date(created_at)
     ORDER BY day"
);
$stmtDaily->execute([':cutoff' => $cutoff30]);
$dailyRaw = $stmtDaily->fetchAll();

$stmtHourly = $pdo->prepare(
    "SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS count
     FROM access_logs
     WHERE created_at >= :cutoff
     GROUP BY hour ORDER BY hour"
);
$stmtHourly->execute([':cutoff' => $cutoff30]);
$hourlyRaw = $stmtHourly->fetchAll();

$locations = $pdo->query(
    "SELECT COALESCE(country, 'Desconhecido') AS country, COALESCE(city, '—') AS city, COUNT(*) AS count
     FROM access_logs
     GROUP BY country, city
     ORDER BY count DESC
     LIMIT 12"
)->fetchAll();

$unitRows = $pdo->query(
    "SELECT un.unit_number, un.unit_name,
            COUNT(DISTINCT u.id) AS users,
            COUNT(DISTINCT m.id) AS meetings
     FROM units un
     LEFT JOIN users u ON u.unit_id = un.id
     LEFT JOIN meetings m ON m.unit_id = un.id AND m.meeting_type = 'sacramental'
     GROUP BY un.id
     ORDER BY meetings DESC, un.unit_name"
)->fetchAll();

$recent = $pdo->query(
    "SELECT created_at, ip_address, city, region, country, unit_number, unit_name
     FROM access_logs
     ORDER BY created_at DESC
     LIMIT 80"
)->fetchAll();

$allMeetings = $pdo->query("SELECT * FROM meetings WHERE meeting_type = 'sacramental'")->fetchAll();
$hymnCounts = [];
$topicCounts = [];
$freqRows = [];
$membersSum = 0;
$visitorsSum = 0;
$freqN = 0;

foreach ($allMeetings as $row) {
    $m = meetingRowToApi($row);
    if ($m['members_count'] !== null || $m['visitors_count'] !== null) {
        $freqN++;
        $membersSum += (int) ($m['members_count'] ?? 0);
        $visitorsSum += (int) ($m['visitors_count'] ?? 0);
        $freqRows[] = [
            'date' => $m['meeting_date'],
            'total' => (int) ($m['members_count'] ?? 0) + (int) ($m['visitors_count'] ?? 0),
        ];
    }
    foreach (['opening_hymn', 'sacrament_hymn', 'special_hymn', 'closing_hymn'] as $slot) {
        $h = $m[$slot] ?? null;
        if (is_array($h) && !empty($h['title'])) {
            $label = trim(($h['number'] ?? '') . ' — ' . $h['title']);
            $hymnCounts[$label] = ($hymnCounts[$label] ?? 0) + 1;
        }
    }
    foreach ($m['speakers'] ?? [] as $speaker) {
        $topic = trim((string) ($speaker['topic'] ?? ''));
        if ($topic !== '') {
            $key = mb_strtolower($topic);
            $topicCounts[$key] = ['topic' => $topic, 'count' => ($topicCounts[$key]['count'] ?? 0) + 1];
        }
    }
}

arsort($hymnCounts);
$topHymns = array_slice($hymnCounts, 0, 10, true);
$topics = array_values($topicCounts);
usort($topics, static fn($a, $b) => $b['count'] <=> $a['count']);
$topics = array_slice($topics, 0, 10);

function fillDaily(array $raw, int $days): array
{
    $map = [];
    foreach ($raw as $row) {
        $map[$row['day']] = (int) $row['count'];
    }
    $labels = [];
    $values = [];
    $tz = appTimezone();
    $cursor = new DateTime('now', $tz);
    $cursor->modify('-' . ($days - 1) . ' days');
    $cursor->setTime(0, 0, 0);
    for ($i = 0; $i < $days; $i++) {
        $day = $cursor->format('Y-m-d');
        $labels[] = formatDatePt($day);
        $values[] = $map[$day] ?? 0;
        $cursor->modify('+1 day');
    }
    return ['labels' => $labels, 'values' => $values];
}

function fillHourly(array $raw): array
{
    $map = array_fill(0, 24, 0);
    foreach ($raw as $row) {
        $map[(int) $row['hour']] = (int) $row['count'];
    }
    return [
        'labels' => array_map(static fn($h) => sprintf('%02dh', $h), range(0, 23)),
        'values' => array_values($map),
    ];
}

$chartData = [
    'daily' => fillDaily($dailyRaw, 30),
    'hourly' => fillHourly($hourlyRaw),
    'hymns' => [
        'labels' => array_keys($topHymns),
        'values' => array_values($topHymns),
    ],
    'topics' => [
        'labels' => array_column($topics, 'topic'),
        'values' => array_map('intval', array_column($topics, 'count')),
    ],
];
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
<body>
    <nav class="admin-navbar">
        <div class="container-fluid px-3 px-md-4 d-flex justify-content-between align-items-center">
            <a class="brand" href="index.php">Agenda Sacramental — Admin</a>
            <div class="d-flex gap-3">
                <a href="../index.php" target="_blank">Ver app</a>
                <a href="logout.php">Sair</a>
            </div>
        </div>
    </nav>

    <main class="dashboard-main">
        <div class="container-fluid px-3 px-md-4">
            <div class="row g-3 mb-4">
                <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-label">Acessos</div><div class="stat-value"><?= number_format($accesses, 0, ',', '.') ?></div></div></div>
                <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-label">Hoje</div><div class="stat-value"><?= number_format($today, 0, ',', '.') ?></div></div></div>
                <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-label">Unidades</div><div class="stat-value"><?= number_format($units, 0, ',', '.') ?></div></div></div>
                <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-label">Reuniões criadas</div><div class="stat-value"><?= number_format($meetings, 0, ',', '.') ?></div></div></div>
            </div>
            <p class="text-muted small">Contas de usuário: <?= (int) $users ?>. Média de frequência (quando informada): <?= $freqN ? round(($membersSum + $visitorsSum) / $freqN, 1) : '—' ?> pessoas. Este painel não exibe nomes de pessoas.</p>

            <div class="row g-3 mb-4">
                <div class="col-lg-8">
                    <div class="chart-card">
                        <h2>Acessos — últimos 30 dias</h2>
                        <div class="chart-wrap"><canvas id="dailyChart"></canvas></div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="chart-card">
                        <h2>Por horário (Brasília)</h2>
                        <div class="chart-wrap"><canvas id="hourlyChart"></canvas></div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mb-4">
                <div class="col-lg-6">
                    <div class="chart-card">
                        <h2>Hinos mais cantados</h2>
                        <div class="chart-wrap"><canvas id="hymnChart"></canvas></div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="chart-card">
                        <h2>Temas mais abordados</h2>
                        <div class="chart-wrap"><canvas id="topicChart"></canvas></div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mb-4">
                <div class="col-lg-6">
                    <div class="table-card">
                        <h2>Unidades</h2>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead><tr><th>Nº</th><th>Nome</th><th>Usuários</th><th>Reuniões</th></tr></thead>
                                <tbody>
                                <?php foreach ($unitRows as $u): ?>
                                    <tr>
                                        <td><?= htmlspecialchars($u['unit_number']) ?></td>
                                        <td><?= htmlspecialchars($u['unit_name']) ?></td>
                                        <td><?= (int) $u['users'] ?></td>
                                        <td><?= (int) $u['meetings'] ?></td>
                                    </tr>
                                <?php endforeach; ?>
                                <?php if (!$unitRows): ?><tr><td colspan="4">Nenhuma unidade ainda.</td></tr><?php endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="table-card">
                        <h2>Localização dos acessos</h2>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead><tr><th>Cidade</th><th>País</th><th>Acessos</th></tr></thead>
                                <tbody>
                                <?php foreach ($locations as $l): ?>
                                    <tr>
                                        <td><?= htmlspecialchars($l['city']) ?></td>
                                        <td><?= htmlspecialchars($l['country']) ?></td>
                                        <td><?= (int) $l['count'] ?></td>
                                    </tr>
                                <?php endforeach; ?>
                                <?php if (!$locations): ?><tr><td colspan="3">Sem acessos consentidos ainda.</td></tr><?php endif; ?>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="table-card">
                <h2>Acessos recentes (sem nomes de pessoas)</h2>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Data e hora</th>
                                <th>IP</th>
                                <th>Local</th>
                                <th>Unidade</th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($recent as $r): ?>
                            <tr>
                                <td><?= htmlspecialchars(formatDateTimePt($r['created_at'])) ?></td>
                                <td><?= htmlspecialchars($r['ip_address'] ?? '') ?></td>
                                <td><?= htmlspecialchars(formatLocation($r['city'], $r['region'], $r['country'])) ?></td>
                                <td><?= htmlspecialchars(trim(($r['unit_number'] ?? '') . ' · ' . ($r['unit_name'] ?? ''), ' ·')) ?></td>
                            </tr>
                        <?php endforeach; ?>
                        <?php if (!$recent): ?><tr><td colspan="4">Nenhum acesso registrado.</td></tr><?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </main>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script>window.ADMIN_CHARTS = <?= json_encode($chartData, JSON_UNESCAPED_UNICODE) ?>;</script>
    <script src="js/admin.js"></script>
</body>
</html>
