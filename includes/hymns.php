<?php

declare(strict_types=1);

function loadHymnCatalog(): array
{
    static $catalog = null;
    if (is_array($catalog)) {
        return $catalog;
    }

    $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'hymns.json';
    if (!is_readable($path)) {
        $catalog = [];
        return $catalog;
    }

    $raw = json_decode((string) file_get_contents($path), true);
    $catalog = is_array($raw['hymns'] ?? null) ? $raw['hymns'] : [];
    return $catalog;
}

function findHymnById(string $id): ?array
{
    foreach (loadHymnCatalog() as $hymn) {
        if (($hymn['id'] ?? '') === $id) {
            return $hymn;
        }
    }
    return null;
}

function searchHymns(string $query, int $limit = 40): array
{
    $q = mb_strtolower(trim($query));
    $all = loadHymnCatalog();

    if ($q === '') {
        return array_slice($all, 0, $limit);
    }

    $scored = [];
    foreach ($all as $hymn) {
        $hay = mb_strtolower(($hymn['number'] ?? '') . ' ' . ($hymn['title'] ?? '') . ' ' . ($hymn['hymnal_name'] ?? ''));
        $pos = mb_strpos($hay, $q);
        if ($pos === false) {
            continue;
        }
        $scored[] = ['score' => $pos, 'hymn' => $hymn];
    }

    usort($scored, static fn($a, $b) => $a['score'] <=> $b['score']);
    return array_column(array_slice($scored, 0, $limit), 'hymn');
}

function extractMeetingHymnIds(array $meeting): array
{
    $ids = [];
    foreach (['opening_hymn', 'sacrament_hymn', 'special_hymn', 'closing_hymn'] as $field) {
        $raw = $meeting[$field] ?? null;
        if (!$raw) {
            continue;
        }
        $data = is_array($raw) ? $raw : json_decode((string) $raw, true);
        if (is_array($data) && !empty($data['id'])) {
            $ids[] = (string) $data['id'];
        }
    }
    $program = $meeting['program_items'] ?? null;
    if (!is_array($program)) {
        $program = decodeJsonField($program, []);
    }
    foreach ($program as $item) {
        if (!is_array($item) || ($item['type'] ?? '') !== 'hymn') {
            continue;
        }
        $hymn = $item['hymn'] ?? null;
        if (is_array($hymn) && !empty($hymn['id'])) {
            $ids[] = (string) $hymn['id'];
        }
    }
    return $ids;
}

function suggestHymnsForMeeting(PDO $pdo, int $unitId, string $meetingDate, array $existing = []): array
{
    $recent = [];
    $stmt = $pdo->prepare(
        "SELECT opening_hymn, sacrament_hymn, special_hymn, closing_hymn, program_items
         FROM meetings
         WHERE unit_id = :unit_id
           AND meeting_type = 'sacramental'
           AND meeting_date >= date(:date, '-42 days')
           AND meeting_date < :date"
    );
    $stmt->execute([':unit_id' => $unitId, ':date' => $meetingDate]);
    foreach ($stmt->fetchAll() as $row) {
        $recent = array_merge($recent, extractMeetingHymnIds($row));
    }
    $recent = array_unique($recent);

    $usedInThis = [];
    $pick = static function (string $role, array $preferTempo) use (&$recent, &$usedInThis, $existing): array {
        if (!empty($existing[$role]['id'])) {
            $usedInThis[] = $existing[$role]['id'];
            return $existing[$role];
        }

        $pool = [];
        foreach (loadHymnCatalog() as $hymn) {
            $roles = $hymn['roles'] ?? [];
            if (!in_array($role, $roles, true)) {
                continue;
            }
            if (in_array($hymn['id'], $recent, true) || in_array($hymn['id'], $usedInThis, true)) {
                continue;
            }
            $score = 0;
            if (in_array($hymn['tempo'] ?? '', $preferTempo, true)) {
                $score += 8;
            }
            if (($hymn['hymnal'] ?? '') === 'novo') {
                $score += 1;
            }
            $pool[] = ['score' => $score, 'hymn' => $hymn];
        }

        if ($pool === []) {
            foreach (loadHymnCatalog() as $hymn) {
                if (in_array($role, $hymn['roles'] ?? [], true) && !in_array($hymn['id'], $usedInThis, true)) {
                    $pool[] = ['score' => 0, 'hymn' => $hymn];
                }
            }
        }

        usort($pool, static function ($a, $b) {
            if ($a['score'] === $b['score']) {
                return strcmp($a['hymn']['number'], $b['hymn']['number']);
            }
            return $b['score'] <=> $a['score'];
        });

        if ($pool === []) {
            return [
                'id' => '',
                'number' => '',
                'title' => '',
                'hymnal' => '',
                'hymnal_name' => '',
                'suggested' => true,
            ];
        }

        $top = array_slice($pool, 0, 12);
        $chosen = $top[array_rand($top)]['hymn'];
        $usedInThis[] = $chosen['id'];
        $recent[] = $chosen['id'];

        return [
            'id' => $chosen['id'],
            'number' => $chosen['number'],
            'title' => $chosen['title'],
            'hymnal' => $chosen['hymnal'],
            'hymnal_name' => $chosen['hymnal_name'],
            'suggested' => true,
        ];
    };

    return [
        'opening_hymn' => $pick('opening', ['animated']),
        'sacrament_hymn' => $pick('sacrament', ['reflective']),
        'closing_hymn' => $pick('closing', ['reflective']),
    ];
}
