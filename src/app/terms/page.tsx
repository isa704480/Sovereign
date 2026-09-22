import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Foydalanish shartlari · SOVEREIGN AI",
  description: "SOVEREIGN AI xizmatidan foydalanish shartlari.",
};

const UPDATED = "2026-09-22";

export default function TermsPage() {
  return (
    <main className="flex-1">
      <Navbar signedIn={false} />
      <article className="mx-auto max-w-2xl px-5 pb-24 pt-32 md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Huquqiy</p>
        <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">Foydalanish shartlari</h1>
        <p className="mt-3 text-sm text-text-muted">Oxirgi yangilanish: {UPDATED}</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-text-secondary">
          <Section n="1" title="Xizmat haqida">
            SOVEREIGN AI (&quot;Xizmat&quot;) — bitta interfeys orqali ko&apos;plab AI modellariga kirish beruvchi
            obunaga asoslangan dasturiy xizmat (SaaS). Xizmat <a className="text-primary-soft hover:text-text-primary" href="https://sovhq.vercel.app">sovhq.vercel.app</a> veb-ilovasi va buyruq qatori (CLI) vositasi orqali taqdim etiladi.
            Ushbu shartlarni qabul qilib, siz ular bilan bog&apos;lanishga rozilik bildirasiz.
          </Section>
          <Section n="2" title="Hisob">
            Xizmatdan foydalanish uchun hisob yaratasiz. Hisobingiz ma&apos;lumotlari (parol, kirish) maxfiyligini
            saqlash sizning zimmangizda. Hisobingiz orqali amalga oshirilgan barcha harakatlar uchun siz javobgarsiz.
            18 yoshdan katta bo&apos;lishingiz yoki qonuniy vakilingiz roziligiga ega bo&apos;lishingiz kerak.
          </Section>
          <Section n="3" title="Obuna va to'lov">
            Xizmat bepul (Free) va pullik (Starter, Pro, Ultra) tariflarni taklif qiladi. Pullik tariflar
            <strong className="text-text-primary"> oylik avtomatik yangilanadigan obuna</strong> asosida hisoblanadi.
            To&apos;lov muvaffaqiyatli o&apos;tgach, tegishli tarif imkoniyatlari darhol ochiladi. Narxlar oldindan
            ogohlantirilib o&apos;zgartirilishi mumkin. To&apos;lovlar Dodo Payments (karta) yoki kripto shlyuzi orqali
            qayta ishlanadi.
          </Section>
          <Section n="4" title="Ruxsat etilgan foydalanish">
            Xizmatdan qonunga zid, boshqalarning huquqlarini buzuvchi, zararli yoki firibgar maqsadlarda
            foydalanmaslikka rozisiz. AI javoblari ma&apos;lumot xarakteriga ega bo&apos;lib, professional (tibbiy,
            huquqiy, moliyaviy) maslahat o&apos;rnini bosmaydi. Xizmatni suiiste&apos;mol qilish hisob to&apos;xtatilishiga
            olib kelishi mumkin.
          </Section>
          <Section n="5" title="Maxfiylik va ma'lumotlar">
            Xotira va shaxsiy ma&apos;lumotlaringiz AES-256-GCM bilan shifrlanadi va faqat sizning qurilmangizda
            ochiladi (zero-knowledge). Batafsil ma&apos;lumot <Link className="text-primary-soft hover:text-text-primary" href="/privacy">Maxfiylik siyosati</Link>da.
            Xizmat ma&apos;lumotlaringizni uchinchi tomonlarga sotmaydi.
          </Section>
          <Section n="6" title="Intellektual mulk">
            Xizmat, uning dizayni, kodi va brendi bizga tegishli. AI yordamida yaratgan chiqishlaringiz sizniki;
            biz ularга egalik da&apos;vo qilmaymiz. Uchinchi tomon AI modellari o&apos;z provayderlarining shartlariga
            bo&apos;ysunadi.
          </Section>
          <Section n="7" title="Kafolatlar cheklovi">
            Xizmat &quot;boricha&quot; (as is) taqdim etiladi. Biz uzluksiz yoki xatosiz ishlashni kafolatlamaymiz.
            Qonun ruxsat bergan darajada, bilvosita zararlar uchun javobgarligimiz siz oxirgi 12 oyda to&apos;lagan
            summadan oshmaydi.
          </Section>
          <Section n="8" title="Bekor qilish va to'xtatish">
            Obunani istalgan vaqtda hisobingizdan bekor qilishingiz mumkin; kirish to&apos;langan davr oxirigacha
            saqlanadi. Shartlarni buzsangiz, hisobingizni to&apos;xtatishimiz mumkin.
          </Section>
          <Section n="9" title="O'zgarishlar">
            Ushbu shartlarni vaqti-vaqti bilan yangilashimiz mumkin. Muhim o&apos;zgarishlar haqida xabar beramiz.
            Yangilanishdan keyin foydalanishda davom etsangiz — yangi shartlarni qabul qilgan hisoblanasiz.
          </Section>
          <Section n="10" title="Aloqa">
            Savollar bo&apos;yicha: <a className="text-primary-soft hover:text-text-primary" href="mailto:isa704480@gmail.com">isa704480@gmail.com</a>.
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
      <p className="mt-2">{children}</p>
    </section>
  );
}
