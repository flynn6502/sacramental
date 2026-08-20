<?php

declare(strict_types=1);

function getClientIp(): string
{
    $headers = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];

    foreach ($headers as $header) {
        if (empty($_SERVER[$header])) {
            continue;
        }

        $value = trim(explode(',', (string) $_SERVER[$header])[0]);
        if (filter_var($value, FILTER_VALIDATE_IP)) {
            return $value;
        }
    }

    return '0.0.0.0';
}

function isPrivateIp(string $ip): bool
{
    return !filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    );
}

function lookupGeoLocation(string $ip): array
{
    $empty = ['city' => null, 'region' => null, 'country' => null];

    if ($ip === '0.0.0.0' || isPrivateIp($ip)) {
        return $empty;
    }

    $url = 'http://ip-api.com/json/' . urlencode($ip)
        . '?fields=status,country,regionName,city&lang=pt-BR';

    $context = stream_context_create([
        'http' => [
            'timeout' => 2,
            'ignore_errors' => true,
        ],
    ]);

    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        return $empty;
    }

    $data = json_decode($response, true);
    if (!is_array($data) || ($data['status'] ?? '') !== 'success') {
        return $empty;
    }

    return [
        'city' => $data['city'] ?? null,
        'region' => $data['regionName'] ?? null,
        'country' => $data['country'] ?? null,
    ];
}

function formatLocation(?string $city, ?string $region, ?string $country): string
{
    $parts = array_filter([$city, $region, $country], fn($v) => $v !== null && $v !== '');
    return $parts === [] ? 'Desconhecido' : implode(', ', $parts);
}
