<?php

declare(strict_types=1);

function mailgun_config(): array
{
    $config = oakboard_config()['mailgun'] ?? null;
    if (!is_array($config)) {
        throw new RuntimeException('Mailgun configuration is missing.');
    }

    foreach (['api_key', 'domain', 'from_email', 'from_name'] as $required) {
        if (!isset($config[$required]) || !is_string($config[$required]) || trim($config[$required]) === '') {
            throw new RuntimeException('Mailgun configuration is incomplete.');
        }
    }

    $domain = mb_strtolower(trim($config['domain']));
    $fromEmail = mb_strtolower(trim($config['from_email']));
    if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Mailgun sender address is invalid.');
    }
    if (!str_ends_with($fromEmail, '@' . $domain)) {
        throw new RuntimeException('Mailgun sender address must match the configured sending domain.');
    }

    $region = mb_strtolower(trim((string) ($config['region'] ?? 'us')));
    if (!in_array($region, ['us', 'eu'], true)) {
        throw new RuntimeException('Mailgun region must be either us or eu.');
    }

    $config['domain'] = $domain;
    $config['from_email'] = $fromEmail;
    $config['region'] = $region;
    $config['api_base_url'] = $region === 'eu'
        ? 'https://api.eu.mailgun.net'
        : 'https://api.mailgun.net';
    return $config;
}

function valid_email_list(mixed $value, int $maximum = 5): array
{
    $values = is_array($value) ? $value : [$value];
    $emails = [];
    foreach ($values as $candidate) {
        if (!is_string($candidate)) {
            continue;
        }
        foreach (preg_split('/[,;]/', $candidate) ?: [] as $part) {
            $email = mb_strtolower(trim($part));
            if ($email === '') {
                continue;
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('One or more email addresses are invalid.');
            }
            $emails[$email] = true;
        }
    }

    $result = array_keys($emails);
    if ($result === [] || count($result) > $maximum) {
        throw new InvalidArgumentException('Provide between 1 and ' . $maximum . ' valid email addresses.');
    }
    return $result;
}

function mailgun_logo_url(): string
{
    $appUrl = rtrim((string) (oakboard_config()['app']['url'] ?? ''), '/');
    $host = mb_strtolower((string) parse_url($appUrl, PHP_URL_HOST));

    if ($appUrl === '' || in_array($host, ['127.0.0.1', 'localhost'], true)) {
        $appUrl = 'https://onboarding.9ostech.com';
    }

    return $appUrl . '/oakboard-email-logo.png';
}

function email_shell(string $title, string $content): string
{
    $logoUrl = htmlspecialchars(mailgun_logo_url(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $logo = '<img src="' . $logoUrl . '" alt="Oak Street Technologies" width="62" height="62" '
        . 'style="display:block;margin:0 auto 12px;width:62px;height:62px;object-fit:contain;">';

    return '<!doctype html><html><body style="margin:0;background:#f1f5f1;padding:32px 16px;">'
        . '<div style="max-width:560px;margin:0 auto;font-family:Raleway,Arial,sans-serif;color:#142018;">'
        . '<div style="overflow:hidden;border:1px solid #c9d8cc;border-radius:18px;background:#ffffff;box-shadow:0 16px 44px rgba(5,39,19,.12);">'
        . '<div style="padding:28px 32px;text-align:center;background:#102b1d;border-bottom:1px solid #2f6544;">'
        . $logo
        . '<div style="font-size:24px;font-weight:700;color:#ffffff;">OakBoard</div>'
        . '<div style="margin-top:5px;font-size:13px;color:#b9d4c2;">Oak Street Technologies onboarding plans</div>'
        . '</div>'
        . '<div style="padding:32px;">'
        . '<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:600;color:#142018;">'
        . htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
        . '</h1>'
        . $content
        . '</div>'
        . '<div style="padding:16px 32px;border-top:1px solid #dfe8e1;text-align:center;font-size:12px;color:#66756b;">'
        . '© 2026 Oak Street Technologies · OakBoard'
        . '</div></div></div></body></html>';
}

function mailgun_send(array $message): array
{
    $config = mailgun_config();
    $recipients = valid_email_list($message['to'] ?? null);
    $cc = [];
    if (isset($message['cc']) && $message['cc'] !== '' && $message['cc'] !== []) {
        $cc = valid_email_list($message['cc']);
    }

    $subject = trim((string) ($message['subject'] ?? ''));
    $text = trim((string) ($message['text'] ?? ''));
    $html = trim((string) ($message['html'] ?? ''));
    if ($subject === '' || mb_strlen($subject) > 180 || ($text === '' && $html === '')) {
        throw new InvalidArgumentException('Email subject or message content is invalid.');
    }

    $fields = [
        'from' => trim($config['from_name']) . ' <' . $config['from_email'] . '>',
        'to' => implode(',', $recipients),
        'subject' => $subject,
        'text' => $text,
    ];
    if ($cc !== []) {
        $fields['cc'] = implode(',', $cc);
    }
    if ($html !== '') {
        $fields['html'] = $html;
    }
    $replyTo = trim((string) ($config['reply_to'] ?? ''));
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $fields['h:Reply-To'] = $replyTo;
    }

    $temporaryAttachment = null;
    $attachment = $message['attachment'] ?? null;
    if (is_array($attachment)) {
        $filename = preg_replace('/[^A-Za-z0-9._-]/', '-', basename((string) ($attachment['filename'] ?? 'OakBoard-plan.pdf')));
        $encoded = preg_replace('/\s+/', '', (string) ($attachment['content'] ?? ''));
        $binary = base64_decode($encoded, true);
        if ($filename === '' || $binary === false || strlen($binary) > 8_000_000 || !str_starts_with($binary, '%PDF-')) {
            throw new InvalidArgumentException('The PDF attachment is invalid or too large.');
        }
        $temporaryAttachment = tempnam(sys_get_temp_dir(), 'oakboard-pdf-');
        if ($temporaryAttachment === false || file_put_contents($temporaryAttachment, $binary, LOCK_EX) === false) {
            throw new RuntimeException('The PDF attachment could not be prepared.');
        }
        $fields['attachment'] = new CURLFile($temporaryAttachment, 'application/pdf', $filename);
    }

    $url = $config['api_base_url'] . '/v3/' . rawurlencode($config['domain']) . '/messages';
    $curl = curl_init($url);
    if ($curl === false) {
        if ($temporaryAttachment !== null) {
            @unlink($temporaryAttachment);
        }
        throw new RuntimeException('Mailgun request could not be initialized.');
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $fields,
        CURLOPT_USERPWD => 'api:' . $config['api_key'],
        CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);
    if ($temporaryAttachment !== null) {
        @unlink($temporaryAttachment);
    }

    if ($response === false) {
        error_log('OakBoard Mailgun transport failure: ' . $curlError);
        throw new RuntimeException('Email delivery service is temporarily unavailable.');
    }

    $decoded = json_decode($response, true);
    if ($status < 200 || $status >= 300) {
        $providerMessage = is_array($decoded) && is_string($decoded['message'] ?? null)
            ? $decoded['message']
            : 'HTTP ' . $status;
        error_log('OakBoard Mailgun rejection: ' . mb_substr($providerMessage, 0, 500));
        throw new RuntimeException('Mailgun rejected the email request. Check domain verification and sender settings.');
    }

    return [
        'id' => is_array($decoded) && is_string($decoded['id'] ?? null) ? $decoded['id'] : null,
        'message' => is_array($decoded) && is_string($decoded['message'] ?? null) ? $decoded['message'] : 'Queued',
    ];
}

function send_verification_email(string $email, string $code): array
{
    $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $content = '<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#45534a;">'
        . 'Enter this six-digit verification code in OakBoard to activate your work account.</p>'
        . '<div style="margin:22px 0;padding:20px;border:1px solid #9fd2ad;border-radius:12px;background:#eefaf1;text-align:center;'
        . 'font-family:Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:9px;color:#176b31;">'
        . $safeCode . '</div>'
        . '<p style="margin:0;font-size:13px;line-height:1.6;color:#6a776e;">The code expires in 10 minutes. '
        . 'If you did not request this account, you can safely ignore this email.</p>';

    return mailgun_send([
        'to' => $email,
        'subject' => 'Verify your OakBoard account',
        'text' => "Your OakBoard verification code is {$code}. It expires in 10 minutes.",
        'html' => email_shell('Verify your work email', $content),
    ]);
}

function send_password_reset_email(string $email, string $resetUrl): array
{
    $safeUrl = htmlspecialchars($resetUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $content = '<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#45534a;">'
        . 'We received a request to reset your OakBoard password.</p>'
        . '<p style="margin:0 0 24px;"><a href="' . $safeUrl . '" '
        . 'style="display:inline-block;padding:13px 22px;border-radius:9px;background:#2f7d3d;color:#ffffff;'
        . 'font-size:14px;font-weight:600;text-decoration:none;">Reset password</a></p>'
        . '<p style="margin:0;font-size:13px;line-height:1.6;color:#6a776e;">This link expires in 30 minutes. '
        . 'If you did not request it, no action is required.</p>';

    return mailgun_send([
        'to' => $email,
        'subject' => 'Reset your OakBoard password',
        'text' => "Reset your OakBoard password using this link (valid for 30 minutes): {$resetUrl}",
        'html' => email_shell('Reset your password', $content),
    ]);
}
