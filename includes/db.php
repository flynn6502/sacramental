<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'site.php';

function getDbPath(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'sacramental.db';
}

function getDb(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dbPath = getDbPath();
    $dataDir = dirname($dbPath);

    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');

    initializeDatabase($pdo);

    return $pdo;
}

function initializeDatabase(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unit_number TEXT NOT NULL UNIQUE,
            unit_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unit_id INTEGER NOT NULL,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER PRIMARY KEY,
            preside_names TEXT NOT NULL DEFAULT "[]",
            conduct_names TEXT NOT NULL DEFAULT "[]",
            chorister_names TEXT NOT NULL DEFAULT "[]",
            pianist_names TEXT NOT NULL DEFAULT "[]",
            meeting_time TEXT NOT NULL DEFAULT "09:00",
            week_starts_on TEXT NOT NULL DEFAULT "monday",
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unit_id INTEGER NOT NULL,
            meeting_date TEXT NOT NULL,
            meeting_type TEXT NOT NULL DEFAULT "sacramental",
            special_note TEXT,
            members_count INTEGER,
            visitors_count INTEGER,
            presides TEXT,
            conducts TEXT,
            chorister TEXT,
            pianist TEXT,
            opening_hymn TEXT,
            sacrament_hymn TEXT,
            special_hymn TEXT,
            closing_hymn TEXT,
            opening_prayer TEXT,
            closing_prayer TEXT,
            announcements TEXT,
            ward_business TEXT,
            speakers TEXT,
            is_fast_sunday INTEGER NOT NULL DEFAULT 0,
            musical_number TEXT,
            notes TEXT,
            created_by INTEGER,
            updated_by INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (unit_id, meeting_date),
            FOREIGN KEY (unit_id) REFERENCES units(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            unit_id INTEGER,
            unit_number TEXT,
            unit_name TEXT,
            ip_address TEXT,
            city TEXT,
            region TEXT,
            country TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL
        )'
    );

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_meetings_unit_date ON meetings(unit_id, meeting_date)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_users_unit ON users(unit_id)');

    $prefCols = $pdo->query('PRAGMA table_info(user_preferences)')->fetchAll();
    $prefColNames = array_map(static fn($c) => $c['name'], $prefCols);
    if (!in_array('week_starts_on', $prefColNames, true)) {
        $pdo->exec('ALTER TABLE user_preferences ADD COLUMN week_starts_on TEXT NOT NULL DEFAULT "monday"');
    }
}

function decodeJsonField($value, $default = [])
{
    if (is_array($value)) {
        return $value;
    }
    if ($value === null || $value === '') {
        return $default;
    }
    $decoded = json_decode((string) $value, true);
    return is_array($decoded) ? $decoded : $default;
}

function encodeJsonField($value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE);
}

function meetingRowToApi(array $row): array
{
    $row['id'] = (int) $row['id'];
    $row['unit_id'] = (int) $row['unit_id'];
    $row['is_fast_sunday'] = (int) ($row['is_fast_sunday'] ?? 0) === 1;
    $row['members_count'] = $row['members_count'] === null ? null : (int) $row['members_count'];
    $row['visitors_count'] = $row['visitors_count'] === null ? null : (int) $row['visitors_count'];
    foreach (['opening_hymn', 'sacrament_hymn', 'special_hymn', 'closing_hymn', 'ward_business', 'speakers', 'musical_number'] as $field) {
        $row[$field] = decodeJsonField($row[$field] ?? null, $field === 'speakers' || $field === 'ward_business' ? [] : null);
        if ($field === 'ward_business' && $row[$field] === []) {
            $row[$field] = [
                'sustainings' => [],
                'releases' => [],
                'confirmations' => [],
                'ordinations' => [],
                'other' => '',
            ];
        }
        if ($field === 'musical_number' && !$row[$field]) {
            $row[$field] = ['who' => '', 'piece' => ''];
        }
    }
    return $row;
}

function emptyWardBusiness(): array
{
    return [
        'sustainings' => [],
        'releases' => [],
        'confirmations' => [],
        'ordinations' => [],
        'other' => '',
    ];
}

function logAccess(PDO $pdo, array $data): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO access_logs
            (user_id, unit_id, unit_number, unit_name, ip_address, city, region, country, user_agent, created_at)
         VALUES
            (:user_id, :unit_id, :unit_number, :unit_name, :ip_address, :city, :region, :country, :user_agent, :created_at)'
    );
    $stmt->execute([
        ':user_id' => $data['user_id'] ?? null,
        ':unit_id' => $data['unit_id'] ?? null,
        ':unit_number' => $data['unit_number'] ?? null,
        ':unit_name' => $data['unit_name'] ?? null,
        ':ip_address' => $data['ip_address'] ?? null,
        ':city' => $data['city'] ?? null,
        ':region' => $data['region'] ?? null,
        ':country' => $data['country'] ?? null,
        ':user_agent' => $data['user_agent'] ?? null,
        ':created_at' => appNow(),
    ]);
}
