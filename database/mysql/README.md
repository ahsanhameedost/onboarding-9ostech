# OakBoard MySQL Database

This directory contains OakBoard's complete cPanel MySQL schema. The first deployment has no legacy users or plans to import.

## Requirements

- MySQL 8.0+ or MariaDB 10.6+
- InnoDB, `utf8mb4`, and JSON support
- PHP 8.1+ with PDO MySQL and cURL

## Setup

1. Import `schema.sql` using phpMyAdmin or the MySQL CLI.
2. Create `/home/CPANEL_USER/oakboard-config.php` from `api/config.example.php`.
3. Add the private database, session, and Mailgun values.
4. Build the app and deploy only `dist/`.
5. Test signup, OTP, recovery, owner isolation, CRUD, PDF, and email.

MySQL is the system of record for users, password hashes, sessions, one-time tokens, plans, and email logs. Passwords use PHP's password API; raw passwords and raw session tokens are never stored.

## Migrations

`schema.sql` always describes the current structure, so a fresh import needs
nothing else. An **existing** database is upgraded by running the files in
`migrations/` in filename order, once each, before deploying the release that
needs them.

| Migration | Required for |
| --- | --- |
| `2026-07-28-add-user-role.sql` | Admin console. Adds `app_users.role`. |
| `2026-07-29-add-must-change-password.sql` | Forced password change for administrator-created accounts. Adds `app_users.must_change_password`. |

The admin console reads `app_users.role` on every authenticated request, so run
this migration **before** deploying that release or every API call will fail.

Never add real credentials to Git, screenshots, chat messages, `.env` files, or the public document root.
