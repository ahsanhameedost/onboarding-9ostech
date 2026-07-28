-- OakBoard migration: administrator role on app_users
--
-- Run this once against an existing OakBoard database BEFORE deploying the
-- release that adds the admin console. A fresh install created from
-- schema.sql already contains the column and does not need this file.
--
-- Re-running reports "Duplicate column name 'role'" (MySQL error 1060), which
-- means the migration was already applied and can be ignored safely.
--
-- MySQL 8.0+ / MariaDB 10.6+.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE app_users
  ADD COLUMN role ENUM('member', 'admin') NOT NULL DEFAULT 'member' AFTER full_name;

ALTER TABLE app_users
  ADD KEY app_users_role_idx (role);

-- Optional: promote an existing account to administrator. The account named by
-- super_admin_email in the private config file is always an administrator and
-- does not need this statement.
--
-- UPDATE app_users SET role = 'admin' WHERE email = 'someone@9ostech.com';
