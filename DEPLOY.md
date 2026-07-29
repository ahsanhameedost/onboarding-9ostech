# OakBoard cPanel Deployment (Quick Guide)

This is the short, do-this-and-it-works guide for deploying OakBoard on cPanel.
For the full team handoff (auto `git pull` deploy, rollback, acceptance tests)
see [`TEAMLEAD-CPANEL-GUIDE.md`](TEAMLEAD-CPANEL-GUIDE.md).

OakBoard is a **built React SPA + same-origin PHP 8 API**. Production always
serves the **built `dist/` output**, never the source files.

---

## Why deployments break (read this first)

Three symptoms almost always come from the same handful of causes:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Blank / white page | Uploaded **source** instead of the **built `dist/`** (so `index.html` still points at `/src/main.tsx`) | Upload the built output only (below) |
| `/sign-in` refresh → 404 | The hidden `.htaccess` files were not uploaded | Enable "show hidden files", re-upload `.htaccess` |
| `/api/...` returns 500 or HTML | PHP version too old, or `oakboard-config.php` not found | Set PHP 8.1+, place the config file correctly |
| **Every** API call 500s right after an upgrade | A pending database migration was not run before uploading | Run the migrations first — see [Database migrations](#database-migrations) |

The PHP now fails loudly instead of blank: an old PHP version returns a clear
JSON message, and the config file is searched for **at and above the document
root at any depth**, so nesting no longer matters.

---

## A. Build the upload package

On your machine (Node 20.19–24.x):

```powershell
npm ci
npm run build
```

This produces `dist/` containing `index.html`, `assets/`, both `.htaccess`
files, and the `api/` PHP runtime. A ready-to-upload `oakboard-dist-upload.zip`
can also be created from the contents of `dist/`.

> Verify before uploading: open `dist/index.html` — it must reference
> `/assets/index-*.js`, **not** `/src/main.tsx`.

## B. One-time server setup

1. **Database** — cPanel → phpMyAdmin → select the OakBoard database → import
   `database/mysql/schema.sql`.
2. **Private config** — copy `api/config.example.php`, fill in the real MySQL,
   Mailgun, app URL, and a `session_secret` of **32+ characters**. Save it as
   `oakboard-config.php` in the **home directory** (`/home/USER/oakboard-config.php`),
   outside `public_html`. Then:
   ```bash
   chmod 600 /home/USER/oakboard-config.php
   ```
   Recommended `app` values:
   ```php
   'app' => [
       'url' => 'https://onboarding.9ostech.com',
       'allowed_email_domain' => '9ostech.com',
       // Bootstrap super administrator for the admin console. This account can
       // never be locked, demoted, or deleted from the UI, so admin access
       // cannot be lost. Use a real address you control.
       'super_admin_email' => 'youradmin@9ostech.com',
   ],
   ```
3. **PHP version** — cPanel → **MultiPHP Manager** → set this domain/subdomain
   to **PHP 8.1, 8.2, or 8.3**. Confirm the **curl**, **pdo_mysql**, **mbstring**,
   and **openssl** extensions are enabled (MultiPHP INI Editor / Select PHP
   Version → Extensions).

## C. Upload the built files

1. cPanel → **File Manager** → open the subdomain's **document root**
   (e.g. `.../onboarding.9ostech.com`).
2. File Manager → **Settings** → tick **Show Hidden Files (dotfiles)** so
   `.htaccess` is visible.
3. Upload `oakboard-dist-upload.zip` here and **Extract** it.
   - The **contents** of `dist/` go directly in the document root — you should
     see `index.html`, `api/`, `assets/`, and `.htaccess` at the top level, not
     a nested `dist/` folder.
4. Confirm both hidden `.htaccess` files exist: one at the document root and one
   at `api/.htaccess`.

## D. Verify

```bash
curl -I  https://onboarding.9ostech.com/sign-in
curl -i  https://onboarding.9ostech.com/api/auth/session
```

Expected:

- `/` and `/sign-in` load the app (no blank page, no directory listing).
- `/api/auth/session` returns **JSON** (not HTML/404). Without a session it
  returns HTTP **401** — that is correct.
- `index.html`, `package.json`, `/src`, and the SQL schema are **not** public.

Then test end to end: signup + 6-digit email code, sign in, recovery email,
sign out, create/edit/preview/archive/restore/delete a plan, 2-week and 4-week
PDF download, and emailing a plan PDF.

## E. Admin console

`/admin` shows every account, every onboarding plan with its owner, and
sign-in activity, plus lock/unlock, force sign-out, promote/demote, and delete.

An account is an administrator when **either** is true:

- its email matches `app.super_admin_email` in the private config file — this
  account is protected and can never be locked, demoted, or deleted; or
- its `app_users.role` is `'admin'` — set from the console by an existing
  administrator, or directly in SQL.

The email **must** be on `allowed_email_domain` (`@9ostech.com` by default).
Signup rejects any other domain, so an address outside it can never have an
account and the super admin could never sign in.

To sign in as the super admin, create a normal account with that email through
`/sign-in` and verify it. Administrators land on `/admin` at sign-in and the
**Admin** entry appears in the workspace sidebar.

Administrators can add people directly from the console with **Add user**.
Those accounts skip email verification and are given a temporary password,
which the person must replace the first time they sign in. To promote someone
by hand:

```sql
UPDATE app_users SET role = 'admin' WHERE email = 'someone@9ostech.com';
```

---

## Database migrations

`database/mysql/schema.sql` always describes the **current** structure, so a
**fresh** install (step B1) needs nothing extra.

An **existing** database is upgraded by running the files in
`database/mysql/migrations/` in filename order, once each, in phpMyAdmin.

| Migration | Required for | Adds |
| --- | --- | --- |
| `2026-07-28-add-user-role.sql` | Admin console | `app_users.role` |
| `2026-07-29-add-must-change-password.sql` | Forced password change | `app_users.must_change_password` |

> **Order matters.** Run the migration **before** uploading the new `dist/`.
> The API reads `app_users.role` on every authenticated request, so uploading
> first means **every API call returns 500** until the column exists.

Re-running a migration reports `Duplicate column name` (MySQL error 1060). That
just means it was already applied and is safe to ignore.

---

## Troubleshooting

- **`/api/auth/session` shows a PHP-version message** → MultiPHP Manager, set
  PHP 8.1+ (step B3).
- **500 with "configuration is missing"** → `oakboard-config.php` is not at or
  above the document root, or is misnamed. Re-check step B2. You can also set an
  explicit path with the `OAKBOARD_CONFIG_FILE` environment variable.
- **500 with "configuration is invalid" / MySQL error** → wrong DB credentials
  or the schema was not imported (steps B1/B2).
- **Everything 500s after an upgrade, error log says `Unknown column 'u.role'`**
  → the admin-console migration was not run. Apply
  `database/mysql/migrations/2026-07-28-add-user-role.sql`, then reload. No
  rebuild or re-upload is needed.
- **`/admin` says "Administrator access required"** → the signed-in email does
  not match `app.super_admin_email` and its `app_users.role` is not `'admin'`.
  Re-check step B2 / section E.
- **404 on route refresh** → the document-root `.htaccess` is missing or
  `mod_rewrite` is off. Re-upload hidden files; ensure Apache `mod_rewrite`.
- **No verification email** → confirm PHP **curl** is enabled, the Mailgun
  domain is active, the API key has sending access, and `from_email` belongs to
  that Mailgun domain. Check Mailgun Events and the `onboarding_email_logs`
  table.

## Every future deploy

1. **Check for new migrations first** — if `database/mysql/migrations/` gained a
   file since your last deploy, run it in phpMyAdmin **before** uploading. See
   [Database migrations](#database-migrations).
2. Rebuild locally: `npm run build`.
3. Re-upload/extract the new `dist/` contents over the old ones.

The server config file and database are otherwise untouched.

> Deploying the admin console release for the first time? That is
> `2026-07-28-add-user-role.sql`, plus `super_admin_email` in the private
> config (step B2).
