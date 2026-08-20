<?php

declare(strict_types=1);

if (!function_exists('mb_strtolower')) {
    function mb_strtolower($string, $encoding = null)
    {
        return strtolower((string) $string);
    }
}
if (!function_exists('mb_strpos')) {
    function mb_strpos($haystack, $needle, $offset = 0, $encoding = null)
    {
        return strpos((string) $haystack, (string) $needle, $offset);
    }
}

function getSiteBaseUrl(): string
{
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443)
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scriptDir = dirname($_SERVER['SCRIPT_NAME'] ?? '');
    $basePath = rtrim(str_replace('\\', '/', $scriptDir), '/');

    $ends = static function (string $haystack, string $needle): bool {
        return substr($haystack, -strlen($needle)) === $needle;
    };

    if ($ends($basePath, '/admin') || $ends($basePath, '/api')) {
        $basePath = dirname($basePath);
        if ($basePath === '/' || $basePath === '\\') {
            $basePath = '';
        }
    }

    return $protocol . '://' . $host . ($basePath === '' || $basePath === '.' ? '' : $basePath);
}

function appTimezone(): DateTimeZone
{
    return new DateTimeZone(APP_TIMEZONE);
}

function appNow(): string
{
    return (new DateTime('now', appTimezone()))->format('Y-m-d H:i:s');
}

function todayIso(): string
{
    return (new DateTime('now', appTimezone()))->format('Y-m-d');
}

function formatDatePt(string $date): string
{
    $d = new DateTime($date, appTimezone());
    return $d->format('d/m/Y');
}

function formatDateTimePt(string $datetime): string
{
    $d = new DateTime($datetime, appTimezone());
    return $d->format('d/m/Y H:i');
}

function formatTimePt(string $time): string
{
    $time = trim($time);
    if ($time === '') {
        return '';
    }
    if (preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $time)) {
        return substr($time, 0, 5);
    }
    try {
        $d = new DateTime($time, appTimezone());
        return $d->format('H:i');
    } catch (Throwable $e) {
        return $time;
    }
}

function nextOrCurrentSunday(?string $fromDate = null): string
{
    $tz = appTimezone();
    $d = $fromDate ? new DateTime($fromDate, $tz) : new DateTime('now', $tz);
    $dow = (int) $d->format('w');
    if ($dow !== 0) {
        $d->modify('next Sunday');
    }
    return $d->format('Y-m-d');
}

function isSunday(?string $date = null): bool
{
    $tz = appTimezone();
    $d = $date ? new DateTime($date, $tz) : new DateTime('now', $tz);
    return (int) $d->format('w') === 0;
}

function isFastSunday(string $date): bool
{
    $d = new DateTime($date, appTimezone());
    return (int) $d->format('w') === 0 && (int) $d->format('j') <= 7;
}
