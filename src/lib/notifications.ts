// Transactional notification senders for pipeline milestones. Each is
// best-effort and never throws — a mail hiccup must not break the action that
// triggered it. They resolve up-the-tree fields (the builder/upline) with the
// service role, since recruits/producers can't read their upline's person row
// through RLS.

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";
import { newRecruitEmail } from "@/lib/emails/new-recruit";
import { newProducerEmail } from "@/lib/emails/new-producer";
import { promotedToProducerEmail } from "@/lib/emails/promoted-to-producer";

function firstNameOf(full?: string | null): string | undefined {
  return (full ?? "").trim().split(/\s+/)[0] || undefined;
}

/**
 * Email the builder that a freshly-set-up recruit is now in their pipeline.
 * Called once the recruit finishes account setup (real name + state known).
 */
export async function notifyNewRecruit(recruitPersonId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();

    const { data: recruit } = await admin
      .from("recruit")
      .select("id, builder_id, state")
      .eq("person_id", recruitPersonId)
      .maybeSingle();
    if (!recruit?.builder_id) return;

    const { data: person } = await admin
      .from("person")
      .select("full_name")
      .eq("id", recruitPersonId)
      .maybeSingle();

    const { data: builder } = await admin
      .from("person")
      .select("full_name, email")
      .eq("id", recruit.builder_id)
      .maybeSingle();
    if (!builder?.email) return;

    const mail = newRecruitEmail({
      builderFirstName: firstNameOf(builder.full_name),
      recruitName: person?.full_name ?? "A new recruit",
      state: recruit.state ?? undefined,
      recruitUrl: `${getAppUrl()}/producer/recruiting/recruit/${recruit.id}`,
    });
    await sendEmail({ to: builder.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("[notify] new-recruit failed (ignored):", err);
  }
}

/**
 * On promotion to producer: congratulate the new producer AND give their builder
 * a heads-up. Called from the promote-to-producer actions right after the
 * is_producer flag flips.
 */
export async function notifyProducerPromotion(producerPersonId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();

    const { data: producer } = await admin
      .from("person")
      .select("full_name, email, upline_id")
      .eq("id", producerPersonId)
      .maybeSingle();
    if (!producer) return;

    // 1) Congrats → the new producer.
    if (producer.email) {
      const mail = promotedToProducerEmail({
        firstName: firstNameOf(producer.full_name),
        dashboardUrl: `${getAppUrl()}/producer`,
      });
      await sendEmail({ to: producer.email, subject: mail.subject, html: mail.html, text: mail.text });
    }

    // 2) Heads-up → their builder (upline).
    if (producer.upline_id) {
      const { data: builder } = await admin
        .from("person")
        .select("full_name, email")
        .eq("id", producer.upline_id)
        .maybeSingle();
      if (builder?.email) {
        const mail = newProducerEmail({
          builderFirstName: firstNameOf(builder.full_name),
          producerName: producer.full_name ?? "A team member",
          producerUrl: `${getAppUrl()}/producer/team/${producerPersonId}`,
        });
        await sendEmail({ to: builder.email, subject: mail.subject, html: mail.html, text: mail.text });
      }
    }
  } catch (err) {
    console.error("[notify] producer-promotion failed (ignored):", err);
  }
}
