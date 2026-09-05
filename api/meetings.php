<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/auth.php';
require_once dirname(__DIR__) . '/includes/hymns.php';

header('Content-Type: application/json; charset=utf-8');
appSessionStart();

$action = $_GET['action'] ?? '';
$user = requireUser();
$pdo = getDb();
$unitId = (int) $user['unit_id'];

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD', 'OPTIONS'], true)) {
    requireCsrf();
}

switch ($action) {
    case 'current':
        handleCurrent($pdo, $user, $unitId);
        break;
    case 'get':
        handleGet($pdo, $user, $unitId);
        break;
    case 'save':
        handleSave($pdo, $user, $unitId);
        break;
    case 'history':
        handleHistory($pdo, $unitId);
        break;
    case 'calendar':
        handleCalendar($pdo, $unitId);
        break;
    case 'mark_special':
        handleMarkSpecial($pdo, $user, $unitId);
        break;
    case 'suggest_hymns':
        handleSuggest($pdo, $unitId);
        break;
    case 'delete':
        handleDelete($pdo, $unitId);
        break;
    default:
        jsonResponse(['error' => 'Ação inválida.'], 400);
}

function defaultMeetingPayload(array $user, array $prefs, string $date): array
{
    $auto = static function (array $names): string {
        return count($names) === 1 ? (string) $names[0] : '';
    };

    return [
        'id' => null,
        'meeting_date' => $date,
        'meeting_type' => 'sacramental',
        'special_note' => '',
        'members_count' => null,
        'visitors_count' => null,
        'presides' => $auto($prefs['preside_names']),
        'conducts' => $auto($prefs['conduct_names']),
        'chorister' => $auto($prefs['chorister_names']),
        'pianist' => $auto($prefs['pianist_names']),
        'opening_hymn' => null,
        'sacrament_hymn' => null,
        'special_hymn' => null,
        'closing_hymn' => null,
        'opening_prayer' => '',
        'closing_prayer' => '',
        'announcements' => '',
        'ward_business' => emptyWardBusiness(),
        'visiting_leaders' => [],
        'speakers' => [],
        'program_items' => [],
        'is_fast_sunday' => false,
        'musical_number' => ['who' => '', 'piece' => ''],
        'notes' => '',
        'unit_number' => $user['unit_number'],
        'unit_name' => $user['unit_name'],
        'is_new' => true,
    ];
}

function findMeeting(PDO $pdo, int $unitId, string $date): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM meetings WHERE unit_id = :u AND meeting_date = :d');
    $stmt->execute([':u' => $unitId, ':d' => $date]);
    $row = $stmt->fetch();
    return $row ? meetingRowToApi($row) : null;
}

function handleCurrent(PDO $pdo, array $user, int $unitId): void
{
    $date = nextOrCurrentSunday();
    $prefs = getUserPreferences($pdo, (int) $user['id']);
    $existing = findMeeting($pdo, $unitId, $date);

    if ($existing) {
        $existing['unit_number'] = $user['unit_number'];
        $existing['unit_name'] = $user['unit_name'];
        $existing['is_new'] = false;
        $existing['formatted_date'] = formatDatePt($date);
        $existing['is_today_sunday'] = isSunday();
        jsonResponse(['meeting' => $existing, 'preferences' => $prefs]);
    }

    $meeting = defaultMeetingPayload($user, $prefs, $date);
    $suggestions = suggestHymnsForMeeting($pdo, $unitId, $date);
    $meeting = array_merge($meeting, $suggestions);
    $meeting['formatted_date'] = formatDatePt($date);
    $meeting['is_today_sunday'] = isSunday();
    jsonResponse(['meeting' => $meeting, 'preferences' => $prefs]);
}

function handleGet(PDO $pdo, array $user, int $unitId): void
{
    $id = (int) ($_GET['id'] ?? 0);
    $date = trim((string) ($_GET['date'] ?? ''));
    $prefs = getUserPreferences($pdo, (int) $user['id']);

    if ($id > 0) {
        $stmt = $pdo->prepare('SELECT * FROM meetings WHERE id = :id AND unit_id = :u');
        $stmt->execute([':id' => $id, ':u' => $unitId]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonResponse(['meeting' => null, 'preferences' => $prefs]);
        }
        $meeting = meetingRowToApi($row);
        $meeting['formatted_date'] = formatDatePt($meeting['meeting_date']);
        $meeting['is_new'] = false;
        $meeting['unit_number'] = $user['unit_number'];
        $meeting['unit_name'] = $user['unit_name'];
        jsonResponse(['meeting' => $meeting, 'preferences' => $prefs]);
    }

    if ($date !== '') {
        $row = findMeeting($pdo, $unitId, $date);
        if ($row) {
            $row['formatted_date'] = formatDatePt($row['meeting_date']);
            $row['is_new'] = false;
            $row['unit_number'] = $user['unit_number'];
            $row['unit_name'] = $user['unit_name'];
            jsonResponse(['meeting' => $row, 'preferences' => $prefs]);
        }

        $meeting = defaultMeetingPayload($user, $prefs, $date);
        $meeting = array_merge($meeting, suggestHymnsForMeeting($pdo, $unitId, $date));
        $meeting['formatted_date'] = formatDatePt($date);
        $meeting['is_today_sunday'] = ($date === todayIso());
        jsonResponse(['meeting' => $meeting, 'preferences' => $prefs]);
    }

    jsonResponse(['error' => 'Informe a data ou o id.'], 400);
}

function handleSuggest(PDO $pdo, int $unitId): void
{
    $date = trim((string) ($_GET['date'] ?? nextOrCurrentSunday()));
    jsonResponse(['suggestions' => suggestHymnsForMeeting($pdo, $unitId, $date)]);
}

function handleHistory(PDO $pdo, int $unitId): void
{
    $stmt = $pdo->prepare(
        'SELECT id, meeting_date, meeting_type, special_note, members_count, visitors_count, is_fast_sunday, opening_hymn, sacrament_hymn, closing_hymn
         FROM meetings
         WHERE unit_id = :u
         ORDER BY meeting_date DESC'
    );
    $stmt->execute([':u' => $unitId]);
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $row['id'] = (int) $row['id'];
        $row['formatted_date'] = formatDatePt($row['meeting_date']);
        $row['opening_hymn'] = decodeJsonField($row['opening_hymn'], null);
        $row['sacrament_hymn'] = decodeJsonField($row['sacrament_hymn'], null);
        $row['closing_hymn'] = decodeJsonField($row['closing_hymn'], null);
        $rows[] = $row;
    }
    jsonResponse(['meetings' => $rows, 'today' => todayIso()]);
}

function handleCalendar(PDO $pdo, int $unitId): void
{
    $year = (int) ($_GET['year'] ?? (int) (new DateTime('now', appTimezone()))->format('Y'));
    $month = (int) ($_GET['month'] ?? (int) (new DateTime('now', appTimezone()))->format('n'));
    $start = sprintf('%04d-%02d-01', $year, $month);
    $end = (new DateTime($start, appTimezone()))->format('Y-m-t');

    $stmt = $pdo->prepare(
        'SELECT meeting_date, meeting_type, special_note
         FROM meetings
         WHERE unit_id = :u AND meeting_date BETWEEN :s AND :e'
    );
    $stmt->execute([':u' => $unitId, ':s' => $start, ':e' => $end]);
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[$row['meeting_date']] = $row;
    }

    $sundays = [];
    $focus = nextOrCurrentSunday();
    $today = todayIso();
    $cursor = new DateTime($start, appTimezone());
    $last = new DateTime($end, appTimezone());
    while ($cursor <= $last) {
        if ((int) $cursor->format('w') === 0) {
            $iso = $cursor->format('Y-m-d');
            $kind = 'future';
            if ($iso < $today) {
                $kind = 'past';
            } elseif ($iso === $focus) {
                $kind = 'focus';
            }
            $sundays[] = [
                'date' => $iso,
                'day' => (int) $cursor->format('j'),
                'kind' => $kind,
                'meeting' => $map[$iso] ?? null,
            ];
        }
        $cursor->modify('+1 day');
    }

    jsonResponse([
        'year' => $year,
        'month' => $month,
        'sundays' => $sundays,
        'focus' => $focus,
        'today' => $today,
    ]);
}

function handleMarkSpecial(PDO $pdo, array $user, int $unitId): void
{
    $data = readJsonBody();
    $date = trim((string) ($data['meeting_date'] ?? ''));
    $type = (string) ($data['meeting_type'] ?? 'special');
    $note = trim((string) ($data['special_note'] ?? ''));

    $allowed = ['general_conference', 'stake_conference', 'special', 'sacramental'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !in_array($type, $allowed, true)) {
        jsonResponse(['error' => 'Dados inválidos.'], 400);
    }

    $existing = findMeeting($pdo, $unitId, $date);
    $now = appNow();

    if ($type === 'sacramental' && $existing && $existing['meeting_type'] !== 'sacramental') {
        $pdo->prepare('DELETE FROM meetings WHERE id = :id AND unit_id = :u')
            ->execute([':id' => $existing['id'], ':u' => $unitId]);
        jsonResponse(['success' => true, 'cleared' => true]);
    }

    if ($existing) {
        $pdo->prepare(
            'UPDATE meetings SET meeting_type = :t, special_note = :n, updated_by = :ub, updated_at = :u WHERE id = :id AND unit_id = :uid'
        )->execute([
            ':t' => $type,
            ':n' => $note,
            ':ub' => $user['id'],
            ':u' => $now,
            ':id' => $existing['id'],
            ':uid' => $unitId,
        ]);
        jsonResponse(['success' => true, 'id' => $existing['id']]);
    }

    $pdo->prepare(
        'INSERT INTO meetings (unit_id, meeting_date, meeting_type, special_note, is_fast_sunday, created_by, updated_by, created_at, updated_at)
         VALUES (:uid, :d, :t, :n, :fast, :cb, :ub, :c, :u)'
    )->execute([
        ':uid' => $unitId,
        ':d' => $date,
        ':t' => $type,
        ':n' => $note,
        ':fast' => isFastSunday($date) ? 1 : 0,
        ':cb' => $user['id'],
        ':ub' => $user['id'],
        ':c' => $now,
        ':u' => $now,
    ]);

    jsonResponse(['success' => true, 'id' => (int) $pdo->lastInsertId()]);
}

function handleDelete(PDO $pdo, int $unitId): void
{
    $data = readJsonBody();
    $id = (int) ($data['id'] ?? 0);
    if ($id <= 0) {
        jsonResponse(['error' => 'Reunião inválida.'], 400);
    }

    $stmt = $pdo->prepare('DELETE FROM meetings WHERE id = :id AND unit_id = :u');
    $stmt->execute([':id' => $id, ':u' => $unitId]);
    if ($stmt->rowCount() < 1) {
        jsonResponse(['error' => 'Reunião não encontrada.'], 404);
    }

    jsonResponse(['success' => true]);
}

function handleSave(PDO $pdo, array $user, int $unitId): void
{
    $data = readJsonBody();
    $date = trim((string) ($data['meeting_date'] ?? ''));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        jsonResponse(['error' => 'Data inválida.'], 400);
    }

    $hymn = static function ($value): string {
        if (!$value) {
            return encodeJsonField(null);
        }
        return encodeJsonField($value);
    };

    $programItems = sanitizeProgramItems($data['program_items'] ?? []);
    $legacy = syncLegacyFieldsFromProgram($programItems);

    $fields = [
        'meeting_type' => (string) ($data['meeting_type'] ?? 'sacramental'),
        'special_note' => trim((string) ($data['special_note'] ?? '')),
        'members_count' => $data['members_count'] === '' || $data['members_count'] === null ? null : (int) $data['members_count'],
        'visitors_count' => $data['visitors_count'] === '' || $data['visitors_count'] === null ? null : (int) $data['visitors_count'],
        'presides' => trim((string) ($data['presides'] ?? '')),
        'conducts' => trim((string) ($data['conducts'] ?? '')),
        'chorister' => trim((string) ($data['chorister'] ?? '')),
        'pianist' => trim((string) ($data['pianist'] ?? '')),
        'opening_hymn' => $hymn($data['opening_hymn'] ?? null),
        'sacrament_hymn' => $hymn($data['sacrament_hymn'] ?? null),
        'special_hymn' => $hymn($legacy['special_hymn']),
        'closing_hymn' => $hymn($data['closing_hymn'] ?? null),
        'opening_prayer' => trim((string) ($data['opening_prayer'] ?? '')),
        'closing_prayer' => trim((string) ($data['closing_prayer'] ?? '')),
        'announcements' => trim((string) ($data['announcements'] ?? '')),
        'ward_business' => encodeJsonField($data['ward_business'] ?? emptyWardBusiness()),
        'visiting_leaders' => encodeJsonField(sanitizeVisitingLeaders($data['visiting_leaders'] ?? [])),
        'speakers' => encodeJsonField($legacy['speakers']),
        'program_items' => encodeJsonField($programItems),
        'is_fast_sunday' => !empty($data['is_fast_sunday']) ? 1 : 0,
        'musical_number' => encodeJsonField($legacy['musical_number']),
        'notes' => trim((string) ($data['notes'] ?? '')),
        'updated_by' => (int) $user['id'],
        'updated_at' => appNow(),
    ];

    $existing = findMeeting($pdo, $unitId, $date);

    if ($existing) {
        $sets = [];
        $params = [':id' => $existing['id'], ':uid' => $unitId];
        foreach ($fields as $col => $val) {
            $sets[] = "$col = :$col";
            $params[":$col"] = $val;
        }
        $pdo->prepare('UPDATE meetings SET ' . implode(', ', $sets) . ' WHERE id = :id AND unit_id = :uid')
            ->execute($params);
        $id = $existing['id'];
    } else {
        $cols = array_keys($fields);
        $sql = 'INSERT INTO meetings (unit_id, meeting_date, created_by, created_at, ' . implode(', ', $cols) . ')
                VALUES (:unit_id, :meeting_date, :created_by, :created_at, ' . implode(', ', array_map(fn($c) => ":$c", $cols)) . ')';
        $params = $fields;
        $params['unit_id'] = $unitId;
        $params['meeting_date'] = $date;
        $params['created_by'] = (int) $user['id'];
        $params['created_at'] = appNow();
        $named = [];
        foreach ($params as $k => $v) {
            $named[':' . $k] = $v;
        }
        $pdo->prepare($sql)->execute($named);
        $id = (int) $pdo->lastInsertId();
    }

    $stmt = $pdo->prepare('SELECT * FROM meetings WHERE id = :id AND unit_id = :u');
    $stmt->execute([':id' => $id, ':u' => $unitId]);
    $saved = meetingRowToApi($stmt->fetch());
    $saved['formatted_date'] = formatDatePt($saved['meeting_date']);
    jsonResponse(['success' => true, 'meeting' => $saved]);
}
