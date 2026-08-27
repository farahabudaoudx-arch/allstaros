import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/ContactForm";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export const metadata: Metadata = { title: "Contact Us | All Star Life Group" };

export default function ContactPage() {
  return (
    <main>
      <SiteHeader />
      <section className="contact-page" id="contact-form">
        <div className="section contact-form-inner">
          <h1>Contact Us</h1>
          <p className="contact-response-note">Our Head Of Communications Will Reach Back Out To You As Soon As Possible.</p>
          <ContactForm />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
