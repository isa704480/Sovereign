import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin · SOVEREIGN" };

export default async function AdminPage() {
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
  const [summary, daily, plans, recent] = await Promise.all([
    supabase.rpc("admin_users_summary"),
    supabase.rpc("admin_daily_stats", { p_days: 30 }),
    supabase.rpc("admin_plan_distribution"),
    supabase.rpc("admin_recent_orders", { p_limit: 25 }),
  ]);

  return (
    <AdminDashboard
      admin={{ name: profile.full_name ?? user.email ?? "Admin", email: profile.email ?? user.email ?? "" }}
      summary={(Array.isArray(summary.data) ? summary.data[0] : summary.data) ?? null}
      daily={daily.data ?? []}
      plans={plans.data ?? []}
      recentOrders={recent.data ?? []}
    />
  );
}
