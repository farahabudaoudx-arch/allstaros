"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { submitCandidateDetails } from "./actions";
import styles from "./test-project.module.css";

type Candidate = {
  fullName: string;
  email: string;
  githubUsername: string;
  upworkProfile: string;
};

type PortalState = {
  candidate: Candidate;
  ndaSignedAt: string | null;
  ndaSignature: string;
};

const EMPTY_CANDIDATE: Candidate = {
  fullName: "",
  email: "",
  githubUsername: "",
  upworkProfile: "",
};

const STORAGE_KEY = "all-star-os-test-project";
const REPOSITORY_URL = "https://github.com/nicholasverge/allstaros-test-hire";
const README_URL = `${REPOSITORY_URL}#readme`;
const WALKTHROUGH_URL: string | null = null;

const STEPS = [
  { number: 1, title: "Your information", detail: "Tell us who is completing the project." },
  { number: 2, title: "Sign the NDA", detail: "Protect the private codebase and project materials." },
  { number: 3, title: "Project handoff", detail: "Get the brief, repository, and submission checklist." },
] as const;

export function TestProjectPortal() {
  const [candidate, setCandidate] = useState<Candidate>(EMPTY_CANDIDATE);
  const [ndaSignature, setNdaSignature] = useState("");
  const [ndaSignedAt, setNdaSignedAt] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const state = JSON.parse(stored) as PortalState;
        setCandidate(state.candidate);
        setNdaSignature(state.ndaSignature);
        setNdaSignedAt(state.ndaSignedAt);
        setStep(state.ndaSignedAt ? 3 : state.candidate.fullName ? 2 : 1);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  function save(next: PortalState) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function submitCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmissionError("");
    const result = await submitCandidateDetails(candidate);
    setSubmitting(false);
    if (!result.ok) {
      setSubmissionError(result.error);
      return;
    }
    save({ candidate, ndaSignature: "", ndaSignedAt: null });
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function signNda(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ndaSignature.trim().toLocaleLowerCase() !== candidate.fullName.trim().toLocaleLowerCase()) {
      return;
    }
    const signedAt = new Date().toISOString();
    setNdaSignedAt(signedAt);
    save({ candidate, ndaSignature: ndaSignature.trim(), ndaSignedAt: signedAt });
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const completeThrough = ndaSignedAt ? 3 : candidate.fullName ? 1 : 0;
  const progress = Math.round((completeThrough / STEPS.length) * 100);

  return (
    <main className={styles.portal}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sideIntro}>
            <Link href="/" className={styles.brand} aria-label="OperatingSystems.com home">
              <img src="https://www.operatingsystems.com/os-landing/os-rim.png" alt="" className={styles.mark} />
              <span>OperatingSystems.com</span>
            </Link>
            <h2>{candidate.fullName ? `Welcome, ${candidate.fullName.trim().split(/\s+/)[0]}` : "Welcome"}</h2>
            <p>Paid Coding Project</p>
          </div>
          <ol className={styles.stepList}>
            {STEPS.map((item) => {
              const active = step === item.number;
              const complete = completeThrough >= item.number;
              return (
                <li key={item.number} className={active ? styles.activeStep : ""}>
                  <button type="button" disabled={item.number > completeThrough + 1} onClick={() => setStep(item.number)} aria-current={active ? "step" : undefined}>
                    <span className={styles.stepNumber}>{complete && item.number < step ? "✓" : item.number}</span>
                    <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className={styles.progressLabel}><span>Progress</span><span>{completeThrough} of {STEPS.length}</span></div>
          <div className={styles.progressTrack} role="progressbar" aria-label="Project setup progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={completeThrough}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </aside>
        <section className={`${styles.content} ${ready ? styles.ready : ""}`}>
          {step === 1 && (
            <div className={styles.page}>
              <h1>Full Stack Dev Trial Project</h1>

              <div className={styles.briefGrid}>
                <div><span>Project fee</span><strong>$150</strong></div>
                <div><span>Time window</span><strong>24 hours</strong></div>
                <div><span>Deliverables</span><strong>Code + report</strong></div>
              </div>

              <section className={styles.overview}>
                <h2>What you’ll do</h2>
                <div className={styles.outline}>
                  <article><span>01</span><div><h3>Investigate</h3><p>Explore the builder and producer experience and find a slow page or request path using reproducible evidence.</p></div></article>
                  <article><span>02</span><div><h3>Improve</h3><p>Diagnose the cause, implement a focused fix, and preserve data correctness, authentication, and row-level security.</p></div></article>
                  <article><span>03</span><div><h3>Report</h3><p>Document before-and-after measurements and give us a prioritized list of additional codebase improvements.</p></div></article>
                </div>
              </section>

              <form className={styles.form} onSubmit={submitCandidate}>
                <div className={styles.formHeading}>
                  <span>Step 1 of 3</span>
                  <h2>First, tell us about you.</h2>
                </div>
                <div className={styles.fields}>
                  <label>Full legal name<input required autoComplete="name" value={candidate.fullName} onChange={(e) => setCandidate({ ...candidate, fullName: e.target.value })} placeholder="Your full name" /></label>
                  <label>Email address<input required type="email" autoComplete="email" value={candidate.email} onChange={(e) => setCandidate({ ...candidate, email: e.target.value })} placeholder="you@example.com" /></label>
                  <label>GitHub username<input required value={candidate.githubUsername} onChange={(e) => setCandidate({ ...candidate, githubUsername: e.target.value })} placeholder="octocat" /></label>
                  <label>Upwork profile URL<input required type="url" value={candidate.upworkProfile} onChange={(e) => setCandidate({ ...candidate, upworkProfile: e.target.value })} placeholder="https://www.upwork.com/freelancers/…" /></label>
                </div>
                {submissionError && <p className={styles.error} role="alert">{submissionError}</p>}
                <button className={styles.primary} type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Continue to NDA"} {!submitting && <Arrow />}
                </button>
              </form>
            </div>
          )}

          {step === 2 && (
            <div className={styles.page}>
              <h1>Confidentiality comes before access.</h1>
              <p className={styles.lede}>Please read and accept the agreement below. Your project materials unlock once your signature matches your legal name.</p>

              <section className={styles.document}>
                <div className={styles.documentTitle}><span>Confidentiality agreement</span><span>Candidate copy</span></div>
                <h2>Mutual Non-Disclosure Agreement</h2>
                <p>This agreement is between Verge Enterprises (“Company”) and <strong>{candidate.fullName}</strong> (“Recipient”) for the purpose of evaluating and completing a paid technical project.</p>
                <h3>1. Confidential information</h3>
                <p>Confidential information includes the source code, credentials, data, product plans, business processes, walkthroughs, documentation, and any non-public material provided for the project.</p>
                <h3>2. Limited use and recipient responsibilities</h3>
                <p>Recipient may use confidential information and the Company’s code only to complete this project for the Company. Recipient will protect it with reasonable care and may not share, publish, copy, reuse, adapt, incorporate, or otherwise use any portion of the code, data, designs, documentation, or other confidential information in any outside, personal, portfolio, commercial, open-source, or third-party project.</p>
                <h3>3. Project work</h3>
                <p>The investigation, code changes, findings, measurements, and report created for this project are confidential and may be reviewed only with the Company and through the private project repository.</p>
                <h3>4. No contact or circumvention</h3>
                <p>Recipient may not directly or indirectly contact, solicit, approach, provide services to, or attempt to obtain business from any Company client, prospective client, vendor, business partner, or competitor identified through the project or confidential information. Recipient may not use the codebase, data, relationships, or knowledge gained through this project to compete with, bypass, or circumvent the Company.</p>
                <h3>5. Return and deletion</h3>
                <p>At the Company’s request or when the engagement ends, Recipient will delete local credentials, data exports, and confidential project copies not required for the Upwork engagement record.</p>
                <h3>6. Exclusions and term</h3>
                <p>This agreement does not cover information that is public through no breach by Recipient, already lawfully known, or independently developed. These obligations continue for three years from signature.</p>
                <h3>7. Enforcement and remedies</h3>
                <p>Recipient acknowledges that any unauthorized use, disclosure, reuse of code, or prohibited contact may cause the Company immediate and irreparable harm for which monetary damages alone may be inadequate. If Recipient breaches or threatens to breach this agreement, the Company may pursue injunctive relief, monetary damages, recovery of its legal costs and reasonable attorneys’ fees where permitted, and any other remedies available under applicable law. The Company intends to enforce these obligations and may initiate legal action against Recipient for a violation.</p>
              </section>

              <form className={styles.signatureForm} onSubmit={signNda}>
                <label>Type your full legal name to sign<input required value={ndaSignature} onChange={(e) => setNdaSignature(e.target.value)} placeholder={candidate.fullName} /></label>
                {ndaSignature && ndaSignature.trim().toLocaleLowerCase() !== candidate.fullName.trim().toLocaleLowerCase() && <p className={styles.error}>Your signature must match “{candidate.fullName}”.</p>}
                <label className={styles.consent}><input required type="checkbox" /><span>I have read this agreement and agree that my typed name is my electronic signature.</span></label>
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={() => setStep(1)}>Back</button>
                  <button className={styles.primary} type="submit">Sign and view project <Arrow /></button>
                </div>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className={styles.page}>
              <h1>You’re cleared to begin.</h1>
              <p className={styles.lede}>Everything you need is below. Your 24-hour window starts only after you and the hiring team confirm the app runs successfully on your computer.</p>

              <div className={styles.accessCard}>
                <div>
                  <span>Private GitHub repository</span>
                  <h2>allstaros-test-hire</h2>
                  <p>Accept the GitHub invitation sent to <strong>@{candidate.githubUsername}</strong>, then clone the repository.</p>
                </div>
                <a href={REPOSITORY_URL} target="_blank" rel="noreferrer" className={styles.primary}>Open GitHub <Arrow /></a>
              </div>

              <section className={styles.projectSection}>
                <h2>The assignment</h2>
                <div className={styles.assignment}>
                  <article><span>Deliverable 1</span><h3>Performance investigation and fix</h3><p>Locate a meaningful page-load delay in the authenticated builder or producer platform. Diagnose the dominant cause, implement a solution, and show at least five before and five after measurements with medians.</p></article>
                  <article><span>Deliverable 2</span><h3>Prioritized improvement plan</h3><p>Identify other valuable codebase improvements. For each, explain the problem, proposed solution, expected result, effort, assumptions, and risks. Do not implement these additional items.</p></article>
                </div>
              </section>

              <section className={styles.checklist}>
                <h2>Start here</h2>
                <ol>
                  <li className={styles.videoStep}>
                    <span>1</span>
                    <div>
                      <strong>Watch the walkthrough</strong>
                      {WALKTHROUGH_URL ? (
                        <div className={styles.videoFrame}>
                          <iframe src={WALKTHROUGH_URL} title="All Star OS project walkthrough" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                        </div>
                      ) : (
                        <div className={styles.videoPlaceholder}>Walkthrough video will appear here.</div>
                      )}
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Follow the repository README</strong>
                      <p>The README contains the current installation, verification, project, and submission instructions.</p>
                      <a className={styles.readmeLink} href={README_URL} target="_blank" rel="noreferrer">Open the README <Arrow /></a>
                    </div>
                  </li>
                </ol>
              </section>

              <div className={styles.signedNote}>
                NDA signed by <strong>{ndaSignature}</strong>{ndaSignedAt ? ` on ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(new Date(ndaSignedAt))}` : ""}. Payment and milestones remain in Upwork.
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Arrow() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>;
}
