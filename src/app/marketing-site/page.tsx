import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FileCheck2, Handshake, LockKeyhole, UsersRound } from "lucide-react";
import { ShaderBackground } from "@/components/marketing/ShaderBackground";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export const metadata: Metadata = {
  title: "All Star Life Group",
};

const guidance = [
  {
    icon: "family",
    title: "Coverage Built Around Your Needs",
    copy: "No two families are the same. Our licensed agents take the time to understand your needs, your budget, and what you want to protect before helping you find the right coverage.",
  },
  {
    icon: "handshake",
    title: "Simple, Personal Guidance",
    copy: "Life insurance can feel complicated. We make it simple by walking you through your options, answering your questions, and helping you make an informed decision.",
  },
  {
    icon: "lock",
    title: "Protection For Every Stage Of Life",
    copy: "Whether you are raising a family, buying a home, preparing for retirement, or planning the legacy you want to leave behind, All Star Life Group is here to help.",
  },
  {
    icon: "document",
    title: "Trusted Coverage From Leading Carriers",
    copy: "We work with trusted insurance carriers across the country to help you compare options and find coverage that fits your needs.",
  },
];

const carriers = [
  { name: "American Amicable", logo: "/marketing/carriers/american-amicable.png" },
  { name: "Americo", logo: "/marketing/carriers/americo.png" },
  { name: "Chubb", logo: "/marketing/carriers/chubb.png" },
  { name: "Corebridge Financial", logo: "/marketing/carriers/corebridge-white.png" },
  { name: "Ethos", logo: "/marketing/carriers/ethos.png" },
  { name: "F&G", logo: "/marketing/carriers/fg.png" },
  { name: "Foresters Financial", logo: "/marketing/carriers/foresters.png" },
  { name: "InstaBrain", logo: "/marketing/carriers/instabrain.png" },
  { name: "Mutual of Omaha", logo: "/marketing/carriers/mutual-of-omaha-white.png" },
  { name: "National Life Group", logo: "/marketing/carriers/national-life-group.png" },
  { name: "Transamerica", logo: "/marketing/carriers/transamerica.png" },
];

function CarrierLogos({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className="carrier-group" aria-hidden={duplicate || undefined}>
      {carriers.map((carrier) => (
        <span className="carrier-logo" key={carrier.name}>
          <Image
            alt={duplicate ? "" : carrier.name}
            className={carrier.name === "American Amicable" ? "carrier-logo-image--white-bg" : undefined}
            height={64}
            loading="eager"
            src={carrier.logo}
            unoptimized
            width={180}
          />
        </span>
      ))}
    </div>
  );
}

function ConsumerIcon({ name }: { name: string }) {
  if (name === "family") {
    return <UsersRound aria-hidden="true" />;
  }

  if (name === "handshake") {
    return <Handshake aria-hidden="true" />;
  }

  if (name === "lock") {
    return <LockKeyhole aria-hidden="true" />;
  }

  return <FileCheck2 aria-hidden="true" />;
}

const policies = [
  {
    title: "Whole Life Insurance",
    copy: "Permanent coverage that protects your family for life while also building cash value over time.",
  },
  {
    title: "Term Life Insurance",
    copy: "Affordable coverage for a set period of time, designed to protect your family during the years they need it most.",
  },
  {
    title: "Mortgage Protection",
    copy: "Coverage designed to help your family pay off or continue making mortgage payments if something happens to you.",
  },
  {
    title: "Indexed Universal Life (IUL)",
    copy: "Permanent life insurance that combines lifelong protection with the potential to build cash value based on market index performance.",
  },
];

export default function HomePage() {
  return (
    <main>
      <svg aria-hidden="true" className="carrier-logo-filters">
        <filter id="american-amicable-white" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.333 -0.333 -0.333 1 0"
          />
        </filter>
      </svg>
      <SiteHeader />
      <section className="consumer-hero">
        <ShaderBackground className="shader-background" />
        <div className="shader-scrim" aria-hidden="true" />
        <div className="section consumer-hero-inner">
          <h1>We Help Protect Families And Secure Futures.</h1>
          <p>
            At All Star Life Group, we help families find life insurance coverage that protects<br />
            the people they love and gives them confidence about the future.
          </p>
          <div className="carrier-marquee" aria-label="Life insurance carriers we work with">
            <div className="carrier-track">
              <CarrierLogos />
              <CarrierLogos duplicate />
            </div>
          </div>
        </div>
      </section>

      <section className="consumer-guidance section">
        <h2 className="consumer-guidance-heading">We Give Our Clients:</h2>
        <div className="consumer-guidance-list">
          {guidance.map((item) => (
            <article key={item.title}>
              <span className="consumer-icon"><ConsumerIcon name={item.icon} /></span>
              <div>
                <h2>{item.title}</h2>
                <p>{item.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="consumer-policies">
        <div className="section">
          <h2>We Help Families With These Types Of Policies</h2>
          <div className="consumer-policy-list">
            {policies.map((policy, index) => (
              <article key={policy.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <h3>{policy.title}</h3>
                <p>{policy.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="consumer-cta">
        <div className="section consumer-cta-inner">
          <h2>If You Want To Protect The People Who Matter Most, We’ll Take Care Of You.</h2>
          <p>
            Speak with an All Star Life Group agent today and<br />
            find the coverage that is right for you.
          </p>
          <Link className="button button-dark" href="/contact">Click Here To Learn More About Getting A Life Insurance Policy In Place</Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
