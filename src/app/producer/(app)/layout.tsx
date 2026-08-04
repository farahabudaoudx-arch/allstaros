import { ProducerShell } from "@/components/producer/ProducerShell";

/**
 * Chrome for every real producer page reached from the sidebar. The frame
 * itself lives in ProducerShell, shared with the Sidekick and Underwriting
 * Wizard routes so all three carry the same nav.
 */
export default async function ProducerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProducerShell nextPath="/producer">{children}</ProducerShell>;
}
