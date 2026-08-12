import type { Metadata } from "next";
import { TestProjectPortal } from "./test-project-portal";

export const metadata: Metadata = {
  title: "Paid coding project | All Star OS",
  description: "Candidate portal for the All Star OS paid coding project.",
};

export default function TestProjectPage() {
  return <TestProjectPortal />;
}
