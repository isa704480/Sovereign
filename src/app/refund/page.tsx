import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Pul qaytarish siyosati · SOVEREIGN AI",
  description: "SOVEREIGN AI obunalari uchun pul qaytarish va bekor qilish siyosati.",
};

const UPDATED = "2026-09-22";

export default function RefundPage() {
  return (
    <main className="flex-1">
      <Navbar signedIn={false} />
      <article className="mx-auto max-w-2xl px-5 pb-24 pt-32 md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Huquqiy</p>
        <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">Pul qaytarish siyosati</h1>
        <p className="mt-3 text-sm text-text-muted">Oxirgi yangilanish: {UPDATED}</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-text-secondary">
          <Section n="1" title="Obuna modeli">
            SOVEREIGN AI — oylik avtomatik yangilanadigan raqamli obuna. To&apos;lov muvaffaqiyatli o&apos;tgach,
            tarif imkoniyatlari darhol va avtomatik ochiladi (inson aralashuvisiz).
          </Section>
          <Section n="2" title="7 kunlik qaytarish (birinchi to'lov)">
            Har qanday pullik tarifning <strong className="text-text-primary">birinchi to&apos;lovi</strong> uchun,
            agar xizmatdan sezilarli darajada foydalanmagan bo&apos;lsangiz, <strong className="text-text-primary">7 kun ichida</strong>
            to&apos;liq pul qaytarishni so&apos;rashingiz mumkin. So&apos;rov ko&apos;rib chiqilib, mos bo&apos;lsa summa dastlabki
            to&apos;lov usuliga qaytariladi.
          </Section>
          <Section n="3" title="Bekor qilish">
            Obunani istalgan vaqtda hisobingizdan bekor qilishingiz mumkin. Bekor qilinganda keyingi to&apos;lov
            olinmaydi; kirish esa joriy to&apos;langan davr oxirigacha saqlanadi. Yangilanish sanasidan oldin bekor
            qiling — shunda keyingi davr uchun hisoblanmaysiz.
          </Section>
          <Section n="4" title="Qaytarilmaydigan holatlar">
            Quyidagilar qaytarilmaydi: (a) 7 kunlik muddat o&apos;tgan yangilanish davrlari; (b) xizmat sezilarli
            darajada ishlatilgan davrlar; (c) shartlar buzilishi sababli to&apos;xtatilgan hisoblar. Ishlatilgan
            token/kvota qismli qaytarishga asos bo&apos;lmaydi.
          </Section>
          <Section n="5" title="Kripto to'lovlari">
            Kripto shlyuzi orqali qilingan to&apos;lovlar blokcheyn tabiati tufayli qaytarilmasligi mumkin.
            Bunday holatlar alohida, individual asosda ko&apos;rib chiqiladi.
          </Section>
          <Section n="6" title="Qanday so'rash kerak">
            Pul qaytarish yoki bekor qilish uchun <a className="text-primary-soft hover:text-text-primary" href="mailto:isa704480@gmail.com">isa704480@gmail.com</a> ga
            hisobingiz emaili va to&apos;lov sanasi bilan murojaat qiling. So&apos;rovlar odatda 3–5 ish kuni ichida ko&apos;rib chiqiladi.
          </Section>
          <p className="text-sm text-text-muted">
            Batafsil shartlar: <Link className="text-primary-soft hover:text-text-primary" href="/terms">Foydalanish shartlari</Link>.
          </p>
        </div>
      </article>
      <Footer />
    </main>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold text-text-primary">
        <span className="mr-2 font-mono text-sm text-text-muted">{n}.</span>
        {title}
      </h2>
      <p className="mt-2">{children}</p>
    </section>
  );
}
