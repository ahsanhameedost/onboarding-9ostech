<?php

declare(strict_types=1);

// Fail with a clear message instead of a blank/500 page when the cPanel domain
// is set to an unsupported PHP version. OakBoard's PHP uses 8.1 syntax, so an
// older interpreter would otherwise abort while parsing bootstrap.php. This
// check runs before that file is loaded, so keep it free of 8.1-only syntax.
if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'OakBoard requires PHP 8.1 or newer. In cPanel open MultiPHP Manager and set this domain to PHP 8.1, 8.2, or 8.3, then reload.',
        'php_version' => PHP_VERSION,
    ]);
    exit;
}

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mailgun.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/admin.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/api'), PHP_URL_PATH) ?: '/api';
    $path = preg_replace('#^/api(?:/index\.php)?#', '', $path) ?? '';
    $segments = array_values(array_filter(explode('/', trim($path, '/')), static fn ($part) => $part !== ''));

    if (($segments[0] ?? '') === 'auth') {
        $action = $segments[1] ?? '';
        if ($action === 'session' && $method === 'GET') {
            json_response(current_auth_session());
        }
        if ($action === 'signup' && $method === 'POST') {
            json_response(signup_user(request_json()), 201);
        }
        if ($action === 'verify' && $method === 'POST') {
            json_response(verify_email_code(request_json()));
        }
        if ($action === 'resend' && $method === 'POST') {
            json_response(resend_verification(request_json()));
        }
        if ($action === 'signin' && $method === 'POST') {
            json_response(signin_user(request_json()));
        }
        if ($action === 'signout' && $method === 'POST') {
            json_response(signout_user());
        }
        if ($action === 'change-password' && $method === 'POST') {
            json_response(change_password(request_json()));
        }
        if ($action === 'password-reset' && $method === 'POST') {
            json_response(request_password_reset(request_json()));
        }
        if ($action === 'password-reset-confirm' && $method === 'POST') {
            json_response(confirm_password_reset(request_json()));
        }
        json_response(['error' => 'Authentication route not found.'], 404);
    }

    $user = authenticated_user();
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        require_csrf($user);
    }

    if (($segments[0] ?? '') === 'admin') {
        require_admin($user);
        $section = $segments[1] ?? '';
        $targetId = $segments[2] ?? null;
        if ($targetId !== null && !valid_uuid($targetId)) {
            json_response(['error' => 'Record not found.'], 404);
        }

        if ($section === 'overview' && $method === 'GET') {
            json_response(admin_overview());
        }

        if ($section === 'users') {
            if ($targetId === null && $method === 'GET') {
                json_response(admin_user_rows(
                    admin_query_string('search'),
                    admin_row_limit($_GET['limit'] ?? null),
                ));
            }
            if ($targetId === null && $method === 'POST') {
                json_response(admin_create_user(request_json()), 201);
            }
            if ($targetId !== null && $method === 'GET') {
                json_response(admin_user_detail($targetId));
            }
            if ($targetId !== null && $method === 'PATCH') {
                json_response(admin_update_user($targetId, request_json(), $user));
            }
            if ($targetId !== null && $method === 'DELETE') {
                json_response(admin_delete_user($targetId, $user));
            }
        }

        if ($section === 'plans') {
            if ($targetId === null && $method === 'GET') {
                json_response(admin_plan_rows(
                    admin_query_string('search'),
                    admin_query_string('scope', 'all'),
                    admin_row_limit($_GET['limit'] ?? null),
                ));
            }
            if ($targetId !== null && $method === 'GET') {
                json_response(admin_plan_detail($targetId));
            }
            if ($targetId !== null && $method === 'PATCH') {
                json_response(admin_update_plan($targetId, request_json()));
            }
            if ($targetId !== null && $method === 'DELETE') {
                json_response(admin_delete_plan($targetId));
            }
        }

        json_response(['error' => 'Administrator route not found.'], 404);
    }

    // Lets the plan editor show the address the PDF will actually be sent from
    // instead of a hard-coded one. Sits behind authenticated_user() so the
    // configured sender is never exposed anonymously.
    if (($segments[0] ?? '') === 'email' && ($segments[1] ?? '') === 'sender' && $method === 'GET') {
        $mailgun = mailgun_config();
        json_response([
            'from_email' => $mailgun['from_email'],
            'from_name' => trim((string) $mailgun['from_name']),
        ]);
    }

    if (($segments[0] ?? '') === 'email' && ($segments[1] ?? '') === 'plan' && $method === 'POST') {
        $body = request_json();
        try {
            $to = valid_email_list($body['to'] ?? null);
            $cc = isset($body['cc']) && $body['cc'] !== '' ? valid_email_list($body['cc']) : [];
            $subject = mb_substr(trim((string) ($body['subject'] ?? '')), 0, 180);
            $text = mb_substr(trim((string) ($body['text'] ?? '')), 0, 8_000);
            $attachment = is_array($body['attachment'] ?? null) ? $body['attachment'] : null;
            $planId = is_string($body['plan_id'] ?? null) ? $body['plan_id'] : null;

            if ($subject === '' || $text === '' || $attachment === null) {
                json_response(['error' => 'Email subject, message, and PDF attachment are required.'], 422);
            }
            if ($planId !== null) {
                if (!valid_uuid($planId)) {
                    json_response(['error' => 'Plan not found.'], 404);
                }
                $planStatement = database()->prepare(
                    'SELECT 1 FROM onboarding_plans WHERE id = :id AND owner_id = :owner_id LIMIT 1'
                );
                $planStatement->execute(['id' => $planId, 'owner_id' => $user['id']]);
                if (!$planStatement->fetchColumn()) {
                    json_response(['error' => 'Plan not found.'], 404);
                }
            }

            $safeText = nl2br(htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
            $result = mailgun_send([
                'to' => $to,
                'cc' => $cc,
                'subject' => $subject,
                'text' => $text,
                'html' => email_shell('Your onboarding plan is ready', '<p style="margin:0;font-size:15px;line-height:1.7;color:#45534a;">' . $safeText . '</p>'),
                'attachment' => $attachment,
                'tag' => 'onboarding-plan',
            ]);
            database()->prepare(
                'INSERT INTO onboarding_email_logs
                 (id, owner_id, plan_id, recipient_email, cc_email, provider, provider_message_id, status)
                 VALUES (:id, :owner_id, :plan_id, :recipient, :cc, \'mailgun\', :provider_id, \'sent\')'
            )->execute([
                'id' => uuid_v4(),
                'owner_id' => $user['id'],
                'plan_id' => $planId,
                // recipient_email and cc_email are VARCHAR(320); valid_email_list
                // allows up to five addresses, so the joined list can overrun the
                // column and abort the request after Mailgun already accepted it.
                'recipient' => mb_substr(implode(',', $to), 0, 320),
                'cc' => $cc === [] ? null : mb_substr(implode(',', $cc), 0, 320),
                'provider_id' => $result['id'],
            ]);
            json_response(['ok' => true, 'id' => $result['id']]);
        } catch (InvalidArgumentException $error) {
            json_response(['error' => $error->getMessage()], 422);
        } catch (Throwable $error) {
            error_log('OakBoard plan email failed: ' . $error->getMessage());
            try {
                database()->prepare(
                    'INSERT INTO onboarding_email_logs
                     (id, owner_id, plan_id, recipient_email, cc_email, provider, status, error_message)
                     VALUES (:id, :owner_id, :plan_id, :recipient, :cc, \'mailgun\', \'failed\', :error)'
                )->execute([
                    'id' => uuid_v4(),
                    'owner_id' => $user['id'],
                    'plan_id' => isset($planId) && is_string($planId) && valid_uuid($planId) ? $planId : null,
                    'recipient' => isset($to) && is_array($to) ? mb_substr(implode(',', $to), 0, 320) : 'invalid',
                    'cc' => isset($cc) && is_array($cc) && $cc !== [] ? mb_substr(implode(',', $cc), 0, 320) : null,
                    'error' => mb_substr($error->getMessage(), 0, 1_000),
                ]);
            } catch (Throwable $logError) {
                error_log('OakBoard email log failure: ' . $logError->getMessage());
            }
            json_response(['error' => 'Email could not be sent. Check Mailgun domain verification and try again.'], 502);
        }
    }

    if (($segments[0] ?? '') !== 'plans') {
        json_response(['error' => 'API route not found.'], 404);
    }

    $planId = $segments[1] ?? null;
    if ($planId !== null && !valid_uuid($planId)) {
        json_response(['error' => 'Plan not found.'], 404);
    }

    if ($planId === null && $method === 'GET') {
        $archived = ($_GET['archived'] ?? '') === 'true';
        $defaultLimit = $archived ? 20 : 8;
        $limit = min(max((int) ($_GET['limit'] ?? $defaultLimit), 1), 50);
        $archiveClause = $archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL';
        $statement = database()->prepare(
            "SELECT id, title, role, duration_weeks, updated_at, plan_json
             FROM onboarding_plans
             WHERE owner_id = :owner_id AND {$archiveClause}
             ORDER BY updated_at DESC
             LIMIT :plan_limit"
        );
        $statement->bindValue(':owner_id', $user['id']);
        $statement->bindValue(':plan_limit', $limit, PDO::PARAM_INT);
        $statement->execute();
        json_response(['plans' => array_map('saved_plan', $statement->fetchAll())]);
    }

    if ($planId === null && $method === 'POST') {
        $body = request_json();
        $plan = normalized_plan($body['plan'] ?? null);
        if ($plan === null) {
            json_response(['error' => 'A valid onboarding plan is required.'], 400);
        }

        $id = uuid_v4();
        $role = $plan['role'];
        $weeks = (int) $plan['nWeeks'];
        $reports = trim((string) ($plan['reportsTo'] ?? $plan['reports'] ?? ''));
        $collaborates = trim((string) ($plan['collaboratesWith'] ?? $plan['collab'] ?? ''));
        $statement = database()->prepare(
            'INSERT INTO onboarding_plans
             (id, owner_id, title, role, reports_to, collaborates_with, duration_weeks, plan_json)
             VALUES (:id, :owner_id, :title, :role, :reports_to, :collaborates_with, :weeks, :plan_json)'
        );
        $statement->execute([
            'id' => $id,
            'owner_id' => $user['id'],
            'title' => $role,
            'role' => $role,
            'reports_to' => mb_substr($reports, 0, 160),
            'collaborates_with' => mb_substr($collaborates, 0, 255),
            'weeks' => $weeks,
            'plan_json' => json_encode($plan, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
        $planId = $id;
        $method = 'GET_CREATED';
    }

    if ($planId !== null && in_array($method, ['GET', 'GET_CREATED'], true)) {
        $statement = database()->prepare(
            'SELECT id, title, role, duration_weeks, updated_at, plan_json
             FROM onboarding_plans
             WHERE id = :id AND owner_id = :owner_id
             LIMIT 1'
        );
        $statement->execute(['id' => $planId, 'owner_id' => $user['id']]);
        $row = $statement->fetch();
        if (!$row) {
            json_response(['error' => 'Plan not found.'], 404);
        }
        json_response(['plan' => saved_plan($row)], $method === 'GET_CREATED' ? 201 : 200);
    }

    if ($planId !== null && $method === 'PATCH') {
        $body = request_json();
        $action = $body['action'] ?? null;
        if ($action === 'archive' || $action === 'restore') {
            $statement = database()->prepare(
                'UPDATE onboarding_plans
                 SET archived_at = :archived_at, updated_at = CURRENT_TIMESTAMP(3)
                 WHERE id = :id AND owner_id = :owner_id'
            );
            $statement->execute([
                'archived_at' => $action === 'archive' ? gmdate('Y-m-d H:i:s.v') : null,
                'id' => $planId,
                'owner_id' => $user['id'],
            ]);
            if ($statement->rowCount() === 0) {
                $exists = database()->prepare(
                    'SELECT 1 FROM onboarding_plans WHERE id = :id AND owner_id = :owner_id'
                );
                $exists->execute(['id' => $planId, 'owner_id' => $user['id']]);
                if (!$exists->fetchColumn()) {
                    json_response(['error' => 'Plan not found.'], 404);
                }
            }
            json_response(['ok' => true]);
        }

        $plan = normalized_plan($body['plan'] ?? null);
        if ($plan === null) {
            json_response(['error' => 'A valid action or onboarding plan is required.'], 400);
        }
        $role = $plan['role'];
        $reports = trim((string) ($plan['reportsTo'] ?? $plan['reports'] ?? ''));
        $collaborates = trim((string) ($plan['collaboratesWith'] ?? $plan['collab'] ?? ''));
        $statement = database()->prepare(
            'UPDATE onboarding_plans
             SET title = :title, role = :role, reports_to = :reports_to,
                 collaborates_with = :collaborates_with, duration_weeks = :weeks,
                 plan_json = :plan_json, updated_at = CURRENT_TIMESTAMP(3)
             WHERE id = :id AND owner_id = :owner_id'
        );
        $statement->execute([
            'title' => $role,
            'role' => $role,
            'reports_to' => mb_substr($reports, 0, 160),
            'collaborates_with' => mb_substr($collaborates, 0, 255),
            'weeks' => (int) $plan['nWeeks'],
            'plan_json' => json_encode($plan, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'id' => $planId,
            'owner_id' => $user['id'],
        ]);
        if ($statement->rowCount() === 0) {
            $exists = database()->prepare('SELECT 1 FROM onboarding_plans WHERE id = :id AND owner_id = :owner_id');
            $exists->execute(['id' => $planId, 'owner_id' => $user['id']]);
            if (!$exists->fetchColumn()) {
                json_response(['error' => 'Plan not found.'], 404);
            }
        }
        $method = 'GET';
    }

    if ($planId !== null && $method === 'DELETE') {
        $statement = database()->prepare(
            'DELETE FROM onboarding_plans WHERE id = :id AND owner_id = :owner_id'
        );
        $statement->execute(['id' => $planId, 'owner_id' => $user['id']]);
        if ($statement->rowCount() === 0) {
            json_response(['error' => 'Plan not found.'], 404);
        }
        json_response(['ok' => true]);
    }

    if ($planId !== null && $method === 'GET') {
        $statement = database()->prepare(
            'SELECT id, title, role, duration_weeks, updated_at, plan_json
             FROM onboarding_plans WHERE id = :id AND owner_id = :owner_id LIMIT 1'
        );
        $statement->execute(['id' => $planId, 'owner_id' => $user['id']]);
        $row = $statement->fetch();
        if (!$row) {
            json_response(['error' => 'Plan not found.'], 404);
        }
        json_response(['plan' => saved_plan($row)]);
    }

    json_response(['error' => 'Method not allowed.'], 405);
} catch (Throwable $error) {
    error_log('OakBoard API failure: ' . $error->getMessage());
    json_response(['error' => 'OakBoard could not complete this request.'], 500);
}
