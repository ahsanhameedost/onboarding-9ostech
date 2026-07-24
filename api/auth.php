<?php

declare(strict_types=1);

const OAKBOARD_SESSION_COOKIE = 'oakboard_session';
const OAKBOARD_CSRF_COOKIE = 'oakboard_csrf';
const OAKBOARD_REGULAR_SESSION_SECONDS = 43_200;
const OAKBOARD_REMEMBERED_SESSION_SECONDS = 2_592_000;
const OAKBOARD_OTP_SECONDS = 600;
const OAKBOARD_RESET_SECONDS = 1_800;

function ensure_auth_schema(): void
{
    // Database structure is deployed once from database/mysql/schema.sql.
    // Running DDL and INFORMATION_SCHEMA checks on every web request adds
    // substantial latency, especially when developing against remote cPanel
    // MySQL, and is unsafe under concurrent production traffic.
}

function app_config(): array
{
    $config = oakboard_config()['app'] ?? null;
    if (!is_array($config)) {
        throw new RuntimeException('OakBoard application configuration is missing.');
    }
    $secret = (string) (oakboard_config()['security']['session_secret'] ?? $config['session_secret'] ?? '');
    if (strlen($secret) < 32) {
        throw new RuntimeException('OakBoard session secret must contain at least 32 characters.');
    }
    return $config;
}

function allowed_email_domain(): string
{
    return mb_strtolower(ltrim(trim((string) (app_config()['allowed_email_domain'] ?? '9ostech.com')), '@'));
}

function normalized_work_email(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $email = mb_strtolower(trim($value));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return null;
    }
    return str_ends_with($email, '@' . allowed_email_domain()) ? $email : null;
}

function validate_password(mixed $value): ?string
{
    if (!is_string($value) || strlen($value) < 8 || strlen($value) > 4096) {
        return null;
    }
    return $value;
}

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function token_digest(string $token): string
{
    $config = oakboard_config();
    $secret = (string) ($config['security']['session_secret'] ?? $config['app']['session_secret'] ?? '');
    return hash_hmac('sha256', $token, $secret);
}

function request_is_https(): bool
{
    if (($_SERVER['HTTPS'] ?? '') !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function set_auth_cookie(string $name, string $value, int $expires, bool $httpOnly): void
{
    setcookie($name, $value, [
        'expires' => $expires,
        'path' => '/',
        'secure' => request_is_https(),
        'httponly' => $httpOnly,
        'samesite' => 'Lax',
    ]);
}

function clear_auth_cookies(): void
{
    set_auth_cookie(OAKBOARD_SESSION_COOKIE, '', time() - 3600, true);
    set_auth_cookie(OAKBOARD_CSRF_COOKIE, '', time() - 3600, false);
}

function public_user(array $user): array
{
    return [
        'id' => (string) $user['id'],
        'email' => (string) $user['email'],
        'user_metadata' => [
            'full_name' => (string) ($user['full_name'] ?? ''),
        ],
        'email_confirmed_at' => $user['email_verified_at'] ?? null,
        'last_sign_in_at' => $user['last_sign_in_at'] ?? null,
    ];
}

function create_auth_session(array $user, bool $remember): array
{
    $sessionToken = base64url_encode(random_bytes(32));
    $csrfToken = base64url_encode(random_bytes(24));
    $lifetime = $remember ? OAKBOARD_REMEMBERED_SESSION_SECONDS : OAKBOARD_REGULAR_SESSION_SECONDS;
    $expiresAt = time() + $lifetime;

    $statement = database()->prepare(
        'INSERT INTO auth_sessions (id, user_id, token_hash, csrf_hash, expires_at)
         VALUES (:id, :user_id, :token_hash, :csrf_hash, :expires_at)'
    );
    $statement->execute([
        'id' => uuid_v4(),
        'user_id' => $user['id'],
        'token_hash' => hash('sha256', $sessionToken),
        'csrf_hash' => hash('sha256', $csrfToken),
        'expires_at' => gmdate('Y-m-d H:i:s', $expiresAt),
    ]);

    set_auth_cookie(OAKBOARD_SESSION_COOKIE, $sessionToken, $remember ? $expiresAt : 0, true);
    set_auth_cookie(OAKBOARD_CSRF_COOKIE, $csrfToken, $remember ? $expiresAt : 0, false);
    $user['last_sign_in_at'] = gmdate('Y-m-d H:i:s');
    return [
        'user' => public_user($user),
        'expires_at' => $expiresAt,
    ];
}

function authenticated_user(): array
{
    ensure_auth_schema();
    $token = $_COOKIE[OAKBOARD_SESSION_COOKIE] ?? '';
    if (!is_string($token) || strlen($token) < 32) {
        json_response(['error' => 'Unauthorized', 'code' => 'unauthorized'], 401);
    }

    $statement = database()->prepare(
        'SELECT u.id, u.email, u.full_name, u.email_verified_at, u.last_sign_in_at,
                s.id AS session_id, s.csrf_hash, s.expires_at
         FROM auth_sessions s
         INNER JOIN app_users u ON u.id = s.user_id
         WHERE s.token_hash = :token_hash
           AND s.revoked_at IS NULL
           AND s.expires_at > UTC_TIMESTAMP(3)
           AND u.email_verified_at IS NOT NULL
         LIMIT 1'
    );
    $statement->execute(['token_hash' => hash('sha256', $token)]);
    $user = $statement->fetch();
    if (!$user) {
        clear_auth_cookies();
        json_response(['error' => 'Unauthorized', 'code' => 'unauthorized'], 401);
    }

    database()->prepare(
        'UPDATE auth_sessions SET last_seen_at = UTC_TIMESTAMP(3) WHERE id = :id'
    )->execute(['id' => $user['session_id']]);
    return $user;
}

function require_csrf(array $sessionUser): void
{
    $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $cookie = $_COOKIE[OAKBOARD_CSRF_COOKIE] ?? '';
    if (!is_string($header) || !is_string($cookie) || $header === '' || $cookie === ''
        || !hash_equals($cookie, $header)
        || !hash_equals((string) $sessionUser['csrf_hash'], hash('sha256', $header))) {
        json_response(['error' => 'Security token is missing or invalid.', 'code' => 'csrf_failed'], 403);
    }
}

function request_origin_allowed(): bool
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin === '') {
        return true;
    }
    $configuredOrigin = rtrim((string) (app_config()['url'] ?? ''), '/');
    if ($configuredOrigin !== '' && hash_equals($configuredOrigin, rtrim($origin, '/'))) {
        return true;
    }
    $host = mb_strtolower((string) parse_url($origin, PHP_URL_HOST));
    return in_array($host, ['127.0.0.1', 'localhost'], true);
}

function require_allowed_origin(): void
{
    if (!request_origin_allowed()) {
        json_response(['error' => 'Request origin is not allowed.', 'code' => 'origin_not_allowed'], 403);
    }
}

function create_auth_token(string $userId, string $purpose, string $plainToken, int $lifetime): void
{
    $db = database();
    $recent = $db->prepare(
        'SELECT id FROM auth_tokens
         WHERE user_id = :user_id
           AND purpose = :purpose
           AND used_at IS NULL
           AND created_at BETWEEN DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 SECOND)
                              AND DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 SECOND)
         ORDER BY created_at DESC LIMIT 1'
    );
    $recent->execute(['user_id' => $userId, 'purpose' => $purpose]);
    if ($recent->fetchColumn() !== false) {
        json_response(['error' => 'Please wait before requesting another email.', 'code' => 'rate_limited'], 429);
    }

    $db->prepare(
        'UPDATE auth_tokens SET used_at = UTC_TIMESTAMP(3)
         WHERE user_id = :user_id AND purpose = :purpose AND used_at IS NULL'
    )->execute(['user_id' => $userId, 'purpose' => $purpose]);
    $db->prepare(
        'INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at)
         VALUES (:id, :user_id, :purpose, :token_hash, :expires_at)'
    )->execute([
        'id' => uuid_v4(),
        'user_id' => $userId,
        'purpose' => $purpose,
        'token_hash' => token_digest($plainToken),
        'expires_at' => gmdate('Y-m-d H:i:s', time() + $lifetime),
    ]);
}

function signup_user(array $body): array
{
    require_allowed_origin();
    ensure_auth_schema();
    $email = normalized_work_email($body['email'] ?? null);
    $password = validate_password($body['password'] ?? null);
    $fullName = is_string($body['full_name'] ?? null) ? trim($body['full_name']) : '';
    if ($email === null || $password === null || $fullName === '' || mb_strlen($fullName) > 160) {
        json_response(['error' => 'Enter a valid work email, full name, and password of at least 8 characters.', 'code' => 'invalid_signup'], 422);
    }

    $db = database();
    $lookup = $db->prepare('SELECT * FROM app_users WHERE email = :email LIMIT 1');
    $lookup->execute(['email' => $email]);
    $user = $lookup->fetch();
    if ($user && $user['email_verified_at'] !== null) {
        json_response(['error' => 'This email is already registered. Try signing in instead.', 'code' => 'email_exists'], 409);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($passwordHash)) {
        throw new RuntimeException('Password hashing failed.');
    }
    if (!$user) {
        $user = ['id' => uuid_v4(), 'email' => $email, 'full_name' => mb_substr($fullName, 0, 160)];
        $db->prepare(
            'INSERT INTO app_users (id, email, full_name, password_hash)
             VALUES (:id, :email, :full_name, :password_hash)'
        )->execute([
            'id' => $user['id'],
            'email' => $email,
            'full_name' => $user['full_name'],
            'password_hash' => $passwordHash,
        ]);
    } else {
        $user['full_name'] = mb_substr($fullName, 0, 160);
        $db->prepare(
            'UPDATE app_users SET full_name = :full_name, password_hash = :password_hash WHERE id = :id'
        )->execute([
            'full_name' => $user['full_name'],
            'password_hash' => $passwordHash,
            'id' => $user['id'],
        ]);
    }

    $code = (string) random_int(100000, 999999);
    create_auth_token((string) $user['id'], 'email_verification', $code, OAKBOARD_OTP_SECONDS);
    try {
        send_verification_email($email, $code);
    } catch (Throwable $error) {
        error_log('OakBoard verification email failed: ' . $error->getMessage());
        json_response(['error' => 'Verification email could not be sent. Check Mailgun domain settings and try again.', 'code' => 'email_delivery_failed'], 502);
    }

    return [
        'user' => public_user($user + ['email_verified_at' => null, 'last_sign_in_at' => null]),
        'verification_required' => true,
    ];
}

function resend_verification(array $body): array
{
    require_allowed_origin();
    ensure_auth_schema();
    $email = normalized_work_email($body['email'] ?? null);
    if ($email === null) {
        json_response(['error' => 'Enter a valid work email.', 'code' => 'invalid_email'], 422);
    }
    $statement = database()->prepare(
        'SELECT * FROM app_users WHERE email = :email AND email_verified_at IS NULL LIMIT 1'
    );
    $statement->execute(['email' => $email]);
    $user = $statement->fetch();
    if (!$user) {
        json_response(['error' => 'This account is already verified or does not exist.', 'code' => 'verification_unavailable'], 404);
    }
    $code = (string) random_int(100000, 999999);
    create_auth_token((string) $user['id'], 'email_verification', $code, OAKBOARD_OTP_SECONDS);
    send_verification_email($email, $code);
    return ['ok' => true];
}

function verify_email_code(array $body): array
{
    require_allowed_origin();
    ensure_auth_schema();
    $email = normalized_work_email($body['email'] ?? null);
    $code = is_string($body['code'] ?? null) ? trim($body['code']) : '';
    if ($email === null || preg_match('/^\d{6}$/', $code) !== 1) {
        json_response(['error' => 'Enter the complete six-digit verification code.', 'code' => 'invalid_otp'], 422);
    }

    $statement = database()->prepare(
        'SELECT t.*, u.email, u.full_name, u.email_verified_at, u.last_sign_in_at
         FROM auth_tokens t INNER JOIN app_users u ON u.id = t.user_id
         WHERE u.email = :email AND t.purpose = \'email_verification\' AND t.used_at IS NULL
         ORDER BY t.created_at DESC LIMIT 1'
    );
    $statement->execute(['email' => $email]);
    $token = $statement->fetch();
    if (!$token || strtotime((string) $token['expires_at']) < time() || (int) $token['attempts'] >= 5) {
        json_response(['error' => 'That code is invalid or has expired. Request a new one.', 'code' => 'otp_expired'], 400);
    }
    if (!hash_equals((string) $token['token_hash'], token_digest($code))) {
        database()->prepare('UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = :id')
            ->execute(['id' => $token['id']]);
        json_response(['error' => 'That code is invalid or has expired. Check the code or request a new one.', 'code' => 'invalid_otp'], 400);
    }

    $db = database();
    $db->prepare('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP(3) WHERE id = :id')
        ->execute(['id' => $token['id']]);
    $db->prepare(
        'UPDATE app_users SET email_verified_at = UTC_TIMESTAMP(3), failed_login_count = 0, locked_until = NULL,
         last_sign_in_at = UTC_TIMESTAMP(3) WHERE id = :id'
    )->execute(['id' => $token['user_id']]);
    $token['id'] = $token['user_id'];
    $token['email_verified_at'] = gmdate('Y-m-d H:i:s');
    $token['last_sign_in_at'] = gmdate('Y-m-d H:i:s');
    return ['session' => create_auth_session($token, false), 'user' => public_user($token)];
}

function signin_user(array $body): array
{
    require_allowed_origin();
    ensure_auth_schema();
    $email = normalized_work_email($body['email'] ?? null);
    $password = validate_password($body['password'] ?? null);
    $remember = ($body['remember'] ?? false) === true;
    if ($email === null || $password === null) {
        json_response(['error' => 'Incorrect email or password. If you are new to OakBoard, create an account.', 'code' => 'invalid_credentials'], 401);
    }

    $statement = database()->prepare('SELECT * FROM app_users WHERE email = :email LIMIT 1');
    $statement->execute(['email' => $email]);
    $user = $statement->fetch();
    if (!$user || !is_string($user['password_hash'] ?? null) || !password_verify($password, $user['password_hash'])) {
        if ($user) {
            $failed = (int) ($user['failed_login_count'] ?? 0) + 1;
            $lockedUntil = $failed >= 5 ? gmdate('Y-m-d H:i:s', time() + 900) : null;
            database()->prepare(
                'UPDATE app_users SET failed_login_count = :failed, locked_until = :locked_until WHERE id = :id'
            )->execute(['failed' => $failed >= 5 ? 0 : $failed, 'locked_until' => $lockedUntil, 'id' => $user['id']]);
        }
        json_response(['error' => 'Incorrect email or password. If you are new to OakBoard, create an account.', 'code' => 'invalid_credentials'], 401);
    }
    if (is_string($user['locked_until'] ?? null) && strtotime($user['locked_until']) > time()) {
        json_response(['error' => 'Too many sign-in attempts. Please wait 15 minutes and try again.', 'code' => 'account_locked'], 429);
    }
    if ($user['email_verified_at'] === null) {
        json_response(['error' => 'Please verify your work email before signing in.', 'code' => 'email_not_verified'], 403);
    }

    database()->prepare(
        'UPDATE app_users SET failed_login_count = 0, locked_until = NULL, last_sign_in_at = UTC_TIMESTAMP(3)
         WHERE id = :id'
    )->execute(['id' => $user['id']]);
    $user['last_sign_in_at'] = gmdate('Y-m-d H:i:s');
    return ['session' => create_auth_session($user, $remember), 'user' => public_user($user)];
}

function current_auth_session(): array
{
    $user = authenticated_user();
    return [
        'session' => [
            'user' => public_user($user),
            'expires_at' => strtotime((string) $user['expires_at']),
        ],
    ];
}

function signout_user(): array
{
    $user = authenticated_user();
    require_csrf($user);
    database()->prepare('UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE id = :id')
        ->execute(['id' => $user['session_id']]);
    clear_auth_cookies();
    return ['ok' => true];
}

function request_password_reset(array $body): array
{
    require_allowed_origin();
    ensure_auth_schema();
    $email = normalized_work_email($body['email'] ?? null);
    if ($email !== null) {
        $statement = database()->prepare(
            'SELECT * FROM app_users WHERE email = :email AND email_verified_at IS NOT NULL LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();
        if ($user) {
            $token = base64url_encode(random_bytes(32));
            create_auth_token((string) $user['id'], 'password_reset', $token, OAKBOARD_RESET_SECONDS);
            $baseUrl = rtrim((string) (app_config()['url'] ?? ''), '/');
            $resetUrl = $baseUrl . '/sign-in?reset_token=' . rawurlencode($token);
            try {
                send_password_reset_email($email, $resetUrl);
            } catch (Throwable $error) {
                error_log('OakBoard password reset email failed: ' . $error->getMessage());
            }
        }
    }
    return ['ok' => true];
}

function confirm_password_reset(array $body): array
{
    require_allowed_origin();
    ensure_auth_schema();
    $token = is_string($body['token'] ?? null) ? trim($body['token']) : '';
    $password = validate_password($body['password'] ?? null);
    if (strlen($token) < 32 || $password === null) {
        json_response(['error' => 'The reset link is invalid, or the password is too short.', 'code' => 'invalid_reset'], 422);
    }
    $statement = database()->prepare(
        'SELECT t.*, u.email, u.full_name, u.email_verified_at, u.last_sign_in_at
         FROM auth_tokens t INNER JOIN app_users u ON u.id = t.user_id
         WHERE t.token_hash = :token_hash AND t.purpose = \'password_reset\' AND t.used_at IS NULL
         LIMIT 1'
    );
    $statement->execute(['token_hash' => token_digest($token)]);
    $record = $statement->fetch();
    if (!$record || strtotime((string) $record['expires_at']) < time()) {
        json_response(['error' => 'This password reset link is invalid or has expired.', 'code' => 'reset_expired'], 400);
    }
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($passwordHash)) {
        throw new RuntimeException('Password hashing failed.');
    }
    $db = database();
    $db->prepare(
        'UPDATE app_users SET password_hash = :password_hash, failed_login_count = 0, locked_until = NULL,
         last_sign_in_at = UTC_TIMESTAMP(3) WHERE id = :id'
    )->execute(['password_hash' => $passwordHash, 'id' => $record['user_id']]);
    $db->prepare('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP(3) WHERE id = :id')
        ->execute(['id' => $record['id']]);
    $db->prepare('UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = :user_id AND revoked_at IS NULL')
        ->execute(['user_id' => $record['user_id']]);
    $record['id'] = $record['user_id'];
    $record['last_sign_in_at'] = gmdate('Y-m-d H:i:s');
    return ['session' => create_auth_session($record, false), 'user' => public_user($record)];
}
