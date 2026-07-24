# OakBoard Employee Onboarding Plans

OakBoard creates, stores, previews, exports, and emails role-specific onboarding plans.

## Production architecture

```text
React + TypeScript SPA
  -> same-origin PHP 8 REST API
  -> cPanel MySQL / MariaDB
  -> Mailgun for OTP, recovery, and PDF email
```

There is no Supabase, PostgreSQL, Next.js, Passenger, Node server, or `nextjs.conf`
dependency in production. Authentication is owned by OakBoard. Password hashes,
OTPs, reset tokens, sessions, plans, and email logs are stored in MySQL. Every plan
query is scoped to the authenticated owner.

## Requirements

Development:

- Node.js 20.19–24.x, npm 10–11, Git, and a modern browser.
- PHP 8.1+ for local API testing.

Production:

- Apache with `.htaccess` and `mod_rewrite`.
- PHP 8.1+ with PDO MySQL, cURL, mbstring, JSON, and OpenSSL.
- MySQL 8.0+ or MariaDB 10.6+ with InnoDB and `utf8mb4`.
- HTTPS for `onboarding.9ostech.com`.

## New computer setup

```powershell
cd "C:\Users\Mateen\OneDrive - Oak Street Technologies\M. Mateen Shahid Files - Design Team\Projects\Coding"
git clone https://github.com/mateen9ostech-hash/OakBoard-Employee-Onboarding-Form.git
cd .\OakBoard-Employee-Onboarding-Form
npm ci
npm run dev
```

Open <http://127.0.0.1:3000/sign-in>.

The frontend defaults to same-origin `/api`. `.env.local` is optional and may
contain browser-public overrides only:

```env
VITE_API_BASE_URL=/api
VITE_SITE_URL=http://127.0.0.1:3000
```

Never place MySQL, Mailgun, session, or SMTP secrets in a Vite environment file.

## Full local API testing

Create a private PHP configuration from `api/config.example.php`. Keep it outside
the repository, then start the two processes in separate terminals:

```powershell
$env:OAKBOARD_CONFIG_FILE = "C:\private\oakboard-config.php"
npm run dev:api
```

```powershell
npm run dev
```

The PHP API runs at `127.0.0.1:8080`; Vite proxies `/api` to it.

## Validate a change

```powershell
npm run php:check
npm run typecheck
npm run lint
npm run build
npm audit
```

`npm run build` creates `dist/`, including the React application, route fallback
configuration, logo, and PHP API. Production serves `dist/` directly.

## Routes

| URL | Purpose |
| --- | --- |
| `/` | Public product page |
| `/sign-in` | Sign in, signup, OTP, and recovery |
| `/workspace` | Authenticated dashboard |
| `/plans/new` | New-plan workflow |
| `/plans/archived` | Archived plans |
| `/plans/{id}` | Owner-scoped preview and export |
| `/plans/{id}/edit` | Owner-scoped plan editor |

## Security

- Production secrets belong in `/home/ostech/oakboard-config.php`, outside
  `public_html`, with mode `600`.
- Database access uses PDO prepared statements.
- Session cookies are HTTP-only and state-changing requests require CSRF tokens.
- The checked-in files contain no production password or private API key.
- Rotate any credential previously shared in chat, screenshots, or shell history.

## Production handoff

The complete one-time cPanel setup, automatic `git pull` deployment, private
configuration, acceptance tests, and troubleshooting steps are in
[`TEAMLEAD-CPANEL-GUIDE.md`](TEAMLEAD-CPANEL-GUIDE.md).

The MySQL schema and database notes are in
[`database/mysql/README.md`](database/mysql/README.md).
