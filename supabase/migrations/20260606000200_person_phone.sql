-- Add a phone number to person profiles.
-- Used as the producer's contact phone on the downloadable policy summary
-- (the "Your Client Coverage Specialist" block), set from producer Settings.
-- full_name and email already exist on person.

alter table person
  add column if not exists phone text;
