import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Maxfiylik siyosati · SOVEREIGN AI",
  description: "SOVEREIGN AI qanday ma'lumot to'playdi, saqlaydi va himoya qiladi.",
};

const UPDATED = "2026-09-22";
const EMAIL = "isa704480@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="flex-1">
      <Navbar signedIn={false} />
      <article className="mx-auto max-w-2xl px-5 pb-24 pt-32 md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Huquqiy</p>
        <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">Maxfiylik siyosati</h1>
        <p className="mt-3 text-sm text-text-muted">Oxirgi yangilanish: {UPDATED}</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-text-secondary">
          <Section n="1" title="Qanday ma'lumot to'playmiz">
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li><strong className="text-text-primary">Hisob:</strong> email, ism (ixtiyoriy), autentifikatsiya identifikatori.</li>
              <li><strong className="text-text-primary">Foydalanish:</strong> so&apos;rovlar soni, tanlangan model, tarif holati — xizmatni ta&apos;minlash uchun.</li>
              <li><strong className="text-text-primary">Xotira/suhbatlar:</strong> siz saqlagan kontent — <strong className="text-text-primary">shifrlangan</strong> holda (quyida).</li>
              <li><strong className="text-text-primary">To&apos;lov:</strong> to&apos;lov shlyuzi (Dodo Payments/kripto) tomonidan qayta ishlanadi; biz karta ma&apos;lumotlaringizni saqlamaymiz.</li>
            </ul>
          </Section>
          <Section n="2" title="Zero-knowledge shifrlash">
            Xotira va shaxsiy kontentingiz <strong className="text-text-primary">AES-256-GCM</strong> bilan shifrlanadi.
            Shifrlash kaliti sizning qurilmangizda ochiladi — biz uni ko&apos;ra olmaymiz (zero-knowledge). Serverda
            ma&apos;lumot faqat shifrlangan ko&apos;rinishda turadi.
          </Section>
          <Section n="3" title="Blind Prompting">
            AI modelga so&apos;rov yuborilishidan oldin ism, raqam, kompaniya kabi maxfiy bo&apos;laklar maskalanadi.
            Shu tufayli AI provayderlari sizning haqiqiy ma&apos;lumotingizni ko&apos;rmaydi.
          </Section>
          <Section n="4" title="Ma'lumotdan qanday foydalanamiz">
            Ma&apos;lumotni faqat xizmatni ta&apos;minlash, hisobingizni boshqarish, xavfsizlik va qonuniy majburiyatlar
            uchun ishlatamiz. <strong className="text-text-primary">Biz ma&apos;lumotingizni sotmaymiz</strong> va reklama
            uchun uchinchi tomonlarga bermaymiz.
          </Section>
          <Section n="5" title="Uchinchi tomon xizmatlari">
            Xizmat ishlashi uchun: AI model provayderlari (maskalangan so&apos;rov qayta ishlash uchun), hosting
            (Vercel), ma&apos;lumotlar bazasi (Supabase) va to&apos;lov shlyuzlari (Dodo Payments, kripto). Har biri
            o&apos;z maxfiylik siyosatiga ega.
          </Section>
          <Section n="6" title="Saqlash muddati">
            Ma&apos;lumotingiz hisobingiz faol bo&apos;lganicha saqlanadi. Hisobingizni yoki alohida yozuvlarni istalgan
            vaqtda o&apos;chirishingiz mumkin — o&apos;chirilgach, ular tizimdan olib tashlanadi.
          </Section>
          <Section n="7" title="Sizning huquqlaringiz (GDPR)">
            Ma&apos;lumotingizga kirish, tuzatish, eksport qilish va o&apos;chirishni so&apos;rash huquqiga egasiz. Xotira
            grafi to&apos;liq eksport qilinadi va istalgan vaqtda o&apos;chiriladi.
          </Section>
          <Section n="8" title="Cookie va mahalliy saqlash">
            Faqat zarur cookie&apos;lar (sessiya, autentifikatsiya) va brauzer mahalliy xotirasi (afzalliklar)
            ishlatiladi. Kuzatuv/reklama cookie&apos;lari yo&apos;q.
          </Section>
          <Section n="9" title="Bolalar">
            Xizmat 18 yoshdan katta foydalanuvchilar uchun. Biz bilib turib bolalardan ma&apos;lumot to&apos;plamaymiz.
          </Section>
          <Section n="10" title="Aloqa">
            Maxfiylik bo&apos;yicha savollar: <a className="text-primary-soft hover:text-text-primary" href={`mailto:${EMAIL}`}>{EMAIL}</a>.
            Batafsil: <Link className="text-primary-soft hover:text-text-primary" href="/terms">Foydalanish shartlari</Link>.
          </Section>
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
      <div className="mt-2">{children}</div>
    </section>
  );
}
