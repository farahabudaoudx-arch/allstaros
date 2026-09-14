import { BuildIntakeFields } from "@/components/admin/os-builds/BuildIntakeFields";
import { Button, Card, LinkButton, PageShell } from "@/components/ui";
import { adminCreateOsBuild } from "@/lib/actions/admin/os-builds";
import { requireAdmin } from "@/lib/admin/guard";

export default async function NewOsBuildPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin("/admin/os-builds/new");
  const flash = await searchParams;

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">OS Assembly Line</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Create build</h1>
          <p className="mt-3 max-w-2xl text-sm text-subtle">
            Start with the customer identity and known onboarding answers. Incomplete launch information can be saved and completed later.
          </p>
        </div>
        <LinkButton href="/admin/os-builds">Back to builds</LinkButton>
      </div>

      {flash.error ? (
        <p className="mt-6 rounded-xl border border-neg/30 bg-neg/[0.08] px-4 py-2.5 text-sm text-neg">
          {flash.error}
        </p>
      ) : null}

      <Card className="mt-8">
        <form action={adminCreateOsBuild}>
          <BuildIntakeFields />
          <div className="mt-6 flex justify-end">
            <Button type="submit" variant="primary">Create build</Button>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
