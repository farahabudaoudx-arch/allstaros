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
      <Field label="Short organization name" htmlFor="short_name" hint="Used in compact UI and notifications.">
        <Input id="short_name" name="short_name" defaultValue={build?.short_name ?? ""} required />
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
      <Field label="Support email" htmlFor="support_email">
        <Input id="support_email" name="support_email" type="email" defaultValue={build?.support_email ?? ""} required />
      </Field>
      <Field label="Reply-to email" htmlFor="reply_to_email">
        <Input id="reply_to_email" name="reply_to_email" type="email" defaultValue={build?.reply_to_email ?? ""} required />
      </Field>
      <Field label="Sender identity" htmlFor="email_from" hint={'Verified sender, e.g. "Acme Life <notifications@acme.com>".'}>
        <Input id="email_from" name="email_from" defaultValue={build?.email_from ?? ""} required />
      </Field>
      <Field label="Licensing provider" htmlFor="licensing_provider_name">
        <Input id="licensing_provider_name" name="licensing_provider_name" defaultValue={build?.licensing_provider_name ?? ""} required />
      </Field>
      <Field label="Licensing / agency code" htmlFor="licensing_code">
        <Input id="licensing_code" name="licensing_code" defaultValue={build?.licensing_code ?? ""} required />
      </Field>
      <Field label="Licensing login URL" htmlFor="licensing_login_url">
        <Input id="licensing_login_url" name="licensing_login_url" type="url" defaultValue={build?.licensing_login_url ?? ""} required />
      </Field>
      <Field label="Licensing requirements URL" htmlFor="licensing_requirements_url">
        <Input id="licensing_requirements_url" name="licensing_requirements_url" type="url" defaultValue={build?.licensing_requirements_url ?? ""} required />
      </Field>
      <Field label="Licensing application URL" htmlFor="licensing_application_url">
        <Input id="licensing_application_url" name="licensing_application_url" type="url" defaultValue={build?.licensing_application_url ?? ""} required />
      </Field>
      <Field label="Graduation policy count" htmlFor="graduation_policy_count">
        <Input id="graduation_policy_count" name="graduation_policy_count" type="number" min={1} max={1000} defaultValue={build?.graduation_policy_count ?? 8} required />
      </Field>
      <Field label="Graduation window (days)" htmlFor="graduation_window_days">
        <Input id="graduation_window_days" name="graduation_window_days" type="number" min={1} max={3650} defaultValue={build?.graduation_window_days ?? 28} required />
      </Field>
      <Field label="Persisted stall threshold (days)" htmlFor="stall_persisted_lapse_days">
        <Input id="stall_persisted_lapse_days" name="stall_persisted_lapse_days" type="number" min={1} max={365} defaultValue={build?.stall_persisted_lapse_days ?? 3} required />
      </Field>
      <Field label="Exam-unscheduled threshold (days)" htmlFor="stall_exam_unscheduled_days">
        <Input id="stall_exam_unscheduled_days" name="stall_exam_unscheduled_days" type="number" min={1} max={365} defaultValue={build?.stall_exam_unscheduled_days ?? 3} required />
      </Field>
      <Field label="No-check-in threshold (days)" htmlFor="stall_no_checkin_days">
        <Input id="stall_no_checkin_days" name="stall_no_checkin_days" type="number" min={1} max={365} defaultValue={build?.stall_no_checkin_days ?? 2} required />
      </Field>
      <Field label="Check-in lapse threshold (days)" htmlFor="stall_checkin_lapsed_days">
        <Input id="stall_checkin_lapsed_days" name="stall_checkin_lapsed_days" type="number" min={1} max={365} defaultValue={build?.stall_checkin_lapsed_days ?? 2} required />
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
