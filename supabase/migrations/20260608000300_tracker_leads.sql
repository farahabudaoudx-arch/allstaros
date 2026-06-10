-- Add `leads` as a first-class daily-tracked field.
--
-- Leads is now punched in by the producer alongside dials/contacts/etc. (on the
-- Daily Tracker and the Add Data modal) and projected on the daily projection —
-- exactly like the other activity counters. It is NOT derived from the
-- lead-purchase log (those are leads *bought*, which may never be received).
--
-- Nullable-with-default add — non-destructive and safe on the shared backend.

alter table tracker_entry
  add column if not exists leads integer not null default 0 check (leads >= 0);

alter table daily_projection
  add column if not exists leads integer not null default 0 check (leads >= 0);
