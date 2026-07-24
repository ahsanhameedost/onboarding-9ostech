# OakBoard cPanel Production Handoff

This is the only production deployment guide. It applies to:

```text
Repository: mateen9ostech-hash/OakBoard-Employee-Onboarding-Form
Branch: main
Domain: https://onboarding.9ostech.com
Checkout: /home/ostech/public_html/onboarding.9ostech.com
Document root: /home/ostech/public_html/onboarding.9ostech.com/dist
Private config: /home/ostech/oakboard-config.php
```

The change is isolated to the OakBoard subdomain. Do not edit a global Apache
include, another virtual host, or another website.

## 1. One-time database and private configuration

1. Import `database/mysql/schema.sql` into the OakBoard MySQL database.
2. Copy `api/config.example.php` to `/home/ostech/oakboard-config.php`.
3. Add the real MySQL, Mailgun, application, and session-secret values privately.
4. Restrict the file:

```bash
chmod 600 /home/ostech/oakboard-config.php
chown ostech:ostech /home/ostech/oakboard-config.php
```

The private file must never be placed in `public_html` or committed to Git. Rotate
any database or API credential previously shared in chat or screenshots.

Recommended application values:

```php
'app' => [
    'url' => 'https://onboarding.9ostech.com',
    'allowed_email_domain' => '9ostech.com',
],
```

Mailgun must use an active domain and valid sending key. The final sender must be
an address authorized by that Mailgun domain.

## 2. One-time Git and automatic deployment setup

Run:

```bash
cd /home/ostech/public_html/onboarding.9ostech.com
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
git config core.hooksPath .githooks
chmod +x .githooks/post-merge scripts/deploy-production.sh
/bin/bash scripts/deploy-production.sh
```

If `git switch` or `git pull` reports local changes, stop and inspect them. Do not
run `git reset --hard`. Generated files previously copied from `dist/` can be
backed up and removed only after confirming they are not source changes.

In cPanel **Domains**, edit only `onboarding.9ostech.com` and set its document
root to:

```text
/home/ostech/public_html/onboarding.9ostech.com/dist
```

Remove the obsolete Next.js reverse-proxy include for this subdomain only.
OakBoard no longer uses `nextjs.conf`, Passenger, Application Manager, PM2, or a
persistent Node server.

## 3. Every future deployment

```bash
cd /home/ostech/public_html/onboarding.9ostech.com
git pull --ff-only origin main
```

The tracked post-merge hook automatically runs the locked npm install, TypeScript
check, production build, and deployment artifact validation.

If deploying through cPanel Git Version Control, **Deploy HEAD Commit** uses
`.cpanel.yml` and the same script.

Do not run `cp -a dist/. .`. The subdomain serves `dist/` directly.

## 4. Verify after deployment

```bash
curl -I https://onboarding.9ostech.com/sign-in
curl -i https://onboarding.9ostech.com/api/auth/session
```

Expected results:

- `/sign-in` returns the application, not a directory listing.
- Unauthenticated `/api/auth/session` returns JSON with HTTP 401.
- `/src/main.tsx`, `package.json`, and the MySQL schema are not public.

Then test:

- signup and six-digit verification email;
- sign in, recovery email, and sign out;
- two separate users for strict plan isolation;
- create, edit, preview, archive, restore, and permanent delete;
- two-week and four-week PDF download;
- authenticated PDF email attachment;
- refreshed deep links and mobile layout.

## 5. Mailgun troubleshooting

If signup succeeds but no verification email arrives:

1. Open `https://onboarding.9ostech.com/api/auth/session`.
2. If it returns HTML or 404, the `dist/api` PHP application is not being served;
   recheck the document root and rebuild.
3. Confirm PHP cURL is enabled.
4. Confirm the Mailgun domain is active, the key has sending access, and
   `from_email` belongs to that domain.
5. Check Mailgun Events and `email_logs` in MySQL.

The earlier observed production failure was not a Mailgun delivery rejection:
the public `/api` path returned the React application/404, so OakBoard never
reached the Mailgun request code.

## 6. Deployment troubleshooting

```bash
git config --get core.hooksPath
/bin/bash scripts/deploy-production.sh
```

- `core.hooksPath` must output `.githooks`.
- The subdomain document root must end with `/dist`.
- The deployment script must finish without missing-file errors.
- The generated `dist/index.html` must not reference `/src/main.tsx`.
- Review the cPanel Git deployment log under `/home/ostech/.cpanel/logs/`.

Do not restore the old Next.js proxy to fix a React/PHP deployment.

## Rollback

Back up the currently working `dist/` before the first cutover. If acceptance
fails, restore only that backup and the previous document root for
`onboarding.9ostech.com`. Do not change other sites.
