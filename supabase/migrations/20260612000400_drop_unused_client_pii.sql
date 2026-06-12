-- Data minimization: drop unused sensitive columns from clients.
--
-- These were never wired into the app — verified 2026-06-12, zero references in
-- application code (no read, no write, no display; the client form has no SSN /
-- bank / card inputs). They sat as a pure PII liability (SSN, bank routing /
-- account, full card incl. CVV) on a Supabase backend shared with the Agency
-- app. Removing them shrinks the breach surface to only the PII the app uses.
--
-- IRREVERSIBLE: dropping a column permanently deletes any legacy values it held.
-- That's the intent here (purge stale PII). The app stores none of these today.

alter table clients
  drop column if exists ssn,
  drop column if exists bank_name,
  drop column if exists routing_number,
  drop column if exists account_number,
  drop column if exists cc_name,
  drop column if exists cc_number,
  drop column if exists cc_expiry,
  drop column if exists cc_cvv,
  drop column if exists payment_method;
