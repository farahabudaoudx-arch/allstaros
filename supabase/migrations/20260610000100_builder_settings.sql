-- Builder-only settings, set from producer Settings → "Builder details".
--   admin_email          — the builder's Xcel Solutions admin email.
--   xcel_code            — the builder's Xcel Solutions code.
--   discord_webhook_url  — channel webhook used to ping the team when a new
--                          client is signed (the auto-post wiring lands later).
-- person has no client-side write policy; these are written service-role from
-- the /api/producer/profile route, pinned to the authenticated person.

alter table person add column if not exists admin_email text;
alter table person add column if not exists xcel_code text;
alter table person add column if not exists discord_webhook_url text;
