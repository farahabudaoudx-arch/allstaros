-- Headshot requirement for builders and producers.
--
-- Adds the photo columns to person and creates a PUBLIC storage bucket for the
-- headshots (mirroring the public-bucket pattern). Account status
-- (person.status = 'active' | 'removed') is intentionally left untouched: photo
-- review state is its own thing so a rejected photo never reads as a
-- deactivated account.
--
-- The three allowed review states ('pending','approved','rejected') also live
-- in code (src/lib/headshots/status.ts); the CHECK below is the DB-level guard
-- so a bad value can never be written.

alter table person
  add column if not exists photo_url text,
  add column if not exists photo_review_status text
    check (photo_review_status in ('pending', 'approved', 'rejected')),
  add column if not exists photo_rejection_reason text,
  add column if not exists photo_reviewed_by uuid,
  add column if not exists photo_reviewed_at timestamptz,
  add column if not exists photo_updated_at timestamptz;

-- Public bucket for the stored headshots. Public so the reusable face component
-- can load them anywhere (leaderboard, downline, messaging, admin, profile)
-- without signed URLs.
insert into storage.buckets (id, name, public)
  values ('headshots', 'headshots', true)
  on conflict (id) do nothing;
