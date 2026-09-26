import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listConversations } from "@/app/actions/chat";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { displayName, effectivePlan, getProfile, planRenews, planStatus } from "@/lib/auth/profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n-server";
import type { Conversation } from "@/store/chat";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return { title: t("chChatTitle") };
}

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  // To'lovdan qaytish: checkout /app?paid=1 (muvaffaqiyat) yoki ?paid=0 (bekor/xato) ga yo'naltiradi.
  // Dashboard xabar ko'rsatadi, URL'ni tozalaydi va tarif yangilanguncha kutadi.
  const paidParam = (await searchParams).paid;
  const paymentReturn = paidParam === "1" ? "success" : paidParam === "0" ? "failed" : null;

  // Local design preview without Supabase (development only).
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV !== "development") redirect("/login");
    return (
      <Dashboard
        user={{ name: "Mansurov", email: "dev@sovereign.local" }}
        defaultModelId="claude-sonnet-4-5"
        isDev
        paymentReturn={paymentReturn}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app");

  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const initial = (await listConversations()) as Conversation[];

  // Tarif holati (plan_status bilan bir xil hisob) — expired/expiring_soon banneri uchun.
  // Karta (Dodo) obunasi o'zi yangilanadi — unga "tugayapti" o'rniga "yangilanadi" ko'rsatiladi.
  const status = planStatus(profile);
  const renews = status.state === "free" ? false : await planRenews(supabase, user.id, status.paidPlan);

  return (
    <Dashboard
      user={{
        name: displayName(user, profile),
        email: user.email ?? "",
        avatarUrl: profile.avatar_url,
      }}
      defaultModelId={profile.default_model}
      initialConversations={initial}
      plan={effectivePlan(profile).id}
      memoryEnabled={profile.memory_enabled}
      planState={status.state}
      daysLeft={status.daysLeft}
      planExpiresAt={status.expiresAt}
      paidPlan={status.paidPlan}
      planRenews={renews}
      paymentReturn={paymentReturn}
    />
  );
}
