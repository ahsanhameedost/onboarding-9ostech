<?php

declare(strict_types=1);

const OAKBOARD_MAX_BODY_BYTES = 12_000_000;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function oakboard_config(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $configuredPath = getenv('OAKBOARD_CONFIG_FILE') ?: '';
    $candidates = [];
    if ($configuredPath !== '') {
        $candidates[] = $configuredPath;
    } else {
        // Walk upward from the document root so the private config file is found
        // regardless of how deeply the site is nested on cPanel. This works for a
        // subdomain doc root at any depth (e.g. .../onboarding.example.com/dist/api,
        // or files uploaded straight to .../onboarding.example.com/api). Place
        // oakboard-config.php at or above the document root, ideally in the home
        // directory so it is never web-served.
        $directory = dirname(__DIR__);
        $previous = '';
        while ($directory !== $previous) {
            $candidates[] = $directory . DIRECTORY_SEPARATOR . 'oakboard-config.php';
            $previous = $directory;
            $directory = dirname($directory);
        }
    }
    $path = '';
    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            $path = $candidate;
            break;
        }
    }

    if ($path === '') {
        throw new RuntimeException('OakBoard server configuration is missing.');
    }

    $loaded = require $path;
    if (!is_array($loaded) || !isset($loaded['mysql'], $loaded['app'])) {
        throw new RuntimeException('OakBoard server configuration is invalid.');
    }

    $config = $loaded;
    return $config;
}

function database(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $mysql = oakboard_config()['mysql'];
    foreach (['host', 'database', 'username', 'password'] as $required) {
        if (!isset($mysql[$required]) || !is_string($mysql[$required]) || $mysql[$required] === '') {
            throw new RuntimeException('MySQL configuration is incomplete.');
        }
    }

    $host = $mysql['host'];
    $port = (int) ($mysql['port'] ?? 3306);
    $databaseName = $mysql['database'];
    $dsn = "mysql:host={$host};port={$port};dbname={$databaseName};charset=utf8mb4";

    $pdo = new PDO($dsn, $mysql['username'], $mysql['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    // Keep application timestamps consistent even when the cPanel server uses
    // a regional system timezone.
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function request_json(): array
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > OAKBOARD_MAX_BODY_BYTES) {
        json_response(['error' => 'Request body is too large.'], 413);
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_response(['error' => 'A valid JSON request body is required.'], 400);
    }
    return $decoded;
}

function uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function valid_uuid(string $value): bool
{
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
}

function utc_strtotime(mixed $value): int
{
    // Every OakBoard DATETIME column holds UTC: PHP writes them with gmdate()
    // and MySQL defaults run under the connection time_zone of '+00:00'. A bare
    // datetime string has no zone designator, so strtotime() would read it in
    // the server's local timezone and shift the result on any cPanel host whose
    // date.timezone is regional. Pin the zone so expiries stay correct.
    $timestamp = strtotime((string) $value . ' UTC');
    return $timestamp === false ? 0 : $timestamp;
}

function normalized_plan(mixed $value): ?array
{
    if (!is_array($value)) {
        return null;
    }
    $role = isset($value['role']) && is_string($value['role']) ? trim($value['role']) : '';
    $weeks = (int) ($value['nWeeks'] ?? 0);
    if ($role === '' || !in_array($weeks, [2, 4], true)) {
        return null;
    }
    $value['role'] = mb_substr($role, 0, 160);
    $value['nWeeks'] = $weeks;
    return $value;
}

function saved_plan(array $row): array
{
    $decoded = is_array($row['plan_json']) ? $row['plan_json'] : json_decode((string) $row['plan_json'], true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Stored plan JSON is invalid.');
    }
    $weeks = (int) $row['duration_weeks'] === 4 ? 4 : 2;
    $decoded['id'] = $row['id'];
    $decoded['nWeeks'] = $weeks;
    return [
        'id' => $row['id'],
        'name' => $row['title'] ?: $decoded['role'],
        'role' => $row['role'] ?: 'Untitled role',
        'nWeeks' => $weeks,
        'updatedAt' => gmdate('c', utc_strtotime($row['updated_at'])),
        'plan' => $decoded,
    ];
}
