// Turns a carrier's raw underwriting rule text — which the source spreadsheet
// phrases as questionnaire prompts ("If \"Was the prospect's most recent a1c
// reading less than 8%?\" answered \"Yes\", SimpliNow Legacy Max") — into a
// short list of plain-English `condition → outcome` lines suitable for tooltip
// display.
//
// No model calls: regex + a small library of carrier-question patterns. New
// patterns can be added below as new carriers are folded in.

export type HumanizedRule = { when: string; then: string };

const STAGE_BEYOND = /cancer progress to a stage beyond stage\s*(\d+)/i;
const A1C_LESS_THAN = /a1c reading less than\s*([\d.]+%)/i;
const A1C_BETWEEN = /a1c reading between the levels of\s*([\d.]+%\s*[-–]\s*[\d.]+%)/i;

// "Was the prospect ever..." / "Does the prospect...": strip the boilerplate
// preamble and trailing question mark so we can render the clause as a phrase.
function stripPreamble(q: string): string {
  return q
    .replace(/\?+\s*$/, "")
    .replace(/^(was|is|has|have|does|did|are|do)\s+(the\s+)?(prospect|proposed\s+insured|insured|applicant)('?s)?\s+(ever\s+)?/i, "")
    .replace(/^the\s+(prospect|proposed\s+insured|insured|applicant)('?s)?\s+/i, "")
    .trim();
}

function describeYesNo(question: string, answer: "Yes" | "No"): string {
  const yes = answer === "Yes";

  // A1c < value
  let m = question.match(A1C_LESS_THAN);
  if (m) return yes ? `A1c < ${m[1]}` : `A1c ≥ ${m[1]}`;

  // A1c between X-Y
  m = question.match(A1C_BETWEEN);
  if (m) return yes ? `A1c ${m[1]}` : `A1c outside ${m[1]}`;

  // Insulin use
  if (/insulin use/i.test(question)) return yes ? "On insulin" : "Not on insulin";

  // Wheelchair / mobility device
  if (/wheelchair|motorized mobility device/i.test(question))
    return yes ? "Uses wheelchair / mobility device" : "No mobility device";

  // ADLs
  if (/activities of daily living|adls/i.test(question))
    return yes ? "Needs help with ADLs" : "Independent in ADLs";

  // Cancer recurrence
  if (/cancer more than once/i.test(question))
    return yes ? "Cancer recurred" : "Single cancer occurrence";

  // Metastatic cancer
  if (/metastatic cancer/i.test(question))
    return yes ? "Cancer was metastatic" : "Cancer was not metastatic";

  // Cancer stage
  m = question.match(STAGE_BEYOND);
  if (m) return yes ? `Cancer beyond stage ${m[1]}` : `Cancer at stage ${m[1]} or earlier`;

  // Chronic / debilitating condition
  if (/chronic or debilitating/i.test(question))
    return yes ? "Chronic/debilitating condition" : "No chronic condition";

  // Oxygen
  if (/oxygen/i.test(question)) return yes ? "On oxygen" : "Not on oxygen";

  // Generic fallback: strip preamble, lowercase first letter.
  const phrase = stripPreamble(question);
  if (!phrase) return yes ? "applies" : "does not apply";
  const lc = phrase[0].toLowerCase() + phrase.slice(1);
  return yes ? lc.charAt(0).toUpperCase() + lc.slice(1) : `Not: ${lc}`;
}

// Pretty-print a carrier outcome label so plan-tier strings read naturally.
// "SimpliNow Legacy Max" → "Approved (SimpliNow Legacy Max plan)" etc.
const APPROVED_TIERS = /^(approved|immediate|level|preferred(\s+plus)?|select|standard(\s+plus)?|simplinow legacy(\s+max)?)$/i;
const GRADED_TIERS = /^(graded|modified|substandard|guaranteed issue|gi|rop|return of premium|eagle guaranteed)$/i;
function prettyOutcome(label: string): string {
  const s = label.trim().replace(/\.$/, "").trim();
  if (!s) return s;
  if (/^decline$/i.test(s)) return "Decline";
  if (/^approved$/i.test(s)) return "Approved";
  if (/^graded$/i.test(s)) return "Graded";
  if (/^conditional$/i.test(s)) return "Conditional";
  if (/^unknown$/i.test(s)) return "Unknown";
  if (APPROVED_TIERS.test(s)) return `Approved (${s})`;
  if (GRADED_TIERS.test(s)) return `Graded (${s})`;
  return s;
}

function humanizeSegment(segment: string): HumanizedRule | null {
  const s = segment.trim().replace(/^\.+\s*/, "").replace(/\.+$/, "").trim();
  if (!s) return null;

  // "QUESTION?" answered "Yes/No" , OUTCOME
  const m = s.match(/^"([^"]+\?)"\s*answered\s*"(Yes|No)"\s*,\s*(.+)$/i);
  if (m) {
    return { when: describeYesNo(m[1], m[2] as "Yes" | "No"), then: prettyOutcome(m[3]) };
  }

  // treated within X, OUTCOME
  let t = s.match(/^treated\s+within\s+(.+?),\s*(.+)$/i);
  if (t) return { when: `Treated within ${t[1].trim()}`, then: prettyOutcome(t[2]) };

  // treated between X and Y years ago, OUTCOME
  t = s.match(/^treated\s+between\s+(.+?\s+ago),\s*(.+)$/i);
  if (t) return { when: `Treated between ${t[1].trim()}`, then: prettyOutcome(t[2]) };

  // currently, OUTCOME
  t = s.match(/^currently\s*,\s*(.+)$/i);
  if (t) return { when: "Currently active", then: prettyOutcome(t[1]) };

  // Plain "OUTCOME" segments — promote whole text into `then` so we don't drop info.
  return { when: "Otherwise", then: prettyOutcome(s) };
}

export function humanizeRawInfo(rawInfo: string): HumanizedRule[] {
  if (!rawInfo) return [];
  // Drop a leading "Conditional — " / "Graded — " bucket prefix (buildRawInfo
  // adds it for context but it's redundant once we're inside a Conditional tile).
  const stripped = rawInfo
    .replace(/^\s*(Conditional|Approved|Graded|Decline|Unknown)\s*[—–-]\s*/i, "")
    .trim();
  if (!stripped) return [];

  // Split on ". If " (also handle a leading "If ").
  const parts = stripped
    .split(/\s*\.\s+(?=If\s+)/i)
    .map((p) => p.replace(/^If\s+/i, "").trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const rules = parts.map(humanizeSegment).filter((r): r is HumanizedRule => !!r);
  // Dedup identical rules (the spreadsheet sometimes repeats the same A1c row).
  const seen = new Set<string>();
  return rules.filter((r) => {
    const key = `${r.when}→${r.then}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
