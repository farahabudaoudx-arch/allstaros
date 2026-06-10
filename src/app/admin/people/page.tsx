import { redirect } from "next/navigation";

// People is split into Builders / Producers / Recruits — land on Builders.
export default function AdminPeopleIndex() {
  redirect("/admin/people/builders");
}
