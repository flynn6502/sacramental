<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

function sendAppMail(string $to, string $subject, string $htmlBody, string $textBody = ''): bool
{
    if ($textBody === '') {
        $textBody = trim(strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], ["\n", "\n", "\n", "\n\n"], $htmlBody)));
    }

    $from = defined('MAIL_FROM') ? trim((string) MAIL_FROM) : 'suporte@altasoftware.com.br';
    $fromName = defined('MAIL_FROM_NAME') ? (string) MAIL_FROM_NAME : 'Agenda Sacramental';
    $host = defined('MAIL_SMTP_HOST') ? trim((string) MAIL_SMTP_HOST) : '';

    // Com MAIL_SMTP_HOST preenchido usa SMTP; vazio usa PHP mail()
    if ($host !== '') {
        return sendSmtpMail($to, $subject, $htmlBody, $textBody, $from, $fromName);
    }

    return sendPhpMail($to, $subject, $htmlBody, $from, $fromName);
}

function sendPhpMail(string $to, string $subject, string $htmlBody, string $from, string $fromName): bool
{
    if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL) || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $encodedName = function_exists('mb_encode_mimeheader')
        ? mb_encode_mimeheader($fromName, 'UTF-8')
        : $fromName;
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . sprintf('"%s" <%s>', $encodedName, $from),
        'Reply-To: ' . $from,
        'Return-Path: ' . $from,
        'X-Mailer: AgendaSacramental',
    ];

    // -f define o remetente do envelope (importante no HostGator)
    $extra = '-f' . $from;

    return @mail($to, $encodedSubject, $htmlBody, implode("\r\n", $headers), $extra);
}

function sendSmtpMail(string $to, string $subject, string $html, string $text, string $from, string $fromName): bool
{
    $host = MAIL_SMTP_HOST;
    $port = (int) MAIL_SMTP_PORT;
    $user = MAIL_SMTP_USER;
    $pass = MAIL_SMTP_PASS;
    $secure = MAIL_SMTP_SECURE;
    $timeout = 12;

    $remote = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
    $fp = @stream_socket_client($remote, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
    if (!$fp) {
        return false;
    }

    stream_set_timeout($fp, $timeout);

    $expect = static function ($fp, array $codes): bool {
        $line = '';
        while ($chunk = fgets($fp, 515)) {
            $line = $chunk;
            if (isset($chunk[3]) && $chunk[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($line, 0, 3);
        return in_array($code, $codes, true);
    };

    $cmd = static function ($fp, string $command, array $codes) use ($expect): bool {
        fwrite($fp, $command . "\r\n");
        return $expect($fp, $codes);
    };

    if (!$expect($fp, [220])) {
        fclose($fp);
        return false;
    }

    $ehloHost = $_SERVER['SERVER_NAME'] ?? 'localhost';
    if (!$cmd($fp, 'EHLO ' . $ehloHost, [250])) {
        fclose($fp);
        return false;
    }

    if ($secure === 'tls') {
        if (!$cmd($fp, 'STARTTLS', [220])) {
            fclose($fp);
            return false;
        }
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
            $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        }
        if (!@stream_socket_enable_crypto($fp, true, $crypto)) {
            fclose($fp);
            return false;
        }
        if (!$cmd($fp, 'EHLO ' . $ehloHost, [250])) {
            fclose($fp);
            return false;
        }
    }

    if ($user !== '') {
        if (!$cmd($fp, 'AUTH LOGIN', [334])) {
            fclose($fp);
            return false;
        }
        if (!$cmd($fp, base64_encode($user), [334])) {
            fclose($fp);
            return false;
        }
        if (!$cmd($fp, base64_encode($pass), [235])) {
            fclose($fp);
            return false;
        }
    }

    $boundary = 'b' . bin2hex(random_bytes(8));
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $encodedName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';

    $headers = [
        'Date: ' . date('r'),
        'From: ' . $encodedName . ' <' . $from . '>',
        'To: <' . $to . '>',
        'Subject: ' . $encodedSubject,
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];

    $body = '--' . $boundary . "\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n\r\n"
        . $text . "\r\n"
        . '--' . $boundary . "\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n\r\n"
        . $html . "\r\n"
        . '--' . $boundary . "--\r\n";

    $payload = implode("\r\n", $headers) . "\r\n\r\n" . $body;

    $ok = $cmd($fp, 'MAIL FROM:<' . $from . '>', [250])
        && $cmd($fp, 'RCPT TO:<' . $to . '>', [250, 251])
        && $cmd($fp, 'DATA', [354]);

    if ($ok) {
        fwrite($fp, $payload . "\r\n.\r\n");
        $ok = $expect($fp, [250]);
    }

    $cmd($fp, 'QUIT', [221]);
    fclose($fp);

    return $ok;
}
