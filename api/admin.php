<?php

declare(strict_types=1);

// OakBoard administrator console.
//
// Every function here runs only after require_admin() has accepted the caller,
// so these are the one place in the API where queries are deliberately not
// scoped to a single owner. Activity is derived from the tables OakBoard
// already writes (app_users, auth_sessions, onboarding_plans,
// onboarding_email_logs) rather than a separate audit log.

const OAKBOARD_ADMIN_MAX_ROWS = 200;

function admin_timestamp(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $timestamp = utc_strtotime($value);
    return $timestamp === 0 ? null : gmdate('c', $timestamp);
}

function admin_row_limit(mixed $value, int $default = 50): int
{
    return min(max((int) ($value ?? $default), 1), OAKBOARD_ADMIN_MAX_ROWS);
}

function admin_query_string(string $key, string $default = ''): string
{
    // A query parameter can arrive as an array (?search[]=x), which would emit
    // an array-to-string warning if cast blindly.
    $value = $_GET[$key] ?? null;
    return is_string($value) ? trim($value) : $default;
}

function admin_public_user(array $row): array
{
    $lockedUntil = admin_timestamp($row['locked_until'] ?? null);
    return [
        'id' => (string) $row['id'],
        'email' => (string) $row['email'],
        'fullName' => (string) ($row['full_name'] ?? ''),
        'role' => ($row['role'] ?? 'member') === 'admin' ? 'admin' : 'member',
        'isAdmin' => is_admin_user($row),
        'isRootAdmin' => is_root_admin($row),
        'verifiedAt' => admin_timestamp($row['email_verified_at'] ?? null),
        'isVerified' => ($row['email_verified_at'] ?? null) !== null,
        'lastSignInAt' => admin_timestamp($row['last_sign_in_at'] ?? null),
        'createdAt' => admin_timestamp($row['created_at'] ?? null),
        'mustChangePassword' => (int) ($row['must_change_password'] ?? 0) === 1,
        'failedLoginCount' => (int) ($row['failed_login_count'] ?? 0),
        'lockedUntil' => $lockedUntil,
        'isLocked' => $lockedUntil !== null && utc_strtotime($row['locked_until']) > time(),
        'planCount' => (int) ($row['plan_count'] ?? 0),
        'activePlanCount' => (int) ($row['active_plan_count'] ?? 0),
        'loginCount' => (int) ($row['login_count'] ?? 0),
        'activeSessionCount' => (int) ($row['active_session_count'] ?? 0),
        'emailCount' => (int) ($row['email_count'] ?? 0),
    ];
}

function admin_public_plan(array $row, bool $includeContent = false): array
{
    $plan = [
        'id' => (string) $row['id'],
        'title' => (string) ($row['title'] ?? ''),
        'role' => ($row['role'] ?? '') !== '' ? (string) $row['role'] : 'Untitled role',
        'nWeeks' => (int) ($row['duration_weeks'] ?? 2) === 4 ? 4 : 2,
        'reportsTo' => (string) ($row['reports_to'] ?? ''),
        'collaboratesWith' => (string) ($row['collaborates_with'] ?? ''),
        'isArchived' => ($row['archived_at'] ?? null) !== null,
        'archivedAt' => admin_timestamp($row['archived_at'] ?? null),
        'createdAt' => admin_timestamp($row['created_at'] ?? null),
        'updatedAt' => admin_timestamp($row['updated_at'] ?? null),
    ];
    if (array_key_exists('owner_id', $row)) {
        $plan['owner'] = [
            'id' => (string) $row['owner_id'],
            'email' => (string) ($row['owner_email'] ?? ''),
            'fullName' => (string) ($row['owner_name'] ?? ''),
        ];
    }
    if ($includeContent) {
        $decoded = json_decode((string) $row['plan_json'], true);
        $plan['plan'] = is_array($decoded) ? $decoded : null;
    }
    return $plan;
}

function admin_overview(): array
{
    $statement = database()->query(
        "SELECT
            (SELECT COUNT(*) FROM app_users) AS total_users,
            (SELECT COUNT(*) FROM app_users WHERE email_verified_at IS NOT NULL) AS verified_users,
            (SELECT COUNT(*) FROM app_users WHERE email_verified_at IS NULL) AS pending_users,
            (SELECT COUNT(*) FROM app_users WHERE locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP(3)) AS locked_users,
            (SELECT COUNT(*) FROM app_users WHERE role = 'admin') AS admin_users,
            (SELECT COUNT(*) FROM app_users WHERE created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)) AS signups_7d,
            (SELECT COUNT(*) FROM app_users WHERE created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)) AS signups_30d,
            (SELECT COUNT(*) FROM onboarding_plans) AS total_plans,
            (SELECT COUNT(*) FROM onboarding_plans WHERE archived_at IS NULL) AS active_plans,
            (SELECT COUNT(*) FROM onboarding_plans WHERE archived_at IS NOT NULL) AS archived_plans,
            (SELECT COUNT(*) FROM onboarding_plans WHERE duration_weeks = 2) AS two_week_plans,
            (SELECT COUNT(*) FROM onboarding_plans WHERE duration_weeks = 4) AS four_week_plans,
            (SELECT COUNT(*) FROM onboarding_plans WHERE created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)) AS plans_7d,
            (SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3)) AS active_sessions,
            (SELECT COUNT(*) FROM auth_sessions) AS total_logins,
            (SELECT COUNT(*) FROM auth_sessions WHERE created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)) AS logins_7d,
            (SELECT COUNT(*) FROM auth_sessions WHERE created_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)) AS logins_24h,
            (SELECT COUNT(*) FROM onboarding_email_logs WHERE status = 'sent') AS emails_sent,
            (SELECT COUNT(*) FROM onboarding_email_logs WHERE status = 'failed') AS emails_failed"
    );
    $row = $statement->fetch() ?: [];

    return [
        'overview' => array_map(static fn ($value) => (int) $value, $row),
    ] + admin_activity();
}

function admin_daily_counts(PDO $pdo, string $table, string $since): array
{
    // The connection runs at time_zone '+00:00', so DATE() buckets by UTC day,
    // matching the ISO timestamps the rest of the API returns.
    $statement = $pdo->prepare(
        "SELECT DATE(created_at) AS bucket, COUNT(*) AS total
         FROM {$table} WHERE created_at >= :since GROUP BY bucket"
    );
    $statement->execute(['since' => $since]);

    $counts = [];
    foreach ($statement->fetchAll() as $row) {
        $counts[(string) $row['bucket']] = (int) $row['total'];
    }
    return $counts;
}

function admin_activity(int $days = 14): array
{
    $pdo = database();
    $since = gmdate('Y-m-d 00:00:00', time() - ($days - 1) * 86400);

    // Table names are literals here, never request input.
    $signups = admin_daily_counts($pdo, 'app_users', $since);
    $logins = admin_daily_counts($pdo, 'auth_sessions', $since);
    $plans = admin_daily_counts($pdo, 'onboarding_plans', $since);

    $daily = [];
    for ($offset = $days - 1; $offset >= 0; $offset--) {
        $day = gmdate('Y-m-d', time() - $offset * 86400);
        $daily[] = [
            'day' => $day,
            'signups' => $signups[$day] ?? 0,
            'logins' => $logins[$day] ?? 0,
            'plans' => $plans[$day] ?? 0,
        ];
    }

    $recentSignins = $pdo->query(
        'SELECT u.email, u.full_name, s.created_at
         FROM auth_sessions s INNER JOIN app_users u ON u.id = s.user_id
         ORDER BY s.created_at DESC LIMIT 8'
    )->fetchAll();

    $recentPlans = $pdo->query(
        'SELECT p.id, p.role, p.duration_weeks, p.created_at, u.email, u.full_name
         FROM onboarding_plans p INNER JOIN app_users u ON u.id = p.owner_id
         ORDER BY p.created_at DESC LIMIT 8'
    )->fetchAll();

    return [
        'daily' => $daily,
        'recentSignins' => array_map(static fn (array $row) => [
            'email' => (string) $row['email'],
            'fullName' => (string) ($row['full_name'] ?? ''),
            'at' => admin_timestamp($row['created_at']),
        ], $recentSignins),
        'recentPlans' => array_map(static fn (array $row) => [
            'id' => (string) $row['id'],
            'role' => ($row['role'] ?? '') !== '' ? (string) $row['role'] : 'Untitled role',
            'nWeeks' => (int) $row['duration_weeks'] === 4 ? 4 : 2,
            'email' => (string) $row['email'],
            'fullName' => (string) ($row['full_name'] ?? ''),
            'at' => admin_timestamp($row['created_at']),
        ], $recentPlans),
    ];
}

function admin_user_rows(string $search = '', int $limit = 50): array
{
    $where = '';
    $parameters = [];
    if ($search !== '') {
        $where = 'WHERE u.email LIKE :search OR u.full_name LIKE :search';
        $parameters['search'] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $search) . '%';
    }

    $statement = database()->prepare(
        "SELECT u.id, u.email, u.full_name, u.role, u.email_verified_at, u.last_sign_in_at,
                u.failed_login_count, u.locked_until, u.created_at, u.must_change_password,
                (SELECT COUNT(*) FROM onboarding_plans p WHERE p.owner_id = u.id) AS plan_count,
                (SELECT COUNT(*) FROM onboarding_plans p WHERE p.owner_id = u.id AND p.archived_at IS NULL) AS active_plan_count,
                (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id) AS login_count,
                (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL
                   AND s.expires_at > UTC_TIMESTAMP(3)) AS active_session_count,
                (SELECT COUNT(*) FROM onboarding_email_logs e WHERE e.owner_id = u.id) AS email_count
         FROM app_users u
         {$where}
         ORDER BY u.created_at DESC
         LIMIT :row_limit"
    );
    foreach ($parameters as $name => $value) {
        $statement->bindValue(':' . $name, $value);
    }
    $statement->bindValue(':row_limit', $limit, PDO::PARAM_INT);
    $statement->execute();

    return ['users' => array_map('admin_public_user', $statement->fetchAll())];
}

function admin_user_detail(string $userId): array
{
    $statement = database()->prepare(
        'SELECT u.id, u.email, u.full_name, u.role, u.email_verified_at, u.last_sign_in_at,
                u.failed_login_count, u.locked_until, u.created_at, u.must_change_password,
                (SELECT COUNT(*) FROM onboarding_plans p WHERE p.owner_id = u.id) AS plan_count,
                (SELECT COUNT(*) FROM onboarding_plans p WHERE p.owner_id = u.id AND p.archived_at IS NULL) AS active_plan_count,
                (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id) AS login_count,
                (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL
                   AND s.expires_at > UTC_TIMESTAMP(3)) AS active_session_count,
                (SELECT COUNT(*) FROM onboarding_email_logs e WHERE e.owner_id = u.id) AS email_count
         FROM app_users u WHERE u.id = :id LIMIT 1'
    );
    $statement->execute(['id' => $userId]);
    $user = $statement->fetch();
    if (!$user) {
        json_response(['error' => 'User not found.'], 404);
    }

    $plans = database()->prepare(
        'SELECT id, title, role, reports_to, collaborates_with, duration_weeks, archived_at, created_at, updated_at
         FROM onboarding_plans WHERE owner_id = :owner_id ORDER BY updated_at DESC LIMIT 100'
    );
    $plans->execute(['owner_id' => $userId]);

    // Each auth_sessions row is one sign-in, so this doubles as the login history.
    $sessions = database()->prepare(
        'SELECT id, created_at, last_seen_at, expires_at, revoked_at
         FROM auth_sessions WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 25'
    );
    $sessions->execute(['user_id' => $userId]);

    $emails = database()->prepare(
        'SELECT id, plan_id, recipient_email, cc_email, status, error_message, created_at
         FROM onboarding_email_logs WHERE owner_id = :owner_id ORDER BY created_at DESC LIMIT 25'
    );
    $emails->execute(['owner_id' => $userId]);

    return [
        'user' => admin_public_user($user),
        'plans' => array_map(static fn (array $row) => admin_public_plan($row), $plans->fetchAll()),
        'sessions' => array_map(static fn (array $row) => [
            'id' => (string) $row['id'],
            'createdAt' => admin_timestamp($row['created_at']),
            'lastSeenAt' => admin_timestamp($row['last_seen_at']),
            'expiresAt' => admin_timestamp($row['expires_at']),
            'revokedAt' => admin_timestamp($row['revoked_at']),
            'isActive' => $row['revoked_at'] === null && utc_strtotime($row['expires_at']) > time(),
        ], $sessions->fetchAll()),
        'emails' => array_map(static fn (array $row) => [
            'id' => (string) $row['id'],
            'planId' => $row['plan_id'] !== null ? (string) $row['plan_id'] : null,
            'recipient' => (string) $row['recipient_email'],
            'cc' => $row['cc_email'] !== null ? (string) $row['cc_email'] : null,
            'status' => (string) $row['status'],
            'error' => $row['error_message'] !== null ? (string) $row['error_message'] : null,
            'createdAt' => admin_timestamp($row['created_at']),
        ], $emails->fetchAll()),
    ];
}

function admin_plan_rows(string $search = '', string $scope = 'all', int $limit = 50): array
{
    $conditions = [];
    $parameters = [];
    if ($search !== '') {
        $conditions[] = '(p.role LIKE :search OR p.title LIKE :search OR u.email LIKE :search OR u.full_name LIKE :search)';
        $parameters['search'] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $search) . '%';
    }
    if ($scope === 'active') {
        $conditions[] = 'p.archived_at IS NULL';
    } elseif ($scope === 'archived') {
        $conditions[] = 'p.archived_at IS NOT NULL';
    }
    $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);

    $statement = database()->prepare(
        "SELECT p.id, p.title, p.role, p.reports_to, p.collaborates_with, p.duration_weeks,
                p.archived_at, p.created_at, p.updated_at,
                u.id AS owner_id, u.email AS owner_email, u.full_name AS owner_name
         FROM onboarding_plans p
         INNER JOIN app_users u ON u.id = p.owner_id
         {$where}
         ORDER BY p.updated_at DESC
         LIMIT :row_limit"
    );
    foreach ($parameters as $name => $value) {
        $statement->bindValue(':' . $name, $value);
    }
    $statement->bindValue(':row_limit', $limit, PDO::PARAM_INT);
    $statement->execute();

    return ['plans' => array_map(static fn (array $row) => admin_public_plan($row), $statement->fetchAll())];
}

function admin_plan_detail(string $planId): array
{
    $statement = database()->prepare(
        'SELECT p.id, p.title, p.role, p.reports_to, p.collaborates_with, p.duration_weeks,
                p.plan_json, p.archived_at, p.created_at, p.updated_at,
                u.id AS owner_id, u.email AS owner_email, u.full_name AS owner_name
         FROM onboarding_plans p
         INNER JOIN app_users u ON u.id = p.owner_id
         WHERE p.id = :id LIMIT 1'
    );
    $statement->execute(['id' => $planId]);
    $row = $statement->fetch();
    if (!$row) {
        json_response(['error' => 'Plan not found.'], 404);
    }
    return ['plan' => admin_public_plan($row, true)];
}

function admin_create_user(array $body): array
{
    $email = normalized_work_email($body['email'] ?? null);
    $password = validate_password($body['password'] ?? null);
    $fullName = is_string($body['full_name'] ?? null) ? trim($body['full_name']) : '';
    $role = ($body['role'] ?? 'member') === 'admin' ? 'admin' : 'member';

    if ($email === null) {
        json_response([
            'error' => 'Enter a valid work email ending in @' . allowed_email_domain() . '.',
            'code' => 'invalid_email',
        ], 422);
    }
    if ($fullName === '' || mb_strlen($fullName) > 160) {
        json_response(['error' => 'Enter a full name of up to 160 characters.', 'code' => 'invalid_name'], 422);
    }
    if ($password === null) {
        json_response(['error' => 'The password must be at least 8 characters.', 'code' => 'invalid_password'], 422);
    }

    $db = database();
    $lookup = $db->prepare('SELECT id FROM app_users WHERE email = :email LIMIT 1');
    $lookup->execute(['email' => $email]);
    if ($lookup->fetchColumn() !== false) {
        json_response(['error' => 'That email already has an OakBoard account.', 'code' => 'email_exists'], 409);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($passwordHash)) {
        throw new RuntimeException('Password hashing failed.');
    }

    // Administrator-created accounts skip the OTP step and are stored already
    // verified, so the person can sign in with these credentials right away.
    // authenticated_user() rejects any account whose email_verified_at is null.
    // must_change_password = 1 so the temporary password set here cannot become
    // the person's permanent one.
    $id = uuid_v4();
    $db->prepare(
        'INSERT INTO app_users (id, email, full_name, role, password_hash, must_change_password, email_verified_at)
         VALUES (:id, :email, :full_name, :role, :password_hash, 1, UTC_TIMESTAMP(3))'
    )->execute([
        'id' => $id,
        'email' => $email,
        'full_name' => mb_substr($fullName, 0, 160),
        'role' => $role,
        'password_hash' => $passwordHash,
    ]);

    return admin_user_detail($id);
}

function admin_target_user(string $userId): array
{
    $statement = database()->prepare('SELECT id, email, full_name, role FROM app_users WHERE id = :id LIMIT 1');
    $statement->execute(['id' => $userId]);
    $target = $statement->fetch();
    if (!$target) {
        json_response(['error' => 'User not found.'], 404);
    }
    return $target;
}

function admin_guard_protected_target(array $target, array $admin, string $verb): void
{
    if (is_root_admin($target)) {
        json_response([
            'error' => "The super administrator account cannot be {$verb}.",
            'code' => 'protected_account',
        ], 403);
    }
    if ((string) $target['id'] === (string) $admin['id']) {
        json_response([
            'error' => "You cannot {$verb} your own administrator account.",
            'code' => 'self_action',
        ], 403);
    }
}

function admin_update_user(string $userId, array $body, array $admin): array
{
    $target = admin_target_user($userId);
    $action = is_string($body['action'] ?? null) ? $body['action'] : '';
    $db = database();

    switch ($action) {
        case 'lock':
            admin_guard_protected_target($target, $admin, 'locked');
            $db->prepare(
                'UPDATE app_users SET locked_until = :locked_until, failed_login_count = 0 WHERE id = :id'
            )->execute(['locked_until' => gmdate('Y-m-d H:i:s', time() + 900), 'id' => $userId]);
            break;

        case 'unlock':
            $db->prepare(
                'UPDATE app_users SET locked_until = NULL, failed_login_count = 0 WHERE id = :id'
            )->execute(['id' => $userId]);
            break;

        case 'revoke-sessions':
            $db->prepare(
                'UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3)
                 WHERE user_id = :user_id AND revoked_at IS NULL'
            )->execute(['user_id' => $userId]);
            break;

        case 'promote':
            $db->prepare("UPDATE app_users SET role = 'admin' WHERE id = :id")->execute(['id' => $userId]);
            break;

        case 'demote':
            admin_guard_protected_target($target, $admin, 'demoted');
            $db->prepare("UPDATE app_users SET role = 'member' WHERE id = :id")->execute(['id' => $userId]);
            break;

        default:
            json_response(['error' => 'A valid administrator action is required.'], 400);
    }

    return admin_user_detail($userId);
}

function admin_delete_user(string $userId, array $admin): array
{
    $target = admin_target_user($userId);
    admin_guard_protected_target($target, $admin, 'deleted');

    // onboarding_plans, auth_sessions, auth_tokens, and onboarding_email_logs
    // all declare ON DELETE CASCADE against app_users, so one statement removes
    // the account and everything it owns.
    database()->prepare('DELETE FROM app_users WHERE id = :id')->execute(['id' => $userId]);
    return ['ok' => true, 'deleted' => $userId];
}

function admin_update_plan(string $planId, array $body): array
{
    $action = is_string($body['action'] ?? null) ? $body['action'] : '';
    if ($action !== 'archive' && $action !== 'restore') {
        json_response(['error' => 'A valid plan action is required.'], 400);
    }

    $statement = database()->prepare(
        'UPDATE onboarding_plans SET archived_at = :archived_at, updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = :id'
    );
    $statement->execute([
        'archived_at' => $action === 'archive' ? gmdate('Y-m-d H:i:s.v') : null,
        'id' => $planId,
    ]);

    return admin_plan_detail($planId);
}

function admin_delete_plan(string $planId): array
{
    $statement = database()->prepare('DELETE FROM onboarding_plans WHERE id = :id');
    $statement->execute(['id' => $planId]);
    if ($statement->rowCount() === 0) {
        json_response(['error' => 'Plan not found.'], 404);
    }
    return ['ok' => true, 'deleted' => $planId];
}
