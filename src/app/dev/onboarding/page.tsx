import { notFound } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

/**
 * Development-only preview of the onboarding flow without a Supabase session.
 * Completion returns the recommendation but does not persist anything.
 */
export default function DevOnboardingPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OnboardingFlow />;
}
