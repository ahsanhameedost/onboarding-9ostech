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

Never add real credentials to Git, screenshots, chat messages, `.env` files, or the public document root.
