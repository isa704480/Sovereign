"use client";

import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { fmt, pick } from "@/lib/i18n";
import { useLang, useT } from "@/store/chat";
import { CONTACT_EMAIL, DOCS_URL, GITHUB_URL, LEGAL_ENTITY, LOCATION, STATUS_URL } from "./company";

const linkCls = "rounded-sm transition-colors hover:text-text-primary";

function Col({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">{title}</h2>
      <ul className="space-y-2 text-text-secondary">{children}</ul>
    </div>
  );
}

export function Footer() {
  const t = useT();
  const lang = useLang();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-12 md:px-8 lg:grid-cols-[1.2fr_2fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm text-text-muted">Your AI. Your Truth. Your Data. Forever.</p>
          <ul className="mt-5 space-y-2 text-sm text-text-secondary">
            <li className="flex items-center gap-2">
              <Mail className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              <a href={`mailto:${CONTACT_EMAIL}`} className={`${linkCls} break-all`}>
                {CONTACT_EMAIL}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              {pick(lang, LOCATION)}
            </li>
          </ul>
        </div>

        <nav className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-4">
          <Col title={t("ldFooterProduct")}>
            <li><a href="#how" className={linkCls}>{t("p4dNavHow")}</a></li>
            <li><a href="#features" className={linkCls}>{t("navFeatures")}</a></li>
            <li><a href="#models" className={linkCls}>{t("navModels")}</a></li>
            <li><a href="#privacy" className={linkCls}>{t("navPrivacy")}</a></li>
            <li><a href="#pricing" className={linkCls}>{t("navPricing")}</a></li>
          </Col>
          <Col title={t("p4dFooterCompany")}>
            <li><a href="#about" className={linkCls}>{t("p4dNavAbout")}</a></li>
            <li><a href="#roadmap" className={linkCls}>{t("p4dNavRoadmap")}</a></li>
            <li><a href="#contact" className={linkCls}>{t("p4dNavContact")}</a></li>
            <li><Link href="/login" className={linkCls}>{t("login")}</Link></li>
            <li><Link href="/register" className={linkCls}>{t("ldRegister")}</Link></li>
          </Col>
          <Col title={t("p4dFooterResources")}>
            <li><a href={DOCS_URL} className={linkCls}>{t("p4dNavDocs")}</a></li>
            <li><a href={STATUS_URL} className={linkCls}>{t("p4dContactStatus")}</a></li>
            {GITHUB_URL && (
              <li><a href={GITHUB_URL} className={linkCls} rel="noopener">GitHub</a></li>
            )}
          </Col>
          <Col title={t("ldFooterLegal")}>
            <li><Link href="/privacy" className={linkCls}>{t("ldPrivacyPolicy")}</Link></li>
            <li><Link href="/terms" className={linkCls}>{t("ldTerms")}</Link></li>
            <li><Link href="/refund" className={linkCls}>{t("ldRefund")}</Link></li>
          </Col>
        </nav>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <p>
            © 2026 SOVEREIGN AI. {t("p4dRights")}
            {LEGAL_ENTITY && <> · {fmt(t("p4dOperatedBy"), { entity: LEGAL_ENTITY })}</>}
          </p>
          <span className="font-mono">AES-256-GCM · Zero-knowledge · GDPR</span>
        </div>
      </div>
    </footer>
  );
}
