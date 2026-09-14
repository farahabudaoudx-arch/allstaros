import { Field, Input, Textarea } from "@/components/ui";
import type { WhitelabelBuild } from "@/lib/whitelabel/types";

const selectClass =
  "w-full rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent";

export function BuildIntakeFields({ build }: { build?: Partial<WhitelabelBuild> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Agency name" htmlFor="agency_name">
        <Input id="agency_name" name="agency_name" defaultValue={build?.agency_name ?? ""} required />
      </Field>
      <Field label="Product display name" htmlFor="product_name">
        <Input id="product_name" name="product_name" defaultValue={build?.product_name ?? ""} required />
      </Field>
      <Field label="Primary contact name" htmlFor="primary_contact_name">
        <Input
          id="primary_contact_name"
          name="primary_contact_name"
          defaultValue={build?.primary_contact_name ?? ""}
          placeholder="Name from the onboarding call"
        />
      </Field>
      <Field label="Primary contact email" htmlFor="primary_contact_email">
        <Input
          id="primary_contact_email"
          name="primary_contact_email"
          type="email"
          defaultValue={build?.primary_contact_email ?? ""}
        />
      </Field>
      <Field label="Initial admin name" htmlFor="initial_admin_name">
        <Input
          id="initial_admin_name"
          name="initial_admin_name"
          defaultValue={build?.initial_admin_name ?? ""}
        />
      </Field>
      <Field label="Initial admin email" htmlFor="initial_admin_email">
        <Input
          id="initial_admin_email"
          name="initial_admin_email"
          type="email"
          defaultValue={build?.initial_admin_email ?? ""}
        />
      </Field>
      <Field label="Customer domain" htmlFor="domain" hint="Hostname only, for example agency.example.com.">
        <Input id="domain" name="domain" defaultValue={build?.domain ?? ""} />
      </Field>
      <Field label="Timezone" htmlFor="timezone" hint="IANA timezone used by the customer installation.">
        <Input id="timezone" name="timezone" defaultValue={build?.timezone ?? "America/Chicago"} />
      </Field>
      <Field label="Primary brand color" htmlFor="brand_primary_color" hint="6-digit hex value, for example #0F172A.">
        <Input
          id="brand_primary_color"
          name="brand_primary_color"
          defaultValue={build?.brand_primary_color ?? ""}
          placeholder="#0F172A"
        />
      </Field>
      <Field label="Accent brand color" htmlFor="brand_accent_color" hint="6-digit hex value, for example #38BDF8.">
        <Input
          id="brand_accent_color"
          name="brand_accent_color"
          defaultValue={build?.brand_accent_color ?? ""}
          placeholder="#38BDF8"
        />
      </Field>
      <Field label="Payment status" htmlFor="payment_status">
        <select
          id="payment_status"
          name="payment_status"
          className={selectClass}
          defaultValue={build?.payment_status ?? "pending"}
        >
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
      </Field>
      <Field label="Maintenance" htmlFor="maintenance_status">
        <select
          id="maintenance_status"
          name="maintenance_status"
          className={selectClass}
          defaultValue={build?.maintenance_status ?? "undecided"}
        >
          <option value="undecided">Undecided</option>
          <option value="selected">Selected — $197/month at handoff</option>
          <option value="declined">Declined</option>
        </select>
      </Field>
      <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-hairline bg-card-hi px-4 py-3">
        <input
          type="checkbox"
          name="standard_scope_confirmed"
          defaultChecked={build?.standard_scope_confirmed ?? false}
          className="mt-1 h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-ink">Standard scope confirmed</span>
          <span className="mt-0.5 block text-xs text-subtle">
            The $5,000 standard OS scope is agreed. Purchased additions are tracked separately below.
          </span>
        </span>
      </label>
      <Field label="Internal notes" htmlFor="notes" className="md:col-span-2" hint="Do not paste passwords, API keys, tokens, or other credentials here.">
        <Textarea id="notes" name="notes" rows={4} defaultValue={build?.notes ?? ""} />
      </Field>
    </div>
  );
}
