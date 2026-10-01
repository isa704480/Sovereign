import { redirect } from "next/navigation";
import { getServerT } from "@/lib/i18n-server";
import { AdminDashboard, type OnboardingStats, type ModelStats } from "@/components/admin/AdminDashboard";
import { createClient } from "@/lib/supabase/server";
import { parseEconRange } from "@/lib/econ/unit-economics";
import { getUnitEconomics } from "@/lib/econ/unit-economics.server";
import { getBudgetSnapshot } from "@/lib/econ/budget.server";
import { OpsFeedCard } from "@/components/admin/OpsFeedCard";
import { getOpsFeed } from "@/lib/ops/ops.server";
import type { SurveyStats } from "@/components/admin/OnboardingSurveyCard";

export async function generateMetadata() {
  const t = await getServerT();
  return { title: t("p21AdminTitle") };
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const econDays = parseEconRange((await searchParams).econ);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  // Admin ekanligini tekshirish
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    redirect("/app");
  }

  // Barcha analytics'larni parallel yuklaymiz
  const [summary, daily, plans, recent, onboarding, models, economics, budget, opsFeed, survey] = await Promise.all([
    supabase.rpc("admin_users_summary"),
    supabase.rpc("admin_daily_stats", { p_days: 30 }),
    supabase.rpc("admin_plan_distribution"),
    supabase.rpc("admin_recent_orders", { p_limit: 25 }),
    // 0020 migratsiyasi ishga tushmagan bo'lsa null keladi — panel "ma'lumot yo'q" ko'rsatadi.
    supabase.rpc("admin_onboarding_stats"),
    // 0021 — qaysi model ko'p ishlatilgan va qanchalik yaxshi ishlagani.
    supabase.rpc("admin_model_stats"),
    // Unit economics — service role FAQAT shu yerda, is_admin tekshiruvidan keyin (serverda).
    getUnitEconomics(econDays),
    // API byudjeti (50% qoidasi) — guard holati va OpenRouter balansi; hech qachon otmaydi.
    getBudgetSnapshot(),
    // Ops lentasi (Telegram bot bilan bir xil hodisalar, niqoblangan) — is_admin tekshiruvidan keyin.
    getOpsFeed(50),
    // 0044 — so'rovnoma javoblari foizlari + registratsiya funnel. Hech qachon otmaydi.
    Promise.resolve(supabase.rpc("admin_onboarding_full_stats"))
      .then((r) => (r.data as SurveyStats | null) ?? null)
      .catch((): SurveyStats | null => null),
  ]);

  return (
    <>
      <AdminDashboard
        admin={{ name: profile.full_name ?? user.email ?? "Admin", email: profile.email ?? user.email ?? "" }}
        summary={(Array.isArray(summary.data) ? summary.data[0] : summary.data) ?? null}
        daily={daily.data ?? []}
        plans={plans.data ?? []}
        recentOrders={recent.data ?? []}
        onboarding={(onboarding.data as OnboardingStats | null) ?? null}
        models={(models.data as ModelStats | null) ?? null}
        economics={economics}
        econDays={econDays}
        budget={budget}
        survey={survey}
      />
      {/* Ops lentasi — alohida komponent (dashboard'ga tegmasdan, pastda). */}
      <div className="bg-[#060812] text-white/90">
        <div className="mx-auto max-w-7xl px-6 pb-10">
          <OpsFeedCard events={opsFeed} />
        </div>
      </div>
    </>
  );
}
