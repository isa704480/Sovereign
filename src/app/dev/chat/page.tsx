import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { isPlanId } from "@/config/plans";

/**
 * Development-only dashboard preview without a Supabase session.
 * Real API keys are used if present; nothing is persisted to Supabase.
 * `?plan=free|starter|pro|ultra` previews plan gating in the UI.
 */
export default async function DevChatPage(props: PageProps<"/dev/chat">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const sp = await props.searchParams;
  const plan = isPlanId(sp.plan) ? sp.plan : "ultra";
  return (
    <Dashboard
      user={{ name: "Mansurov", email: "dev@sovereign.local" }}
      defaultModelId="claude-sonnet-4-5"
      isDev
      plan={plan}
    />
  );
}
