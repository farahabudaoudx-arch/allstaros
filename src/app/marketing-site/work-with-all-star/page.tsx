import type { Metadata } from "next";
import { WorkWithAllStarPage } from "@/components/marketing/WorkWithAllStarPage";

export const metadata: Metadata = {
  title: "Work With All Star | All Star Life Group",
  description: "Build A Career Helping Families Protect Their Loved Ones",
};

export default function Page() {
  return <WorkWithAllStarPage />;
}
