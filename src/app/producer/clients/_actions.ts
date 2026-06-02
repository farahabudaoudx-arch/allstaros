"use server";

import { revalidatePath } from "next/cache";

// Invalidate every server-rendered route under /producer/clients so that data
// mutations made from client components (e.g. marking a deposit received)
// don't leave a stale KPI count or filter list when the user navigates back.
export async function revalidateClientsView() {
  revalidatePath("/producer/clients", "layout");
}
