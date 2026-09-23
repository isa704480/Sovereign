"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useT } from "@/store/chat";

type Family = { key: string; label: string; count: number; auto?: string };

export function ModelCompare() {
  const t = useT();
  const [families, setFamilies] = useState<Family[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/models?families=1")
      .then((r) => r.json())
      .then((d) => alive && setFamilies(d.families ?? []))
      .catch(() => alive && setFamilies([]));
    return () => {
      alive = false;
    };
  }, []);

  const total = families?.reduce((a, f) => a + f.count, 0) ?? 0;
  const max = families?.[0]?.count ?? 1;
  const shown = (families ?? []).slice(0, 12);
  // "{n} model." — son alohida rangda, shuning uchun gapni {n} atrofida bo'lamiz.
  const [modelsPre, modelsPost = ""] = t("ldCompareModels").split("{n}");

  return (
    <section className="relative mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("ldCompareEyebrow")}</span>
        <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-5xl">
          {modelsPre}
          <span className="tabular-nums text-gradient-brand">{total ? total.toLocaleString() : "1700+"}</span>
          {modelsPost}
          <br />
          {t("ldCompareFamilies")}
        </h2>
        <p className="mt-4 text-base text-text-secondary">{t("ldCompareSub")}</p>
      </div>

      {/* solishtiruv paneli — bitta yuza, hairline qatorlar */}
      <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-border bg-white/[0.015]">
        {!families && <div className="px-5 py-8 text-center text-sm text-text-muted">{t("ldLoading")}</div>}
        {shown.map((f, i) => (
          <motion.div
            key={f.key}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
            className="flex items-center gap-4 px-5 py-3"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
          >
            <span className="w-28 shrink-0 truncate text-sm font-semibold text-text-primary">{f.label}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: "linear-gradient(90deg, #5B50F0, #8B7DFF)" }}
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.max(6, (f.count / max) * 100)}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.04, ease: "easeOut" }}
              />
            </span>
            <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-text-secondary">{f.count}</span>
          </motion.div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-text-muted">{t("ldCompareFootnote")}</p>
    </section>
  );
}
