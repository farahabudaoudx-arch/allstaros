import Link from "next/link";
import { createRecruitAndRedirect } from "@/lib/actions/recruits";
import { Field, Input, Button } from "@/components/ui";

export default async function NewRecruitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/dashboard"
        className="text-sm text-mute transition hover:text-ink"
      >
        ← Back to roster
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
        Mark interview passed
      </h1>
      <p className="mt-2 text-sm text-subtle">
        This creates the recruit&#x2019;s record and issues a login. They sign
        in with the Google account on this email.
      </p>

      {params.error ? (
        <div className="mt-6 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
          {params.error}
        </div>
      ) : null}

      <form action={createRecruitAndRedirect} className="mt-8 space-y-5">
        <Field label="Full name" htmlFor="fullName">
          <Input id="fullName" name="fullName" type="text" required />
        </Field>
        <Field label="Email (Google account)" htmlFor="email">
          <Input id="email" name="email" type="email" required />
        </Field>
        <Button type="submit" variant="primary" className="w-full">
          Create recruit
        </Button>
      </form>
    </div>
  );
}
