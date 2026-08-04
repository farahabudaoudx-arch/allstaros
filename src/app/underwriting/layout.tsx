import { ProducerShell } from "@/components/producer/ProducerShell";

export default async function UnderwritingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProducerShell nextPath="/underwriting">{children}</ProducerShell>;
}
