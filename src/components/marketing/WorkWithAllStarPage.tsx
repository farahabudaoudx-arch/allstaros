import { ShaderBackground } from "@/components/marketing/ShaderBackground";
import { Odometer } from "@/components/marketing/Odometer";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { ApplicationModalButton } from "@/components/marketing/ApplicationModalButton";
import { Banknote, CalendarClock, Eye, SignpostBig, Zap } from "lucide-react";

const fitQuestions = [
  { icon: "income", text: "Want more than an hourly wage and a 9 to 5?" },
  { icon: "vision", text: "Have a vision for a bigger and better life for you and your family?" },
  { icon: "schedule", text: "Want to work for yourself and control your schedule?" },
  { icon: "work", text: "Know you have the work ethic, but just need the right vehicle?" },
  { icon: "path", text: "Looking for a path to follow and someone who can show you the way?" },
];

const pathway = [
  {
    icon: "checklist",
    title: "We Give You A Proven Path So You Know Exactly What To Do To Achieve Your Goals, Step-By-Step.",
    copy: "We’ve trained thousands of life insurance agents and have it down to a science, giving you the exact scripts to follow, numbers to hit, and steps to take to go from a solo producer to building a team of dozens of agents underneath you.",
  },
  {
    icon: "growth",
    title: "We Train And Transform You Into A Closer By Improving Your Skills 1% Every Day.",
    copy: "Closers aren’t made overnight, they’re built through small daily improvements. Get just 1% better every day and those improvements compound into dramatically better sales skills, confidence, and closing ability over time.",
  },
  {
    icon: "leads",
    title: "We Help You Get A Running Start By Giving You Leads So You Can Quickstart Your Path To Closing Deals And Getting Paid.",
    copy: "There is no “I” in team, which means we don’t expect you to figure everything out alone. We give you leads and the resources you need to start having conversations, closing deals, and getting paid as quickly as possible.",
  },
  {
    icon: "platform",
    title: "We Provide You With Our All Star OS Platform That Saves You Time And Helps You Sell More.",
    copy: "We’ve gamified the business of life insurance by building our own proprietary All Star OS platform, designed to make it easier than ever to sell more policies, track your progress, and grow your agency.",
  },
];

function PathwayIcon({ name }: { name: string }) {
  if (name === "checklist") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect x="9" y="7" width="30" height="34" rx="2" />
        <path d="m15 17 3 3 6-7M28 17h6M15 29l3 3 6-7M28 29h6" />
      </svg>
    );
  }

  if (name === "growth") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 38V10M8 38h32M14 31l8-9 6 5 11-14M32 13h7v7" />
      </svg>
    );
  }

  if (name === "leads") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="17" cy="16" r="6" />
        <path d="M7 36c1-8 5-12 10-12s9 4 10 12M29 17h12M35 11l6 6-6 6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="15" cy="18" r="6" />
      <path d="M15 8v4M15 24v4M5 18h4M21 18h4M8 11l3 3M19 22l3 3M8 25l3-3M19 14l3-3" />
      <circle cx="33" cy="31" r="6" />
      <path d="M33 21v4M33 37v4M23 31h4M39 31h4M26 24l3 3M37 35l3 3M26 38l3-3M37 27l3-3" />
    </svg>
  );
}

function FitIcon({ name }: { name: string }) {
  if (name === "income") {
    return <Banknote aria-hidden="true" />;
  }
  if (name === "vision") {
    return <Eye aria-hidden="true" />;
  }
  if (name === "schedule") {
    return <CalendarClock aria-hidden="true" />;
  }
  if (name === "work") {
    return <Zap aria-hidden="true" />;
  }
  return <SignpostBig aria-hidden="true" />;
}

export function WorkWithAllStarPage() {
  return (
    <main>
      <SiteHeader />

      <section className="hero" id="top">
        <ShaderBackground className="shader-background" />
        <div className="shader-scrim" aria-hidden="true" />
        <div className="hero-content">
          <h1>Build A Career Helping Families Protect Their Loved Ones</h1>
          <ApplicationModalButton />
        </div>
      </section>

      <section className="fit-section section" id="fit">
        <h2>How To Know If A Life Insurance Agency Is The Right Business For You To Build…</h2>
        <ul className="fit-list">
          {fitQuestions.map((question) => (
            <li key={question.text}>
              <span className="fit-icon"><FitIcon name={question.icon} /></span>
              <span>{question.text}</span>
            </li>
          ))}
        </ul>
        <p className="fit-conclusion">If You Answered Yes,<br />This May Be The Path For You.</p>
      </section>

      <section className="numbers-section" id="about">
        <div className="section numbers-inner">
          <h2>Nobody Builds Life Insurance Agencies Like All Star</h2>
          <dl className="numbers-list">
            <div>
              <dt>Current Number Of Agents Inside Of All Star:</dt>
              <dd><Odometer value="2,576" /></dd>
            </div>
            <div>
              <dt>All Star’s 2026 Revenue Year-To-Date:</dt>
              <dd><Odometer value="$126,950,905.53" /></dd>
            </div>
            <div>
              <dt>Average Daily Volume At All Star:</dt>
              <dd><Odometer value="$542,525.23" /></dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="market-section section">
        <h2 className="market-heading"><span>Here’s What’s Crazy…</span>We’re Not The Biggest Fish In The Life Insurance Ocean!</h2>

        <div className="market-list">
          <article>
            <div className="market-copy">
              <h4>The Life Insurance Market Is Worth:</h4>
              <p>Life insurance is one of the largest financial markets in the world. At $3.1 trillion, this is not a new or unproven industry. People are already spending enormous amounts of money every year to protect their families, build wealth, and leave money behind.</p>
            </div>
            <p className="market-value"><Odometer value="$3,100,000,000,000" /></p>
          </article>
          <article>
            <div className="market-copy">
              <h4>Life Insurance Policies Sold Each Year In The US:</h4>
              <p>Every year, approximately 9.6 million life insurance policies are sold. This includes people who already have coverage in place, because their needs change, and they either want better coverage or more coverage.</p>
            </div>
            <p className="market-value"><Odometer value="9,600,000" /></p>
          </article>
          <article>
            <div className="market-copy">
              <h4>Total US Population Above The Age Of 55:</h4>
              <p>The average customer for a life insurance policy is 55 years old. People at this age start thinking about protecting their family or leaving behind a legacy. Your market is huge and filled with people who already want what you have, no hard selling required.</p>
            </div>
            <p className="market-value"><Odometer value="103,000,000" /></p>
          </article>
        </div>

        <p className="market-share">We Account For 0.002% Of The Life Insurance Sold In The United States.</p>
        <div className="great-news">
          <p>There’s Plenty Of Room For<br />Anyone Who Wants To Grow.</p>
        </div>
      </section>

      <section className="pathway-section" id="pathway">
        <div className="section">
          <h2>All Star Gives You A Proven Pathway To Building A Successful Career In Life Insurance</h2>
          <ol className="pathway-list">
            {pathway.map((item) => (
              <li key={item.title}>
                <div className="pathway-mark" aria-hidden="true">
                  <PathwayIcon name={item.icon} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="requirements-section" id="requirements">
        <div className="section requirements-inner">
          <h2>The 3 Things You Need To Sell Life Insurance With All Star:</h2>
          <ol className="requirements-list">
            <li><span aria-hidden="true">01</span>Life Insurance License</li>
            <li><span aria-hidden="true">02</span>Coachability</li>
            <li><span aria-hidden="true">03</span>Strong Work Ethic</li>
          </ol>
          <p className="requirements-close">
            We Can Help You Get The First One,<br />
            <em>We Can’t Help You With The Other Two.</em>
          </p>
          <ApplicationModalButton
            className="button button-dark"
            label="Click Here To Apply To Work With All Star"
          />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
