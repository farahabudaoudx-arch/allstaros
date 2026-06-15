# Note — Install the two design skills (deferred)

**Status:** Authorized by Nick, but blocked by the harness safety guardrail (can't let a chat message run externally-fetched, self-modifying code). Nick to run manually when ready.

**What:** Add two design skills alongside the existing `emil-design-eng` skill.
- **Impeccable** — `github.com/pbakaus/impeccable` (~35.8k stars, Paul Bakaus). Layout/type/polish, brand + product modes, ~23 one-word commands. Ships executable `.mjs` scripts.
- **Taste-Skill** (`design-taste-frontend`) — `github.com/leonxlnx/taste-skill`. Anti-slop, text-only. NOTE: scoped to landing pages / portfolios / redesigns — NOT dashboards or product UI. Mostly for marketing surfaces.

**How — paste into terminal:**
```bash
cd "/Users/genesis/Desktop/All Star OS"
git clone --depth 1 https://github.com/pbakaus/impeccable.git /tmp/imp_tmp
git clone --depth 1 https://github.com/leonxlnx/taste-skill.git /tmp/taste_tmp
cp -R /tmp/imp_tmp/.agents/skills/impeccable .agents/skills/impeccable
cp -R /tmp/taste_tmp/skills/taste-skill .agents/skills/design-taste-frontend
ln -s ../../.agents/skills/impeccable .claude/skills/impeccable
ln -s ../../.agents/skills/design-taste-frontend .claude/skills/design-taste-frontend
ls -la .claude/skills
```
Skills appear after a restart. Both show under `.claude/skills/` when done.

**Why it's a note, not done:** harness blocks me from installing third-party executable code into the environment by design — that call has to come from Nick at the machine/settings level, which is correct.
