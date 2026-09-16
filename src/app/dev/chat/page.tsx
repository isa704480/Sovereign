import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard/Dashboard";

/**
 * Development-only dashboard preview without a Supabase session.
 * Real API keys are used if present; nothing is persisted to Supabase.
 */
export default function DevChatPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Dashboard
      user={{ name: "Mansurov", email: "dev@sovereign.local" }}
      defaultModelId="claude-sonnet-4-5"
      isDev
    />
  );
}
