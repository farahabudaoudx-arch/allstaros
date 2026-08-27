import type { Metadata } from "next";
import Image from "next/image";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export const metadata: Metadata = { title: "About Us | All Star Life Group" };

const letterParagraphs = [
  "They want confidence that if life takes an unexpected turn, the people they love won’t be left scrambling. They want to build something meaningful, create a better future, and sleep a little easier at night.",
  "That’s why All Star Life Group exists, and it’s why the Life Insurance Industry exists.",
  "We help families prepare for the moments no one likes to imagine and help ambitious people build careers centered on service, leadership, and genuine human connection.",
  "It's because of what we do here at All Star that I tell everyone who asks about \"who we are\" that we are first and foremost not interested in doing business the ordinary way.",
  "We don’t see clients as policy numbers. We don’t treat producers like names on a roster. And we don’t believe success should come at the expense of integrity.",
  "We believe people deserve honest guidance.",
  "We believe promises should be kept.",
  "We believe leaders should develop leaders.",
  "And we believe that when you give the right person a proven system, meaningful support, and a standard worth rising to, remarkable things can happen.",
  "That belief shapes everything we do, that’s why we call ourselves, All Stars.",
  "We don't need people with the perfect résumé, who know all the answers, or someone who never makes mistakes.",
  "We need people who value honesty, integrity, and servant leadership above all else.",
  "We’re building a company where families can find protection they understand and professionals can find an opportunity worthy of their effort.",
  "Where new producers receive direction instead of being left to figure everything out alone.",
  "Where experienced leaders are expected to teach, encourage, and raise the standard for everyone around them.",
  "Where growth means more than numbers on a scoreboard. It means becoming more disciplined, more capable, and more valuable to the people who depend on you.",
  "That is what All Star Life Group is about.",
];

export default function AboutPage() {
  return (
    <main>
      <SiteHeader />
      <section className="inner-page-hero about-page-hero"><div className="section"><h1>About Us</h1></div></section>
      <article className="section founder-letter">
        <header className="founder-letter-address">
          <Image
            className="founder-headshot"
            src="/marketing/wylie-hawkins.png"
            alt="Wylie Hawkins, CEO of All Star Life Group"
            width={100}
            height={100}
            priority
          />
          <div>
            <p>From The Desk Of: Wylie Hawkins, CEO - All Star Life Group</p>
            <p>To: The Person Looking Into All Star Life Group</p>
            <p>Location: Austin, TX</p>
          </div>
        </header>
        <p className="founder-salutation">Dear Future All Star Clients And Agents,</p>
        <p>Nobody wakes up excited to buy life insurance.</p>
        <p>Yet, everyone wakes up wanting to know their family will be okay.</p>
        {letterParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <p className="founder-signature">
          <span>Sincerely,</span>
          <Image
            className="founder-signature-image"
            src="/marketing/wylie-signature.png"
            alt="Wylie Hawkins signature"
            width={210}
            height={101}
          />
          <span>Wylie Hawkins<br />CEO, All Star Life Group</span>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
