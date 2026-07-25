import { redirect } from "next/navigation";
import { getCurrentVersion } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function BillOfRightsIndex() {
  const current = await getCurrentVersion();
  redirect(`/v/${current?.version ?? "0.1.0"}`);
}
