# Recruit Onboarding — from builder link to first login

This document explains how a brand-new recruit gets into All Star OS: the
builder shares a personal link, the recruit fills out a short signup form, and
they land in the recruit portal — permanently attached to that builder's
organization.

If you only read one thing: **a recruit's place in the org is set by
`person.upline_id`, which is stamped to the inviting builder at signup. Every
visibility rule in the app walks that chain.**

---

## The big picture

```
Builder                     Recruit                         System
───────                     ───────                         ──────
Copies their signup link
  /join/<code>      ─────▶  Opens the link
                            Fills 4 cards:
                              name, email, phone, state
                            Clicks "Create account"  ─────▶ Creates person (upline = builder)
                                                            Creates recruit (builder_id = builder)
                                                            Sends magic-link email
                            Sees welcome/tour card
                            Clicks "Get started"      ─────▶ Goes to sign-in
                            Opens email, clicks link  ─────▶ Links auth user ↔ person
                                                            Lands in /portal (recruit journey)
```

---

## Step 1 — The builder's personal link

Every builder has a **unique referral code**. Their signup link is:

```
https://<app-url>/join/<code>      e.g.  /join/02693ccb2c
```

Builders find and copy this on **Producer → Recruiting**, in the "Your signup
link" banner (the Copy button is `CopyLink.tsx`).

### Where the code comes from

Codes live in their own table, `builder_referral`:

| column       | meaning                                         |
| ------------ | ----------------------------------------------- |
| `builder_id` | FK → `person.id` (one row per builder)          |
| `code`       | unique 10-character string used in the URL      |
| `created_at` | timestamp                                       |

- Existing builders were given a code by the migration's backfill.
- A builder who is promoted later gets a code **lazily** the first time their
  Recruiting page loads, via `getOrCreateReferralCode()` in `src/lib/referral.ts`.
- The code is a random 10-char base36 string. It is **not** a security secret —
  it just needs to be unique and non-obvious. Anyone with the link can sign up
  under that builder, which is the intent (it's a recruiting link).

> **Why a code instead of the builder's UUID?** A short code keeps the link
> clean and shareable and avoids exposing the internal `person.id` in a URL.

---

## Step 2 — The recruit opens the link

Route: `src/app/join/[code]/page.tsx` (server component).

1. It calls `resolveBuilderByCode(code)` (`src/lib/referral.ts`), which uses the
   **service-role** Supabase client so it works for a logged-out visitor.
2. That looks up `builder_referral` → `person`, and confirms the owner is still
   an **active builder**.
3. If the code is unknown / inactive → **404**. Otherwise it renders the signup
   wizard with the builder's name ("You were invited by …").

`/join` is whitelisted as a **public route** in `src/lib/supabase/middleware.ts`,
so the recruit doesn't get bounced to sign-in before they have an account.

---

## Step 3 — The signup form (the wizard)

Component: `src/app/join/[code]/JoinWizard.tsx` (client). It presents one card at
a time:

1. **Name** — first + last
2. **Email**
3. **Phone** — must contain at least 10 digits
4. **State** — dropdown of US states (`src/lib/us-states.ts`)

Each step validates before "Continue" enables. The final step's button says
**Create account** and calls the server action.

---

## Step 4 — Creating the account

Server action: `signUpViaReferral()` in `src/lib/actions/recruit-signup.ts`.

It runs with the service-role client (no logged-in user yet) and:

1. **Re-validates** every field server-side (never trusts the browser).
2. **Re-resolves the builder** from the code — the code is the source of truth
   for who the recruit belongs to.
3. **De-dupes by email** — if a `person` with that email already exists, it
   returns a friendly "account already exists, sign in instead" error.
4. **Inserts the `person` row:**
   - `full_name` = first + last
   - `email`
   - `upline_id` = **the builder** ← this is the tagging that matters
   - `is_builder` / `is_producer` = false
5. **Inserts the `recruit` row:**
   - `person_id` = the new person
   - `builder_id` = **the builder** (redundant with `upline_id`, but explicit)
   - `phase` = `licensing` (the first stage of the recruit journey)
   - `phone`, `state`
   - If this insert fails, the orphaned `person` row is rolled back.
6. **Sends a Supabase magic-link invite** to the recruit's email, pointed at
   `/auth/callback?next=/portal`.

On success, the wizard advances to the welcome card.

---

## Step 5 — The welcome / tour card

After a successful signup the wizard shows a one-time **welcome card** with a
placeholder tour video and a **Get started** button. It only appears here, in
the signup flow, so it's naturally seen just once.

Because login is magic-link only, "Get started" currently sends the recruit to
the sign-in page, and the card notes that a one-click link was emailed to them.

> **Known limitation / future work:** ideally "Get started" drops the recruit
> straight into `/portal` with no email round-trip. That requires a different
> auth approach (e.g. issuing a session or a password at signup) and is
> deliberately deferred.

---

## Step 6 — First login links the account

When the recruit clicks the emailed link:

1. `src/app/auth/callback/route.ts` exchanges the code for a session.
2. It calls `linkPersonByEmail()` (`src/lib/auth.ts`), which finds the `person`
   row created at signup (matched by email) and stamps `auth_user_id` onto it —
   connecting the Supabase auth user to their person record.
3. It also nudges the recruit's `phase_step` to `logged_in`.
4. `resolveLandingPath()` sees a person who is neither builder nor producer and
   sends them to **`/portal`** — the recruit journey.

From here the recruit is fully onboarded and moves through the pipeline:
`licensing → onboarding → bootcamp → graduated`.

---

## How "they stay under that builder" actually works

The org hierarchy is a single linked chain: `person.upline_id` points at the
person above you. Visibility is enforced by the `can_view()` SQL function, which
walks **down** from the current user via `upline_id` (a recursive CTE) and
returns everyone in their downline (owners see everyone).

Consequences:

- A recruit signed up through Builder B's link has `upline_id = B`, so B (and
  anyone above B) can see them.
- If that recruit later becomes a producer, then a builder, **their `upline_id`
  never changes** — they stay in B's downline forever. The whole future chain
  hangs beneath B automatically. No extra bookkeeping required.
- Row-level security uses this: `recruit_select` is `can_view(person_id)`, so a
  builder's Recruiting page only shows their own downline.

---

## File map

| Concern                        | File                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| Schema (cols + referral table) | `supabase/migrations/20260601000700_recruit_signup.sql`     |
| Referral code lookup/create    | `src/lib/referral.ts`                                        |
| US states list                 | `src/lib/us-states.ts`                                       |
| Signup server action           | `src/lib/actions/recruit-signup.ts`                          |
| Public signup page             | `src/app/join/[code]/page.tsx`                               |
| Signup wizard UI               | `src/app/join/[code]/JoinWizard.tsx`                         |
| Builder's "Your signup link"   | `src/app/producer/recruiting/page.tsx` + `CopyLink.tsx`     |
| Public-route allowlist         | `src/lib/supabase/middleware.ts`                            |
| Auth callback + linking        | `src/app/auth/callback/route.ts`, `src/lib/auth.ts`        |

## Data model additions

- `recruit.phone` (text) and `recruit.state` (text) — collected at signup.
- `builder_referral` (builder_id, code, created_at) — the per-builder code.

---

## Quick reference

- **Builder's link:** `/join/<code>` — copy it from Producer → Recruiting.
- **What ties a recruit to a builder:** `person.upline_id` (set at signup);
  `recruit.builder_id` mirrors it.
- **Why the link is public:** `/join` is in the middleware allowlist.
- **First stage:** every new recruit starts in `phase = licensing`.
- **Login:** magic-link email; the callback links auth ↔ person and routes to
  `/portal`.
