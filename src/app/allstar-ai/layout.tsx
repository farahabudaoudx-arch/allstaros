import { ProducerShell } from "@/components/producer/ProducerShell";

export default async function AllStarAiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProducerShell nextPath="/allstar-ai">{children}</ProducerShell>;
}
