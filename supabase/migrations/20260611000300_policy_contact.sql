-- Split the producer's "account" identity from the "policy info" contact that
-- prints on the client policy summary.
--
-- Until now person.full_name/email/phone served double duty: the login account
-- AND the contact clients see under "Your Client Coverage Specialist". Producers
-- whose account is run by an admin (or who give clients a different callback
-- number) need these to differ. The policy summary now uses these override
-- fields, falling back to the account fields when they're blank.
--
-- Nullable adds — non-destructive and safe on the shared backend.

alter table person
  add column if not exists policy_contact_name  text,
  add column if not exists policy_contact_email text,
  add column if not exists policy_contact_phone text;
