import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";

export default async function LegacyFamilyTreePage({params}:{params:Promise<{projectId:string}>}){
  await requireAdminSession();
  const projectId=Number.parseInt((await params).projectId,10);
  redirect(`/admin/projects/${projectId}/family-trees/all`);
}
