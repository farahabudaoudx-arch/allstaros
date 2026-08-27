import Image from "next/image";
import Link from "next/link";

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M21.6 7.2a2.9 2.9 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.9 2.9 0 0 0-2 2A30 30 0 0 0 2 12a30 30 0 0 0 .4 4.8 2.9 2.9 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.9 2.9 0 0 0 2-2A30 30 0 0 0 22 12a30 30 0 0 0-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

const socialLinks = [
  {
    href: "https://www.instagram.com/allstarlifegroup/",
    label: "All Star Life Group on Instagram",
    platform: "instagram",
  },
  {
    href: "https://www.youtube.com/@AllStarLifeGroup",
    label: "All Star Life Group on YouTube",
    platform: "youtube",
  },
  {
    href: "https://www.youtube.com/@AllstarAcademyOfficial",
    label: "All Star Academy Official on YouTube",
    platform: "youtube",
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="section site-footer-inner">
        <Link href="/" aria-label="All Star Life Group home">
          <Image src="/marketing/logo.png" alt="All Star Life Group" width={140} height={80} />
        </Link>
        <div className="site-footer-contact">
          <p>Address: 110 Wild Basin Rd South STE 100, West Lake Hills, Texas 78746</p>
          <a href="tel:+12195128638">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7.2 3.5 9.8 8 7.9 9.9c1.1 2.2 3 4.1 5.2 5.2l1.9-1.9 4.5 2.6-.8 3.1c-.2.8-.9 1.3-1.7 1.3C9.7 20.2 3.8 14.3 3.8 7c0-.8.5-1.5 1.3-1.7l2.1-.8Z" />
            </svg>
            219-512-8638
          </a>
        </div>
        <div className="site-footer-socials" aria-label="All Star Life Group social channels" role="group">
          {socialLinks.map((social) => (
            <a
              aria-label={social.label}
              href={social.href}
              key={social.href}
              rel="noreferrer"
              target="_blank"
              title={social.label}
            >
              {social.platform === "instagram" ? (
                <InstagramIcon />
              ) : (
                <YoutubeIcon />
              )}
            </a>
          ))}
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/terms-and-conditions">Terms And Conditions</Link>
        </nav>
      </div>
    </footer>
  );
}
