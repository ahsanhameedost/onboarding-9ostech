-- OakBoard migration: forced password change on first sign-in
--
-- Run this once against an existing OakBoard database BEFORE deploying the
-- release that adds it. A fresh install created from schema.sql already
-- contains the column and does not need this file.
--
-- Existing accounts default to 0, so nobody currently signed in is asked to
-- change anything. Only accounts created by an administrator through the
-- admin console are flagged.
--
-- Re-running reports "Duplicate column name 'must_change_password'"
-- (MySQL error 1060), which means it was already applied and is safe to ignore.
--
-- MySQL 8.0+ / MariaDB 10.6+.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE app_users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash;
