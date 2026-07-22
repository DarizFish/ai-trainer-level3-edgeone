import { redirect } from "next/navigation";
import AccountForm from "@/components/AccountForm";
import { getAccountUser, safeRelativeReturnPath } from "@/lib/account-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mode?: string; return_to?: string }> }) {
  const query = await searchParams;
  const returnTo = safeRelativeReturnPath(query.return_to);
  const user = await getAccountUser();
  if (user) redirect(returnTo);
  const initialMode = query.mode === "register" ? "register" : "login";

  return <main className="account-page paper-texture"><AccountForm initialMode={initialMode} returnTo={returnTo} /></main>;
}
