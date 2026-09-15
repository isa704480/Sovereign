import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/brand/Logo";
import { MODEL_BY_ID } from "@/config/models";
import { displayName, getProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

/** Phase 2 replaces this with the chat dashboard. */
export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app");

  const profile = await getProfile(supabase, user.id);
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const model = MODEL_BY_ID[profile.default_model] ?? MODEL_BY_ID["claude-sonnet-4-5"];
  const name = displayName(user, profile);

  return (
    <main className="relative flex flex-1 flex-col">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: `radial-gradient(50% 40% at 50% 0%, ${model.primary}22 0%, transparent 70%), #060812` }}
      />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 md:px-8">
        <Logo />
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <LogOut className="size-4" /> Chiqish
          </button>
        </form>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 pb-24 text-center md:px-8">
        <span
          className="flex size-16 items-center justify-center rounded-2xl text-3xl"
          style={{ background: `${model.primary}22`, color: model.primary, boxShadow: `0 0 32px ${model.primary}40` }}
        >
          {model.glyph}
        </span>
        <h1 className="font-display mt-6 text-3xl font-extrabold text-text-primary md:text-4xl">
          Xush kelibsiz, {name}
        </h1>
        <p className="mt-3 max-w-md text-text-secondary">
          Sizning default modelingiz: <span className="font-medium text-text-primary">{model.name}</span>.
          Chat dashboard va model temalari keyingi bosqichda ulanadi.
        </p>
        <div className="mt-8 rounded-2xl border border-border bg-bg-elevated/60 px-5 py-4 text-left font-mono text-xs text-text-muted">
          <div>user: {user.email}</div>
          <div>default_model: {profile.default_model}</div>
          <div>onboarding_completed: true</div>
        </div>
      </section>
    </main>
  );
}
