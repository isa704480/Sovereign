"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { useT } from "@/store/chat";

export function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between md:px-8">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm text-text-muted">Your AI. Your Truth. Your Data. Forever.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div>
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">{t("ldFooterProduct")}</div>
            <ul className="space-y-2 text-text-secondary">
              <li><a href="#features" className="hover:text-text-primary">{t("navFeatures")}</a></li>
              <li><a href="#models" className="hover:text-text-primary">{t("navModels")}</a></li>
              <li><a href="#privacy" className="hover:text-text-primary">{t("navPrivacy")}</a></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">{t("ldFooterAccount")}</div>
            <ul className="space-y-2 text-text-secondary">
              <li><Link href="/login" className="hover:text-text-primary">{t("login")}</Link></li>
              <li><Link href="/register" className="hover:text-text-primary">{t("ldRegister")}</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">{t("ldFooterLegal")}</div>
            <ul className="space-y-2 text-text-secondary">
              <li><Link href="/terms" className="hover:text-text-primary">{t("ldTerms")}</Link></li>
              <li><Link href="/refund" className="hover:text-text-primary">{t("ldRefund")}</Link></li>
              <li><Link href="/privacy" className="hover:text-text-primary">{t("ldPrivacyPolicy")}</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <span>{t("ldCopyright")}</span>
          <span className="font-mono">AES-256-GCM · Zero-knowledge · GDPR</span>
        </div>
      </div>
    </footer>
  );
}
