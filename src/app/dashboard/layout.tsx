import { redirect } from "next/navigation";

/**
 * The /dashboard builder view is retired — superseded by the /producer app.
 * A layout wraps every nested segment, so redirecting here walls off the whole
 * tree (/dashboard, /dashboard/flagged, /dashboard/recruits/*, …) regardless of
 * how it's reached (direct link, old bookmark, stale redirect).
 */
export default function DashboardLayout() {
  redirect("/producer");
}
