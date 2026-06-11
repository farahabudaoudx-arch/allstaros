-- Add an internal/private notes field to clients.
--
-- This replaces the dedicated SSN + bank/credit-card columns in the app UI:
-- producers now jot any sensitive detail here instead. This field is internal
-- only and is NEVER rendered on the client-facing policy summary PDF.
--
-- Nullable add — non-destructive and safe on the shared backend. The legacy
-- ssn / bank_* / cc_* / payment_method columns are left in place for now and
-- dropped in a later cleanup once confirmed unused by the Agency app.

alter table clients
  add column if not exists private_notes text;
