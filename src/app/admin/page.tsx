import { redirect } from "next/navigation";

export default function AdminLanding() {
  redirect("/admin/signers");
}
