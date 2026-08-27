"use client";

import { useRef, useState, type FormEvent } from "react";

type SubmissionState = {
  kind: "idle" | "success" | "error";
  message: string;
};

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<SubmissionState>({ kind: "idle", message: "" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState({ kind: "idle", message: "" });

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message || "We could not send your message.");
      }

      formRef.current?.reset();
      setState({ kind: "success", message: result.message || "Your message has been sent." });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "We could not send your message.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} className="contact-form" onSubmit={handleSubmit}>
      <div className="contact-field">
        <label htmlFor="contact-name">Full Name</label>
        <input id="contact-name" name="name" type="text" autoComplete="name" placeholder="Your Name" minLength={2} maxLength={120} required />
      </div>
      <div className="contact-field">
        <label htmlFor="contact-email">Email Address</label>
        <input id="contact-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required />
      </div>
      <div className="contact-field">
        <label htmlFor="contact-phone">Phone Number</label>
        <input id="contact-phone" name="phone" type="tel" autoComplete="tel" placeholder="(000) 000-0000" maxLength={50} />
      </div>
      <div className="contact-field">
        <label htmlFor="contact-subject">Subject</label>
        <input id="contact-subject" name="subject" type="text" placeholder="What Do You Need Help With?" minLength={2} maxLength={160} required />
      </div>
      <div className="contact-field contact-field-message">
        <label htmlFor="contact-message">Message</label>
        <textarea id="contact-message" name="message" rows={7} placeholder="Tell Us More" minLength={10} maxLength={5000} required />
      </div>
      <div className="contact-honeypot" aria-hidden="true">
        <label htmlFor="contact-company">Company</label>
        <input id="contact-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send Message"}
      </button>
      <p className={`contact-form-status contact-form-status-${state.kind}`} aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
