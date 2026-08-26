import Image from "next/image";
import Link from "next/link";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/work-with-all-star", label: "Work With All Star" },
  { href: "/contact", label: "Contact Us" },
];

function NavigationLinks({ onMobile = false }: { onMobile?: boolean }) {
  return (
    <ul>
      {navigation.map((item) => (
        <li key={item.href}><Link href={item.href}>{item.label}</Link></li>
      ))}
      <li><a href="https://app.allstarlifegroup.com/auth/signin">Login</a></li>
      {onMobile && <li className="mobile-nav-label" aria-hidden="true">All Star Life Group</li>}
    </ul>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="All Star Life Group home">
        <Image src="/marketing/logo.png" alt="All Star Life Group" width={220} height={125} priority />
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        <NavigationLinks />
      </nav>
      <details className="mobile-menu">
        <summary aria-label="Open navigation menu">
          <span>Menu</span>
          <span className="mobile-menu-icon" aria-hidden="true"><i /><i /></span>
        </summary>
        <nav aria-label="Mobile navigation"><NavigationLinks onMobile /></nav>
      </details>
    </header>
  );
}
