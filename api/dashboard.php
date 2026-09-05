<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/hymns.php';

header('Content-Type: application/json; charset=utf-8');
appSessionStart();
$user = requireUser();
$pdo = getDb();
$unitId = (int) $user['unit_id'];

$stmt = $pdo->prepare(
    "SELECT * FROM meetings WHERE unit_id = :u AND meeting_type = 'sacramental' ORDER BY meeting_date ASC"
);
$stmt->execute([':u' => $unitId]);
$meetings = array_map('meetingRowToApi', $stmt->fetchAll());

$attendance = [];
$speakerCounts = [];
$prayerCounts = [];
$topicCounts = [];
$hymnCounts = [];
$hymnBySlot = ['opening_hymn' => [], 'sacrament_hymn' => [], 'special_hymn' => [], 'closing_hymn' => []];
$fastSundays = 0;
$withAttendance = 0;
$membersTotal = 0;
$visitorsTotal = 0;

foreach ($meetings as $m) {
    if ($m['is_fast_sunday']) {
        $fastSundays++;
    }
    if ($m['members_count'] !== null || $m['visitors_count'] !== null) {
        $withAttendance++;
        $membersTotal += (int) ($m['members_count'] ?? 0);
        $visitorsTotal += (int) ($m['visitors_count'] ?? 0);
        $attendance[] = [
            'date' => $m['meeting_date'],
            'label' => formatDatePt($m['meeting_date']),
            'members' => (int) ($m['members_count'] ?? 0),
            'visitors' => (int) ($m['visitors_count'] ?? 0),
            'total' => (int) ($m['members_count'] ?? 0) + (int) ($m['visitors_count'] ?? 0),
        ];
    }

    foreach ($m['speakers'] ?? [] as $speaker) {
        $name = trim((string) ($speaker['name'] ?? ''));
        $topic = trim((string) ($speaker['topic'] ?? ''));
        if ($name !== '') {
            $speakerCounts[$name] = ($speakerCounts[$name] ?? 0) + 1;
        }
        if ($topic !== '') {
            $key = mb_strtolower($topic);
            $topicCounts[$key] = [
                'topic' => $topic,
                'count' => ($topicCounts[$key]['count'] ?? 0) + 1,
            ];
        }
    }

    foreach (['opening_prayer', 'closing_prayer'] as $field) {
        $name = trim((string) ($m[$field] ?? ''));
        if ($name !== '') {
            $prayerCounts[$name] = ($prayerCounts[$name] ?? 0) + 1;
        }
    }

    foreach (['opening_hymn', 'sacrament_hymn', 'special_hymn', 'closing_hymn'] as $slot) {
        $h = $m[$slot] ?? null;
        if (!is_array($h) || empty($h['title'])) {
            continue;
        }
        $label = trim(($h['number'] ?? '') . ' — ' . $h['title']);
        $hymnCounts[$label] = ($hymnCounts[$label] ?? 0) + 1;
        $hymnBySlot[$slot][$label] = ($hymnBySlot[$slot][$label] ?? 0) + 1;
    }

    foreach ($m['program_items'] ?? [] as $item) {
        if (!is_array($item) || ($item['type'] ?? '') !== 'hymn') {
            continue;
        }
        $h = $item['hymn'] ?? null;
        if (!is_array($h) || empty($h['title'])) {
            continue;
        }
        $label = trim(($h['number'] ?? '') . ' — ' . $h['title']);
        // Avoid double-counting the first hymn already stored in special_hymn
        $special = $m['special_hymn'] ?? null;
        if (is_array($special) && ($special['id'] ?? '') !== '' && ($special['id'] ?? null) === ($h['id'] ?? null)) {
            continue;
        }
        if (is_array($special) && empty($special['id']) && ($special['title'] ?? '') === ($h['title'] ?? '')) {
            continue;
        }
        $hymnCounts[$label] = ($hymnCounts[$label] ?? 0) + 1;
        $hymnBySlot['special_hymn'][$label] = ($hymnBySlot['special_hymn'][$label] ?? 0) + 1;
    }
}

$sortDesc = static function (array $map, int $limit = 8): array {
    arsort($map);
    $out = [];
    foreach (array_slice($map, 0, $limit, true) as $label => $count) {
        $out[] = ['label' => $label, 'count' => $count];
    }
    return $out;
};

$topics = array_values($topicCounts);
usort($topics, static fn($a, $b) => $b['count'] <=> $a['count']);

$recent12 = array_slice($attendance, -12);
$avgMembers = $withAttendance ? round($membersTotal / $withAttendance, 1) : 0;
$avgVisitors = $withAttendance ? round($visitorsTotal / $withAttendance, 1) : 0;

$insights = [];
if ($attendance) {
    $last = $attendance[array_key_last($attendance)];
    $avgTotal = $avgMembers + $avgVisitors;
    if ($last['total'] > $avgTotal && $avgTotal > 0) {
        $insights[] = 'A última reunião ficou acima da média de frequência da unidade. Vale reconhecer o convite e o cuidado pastoral.';
    } elseif ($last['total'] < $avgTotal && $avgTotal > 0) {
        $insights[] = 'A última frequência ficou abaixo da média. Pode ser um bom momento para visitas e convites pessoais.';
    }
}
if ($speakerCounts) {
    $topSpeaker = array_key_first($sortDesc($speakerCounts, 1) ? array_column($sortDesc($speakerCounts, 1), 'label') : [null]);
    $top = $sortDesc($speakerCounts, 1);
    if ($top) {
        $insights[] = $top[0]['label'] . ' é quem mais discursou. Considere ampliar as oportunidades para outros irmãos e irmãs.';
    }
}
if ($hymnCounts) {
    $topH = $sortDesc($hymnCounts, 1);
    if ($topH) {
        $insights[] = 'Hino mais cantado: ' . $topH[0]['label'] . '. As sugestões automáticas evitam repetição em 6 semanas.';
    }
}
if ($fastSundays > 0) {
    $insights[] = $fastSundays . ' reunião(ões) de jejum e testemunhos no histórico.';
}
if (!$insights) {
    $insights[] = 'À medida que as agendas forem salvas, este painel mostrará frequência, temas, hinos e participação.';
}

jsonResponse([
    'summary' => [
        'meetings' => count($meetings),
        'fast_sundays' => $fastSundays,
        'avg_members' => $avgMembers,
        'avg_visitors' => $avgVisitors,
        'avg_total' => $avgMembers + $avgVisitors,
    ],
    'attendance' => $recent12,
    'speakers' => $sortDesc($speakerCounts),
    'prayers' => $sortDesc($prayerCounts),
    'topics' => array_slice($topics, 0, 10),
    'hymns' => $sortDesc($hymnCounts, 10),
    'hymns_by_slot' => [
        'opening' => $sortDesc($hymnBySlot['opening_hymn'], 5),
        'sacrament' => $sortDesc($hymnBySlot['sacrament_hymn'], 5),
        'special' => $sortDesc($hymnBySlot['special_hymn'], 5),
        'closing' => $sortDesc($hymnBySlot['closing_hymn'], 5),
    ],
    'insights' => $insights,
    'unit' => [
        'number' => $user['unit_number'],
        'name' => $user['unit_name'],
    ],
]);
