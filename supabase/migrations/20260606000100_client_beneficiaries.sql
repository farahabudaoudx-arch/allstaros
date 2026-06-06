-- Add beneficiary details to clients.
-- Stored as a jsonb array (mirrors the `quotes` column pattern) so a client can
-- have any number of beneficiaries without a separate table. Each element:
--   { "name": text, "relationship": text, "email": text, "phone": text }
-- The client form writes this directly via PostgREST, so the column must exist
-- before the beneficiaries UI can save.

alter table clients
  add column if not exists beneficiaries jsonb not null default '[]'::jsonb;
