<?php

declare(strict_types=1);

// Copy this file to /home/CPANEL_USER/oakboard-config.php and chmod it to 600.
// Never place the real file inside public_html or commit real credentials.
return [
    'mysql' => [
        'host' => 'localhost',
        'port' => 3306,
        'database' => 'cpanelprefix_oakboard',
        'username' => 'cpanelprefix_oakboard_user',
        'password' => 'replace_with_a_private_password',
    ],
    'app' => [
        'url' => 'https://onboarding.example.com',
        'allowed_email_domain' => '9ostech.com',
    ],
    'security' => [
        'session_secret' => 'replace_with_at_least_32_random_characters',
    ],
    'mailgun' => [
        'api_key' => 'replace_with_a_private_mailgun_key',
        'domain' => 'osdevlabs.com',
        'region' => 'us',
        'from_email' => 'onboarding@osdevlabs.com',
        'from_name' => 'OakBoard',
        'reply_to' => 'support@9ostech.com',
    ],
];
