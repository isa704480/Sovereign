"use client";

import { eventLine, TYPE_LABEL } from "@/lib/ops/describe";
import { tashkentDate, tashkentTime } from "@/lib/ops/format";
import type { OpsEvent } from "@/lib/ops/store";
import { useLang, useT } from "@/store/chat";

/**
 * Admin: "Ops lentasi" — oxirgi 50 ta ops hodisasi (Telegram botiga ketadigan lenta bilan bir xil).
 * Ma'lumot serverda admin tekshiruvidan keyin o'qiladi (getOpsFeed); faqat niqoblangan maydonlar.
 */
export function OpsFeedCard({ events }: { events: OpsEvent[] }) {
  const t = useT();
  const lang = useLang();
  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">{t("p22oCardTitle")}</div>
      <p className="mb-4 text-xs text-white/50">{t("p22oCardHint")}</p>
      {events.length === 0 ? (
        <div className="rounded-xl border border-white/5 p-4 text-sm text-white/50">{t("p22oCardEmpty")}</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2 font-medium">{t("p22oCardColTime")}</th>
                <th className="px-3 py-2 font-medium">{t("p22oCardColType")}</th>
                <th className="px-3 py-2 font-medium">{t("p22oCardColDetails")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-t border-white/5 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-white/50 tabular-nums">
                    {tashkentDate(ev.t).slice(0, 5)} {tashkentTime(ev.t)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-white/70">{t(TYPE_LABEL[ev.type])}</td>
                  <td className="px-3 py-2 text-white/80">{eventLine(ev, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
