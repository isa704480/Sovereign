/**
 * Agent rejimlari (vertikal paketlar) — "vazifa ber, agent bajaradi".
 * Har rejim modelga maxsus ko'rsatma (system prompt) beradi va kerak bo'lsa
 * research'ni yoqadi. 6 AI tavsiyasidagi asosiy yo'nalish shu.
 */

export type AgentModeIconName = "sparkles" | "code" | "microscope" | "chart" | "pen";

export interface AgentMode {
  id: string;
  name: string;
  /** lucide ikon nomi (UI'da AgentModeIcon orqali chiziladi; emoji emas). */
  icon: AgentModeIconName;
  description: string;
  /** Modelga qo'shiladigan ko'rsatma (bo'sh — umumiy rejim). */
  prompt: string;
  /** Rejim yoqilganda internet tadqiqotini tavsiya qiladi. */
  autoResearch?: boolean;
}

export const AGENT_MODES: AgentMode[] = [
  {
    id: "general",
    name: "Umumiy",
    icon: "sparkles",
    description: "Oddiy suhbat va yordam.",
    prompt: "",
  },
  {
    id: "developer",
    name: "Dasturchi",
    icon: "code",
    description: "Kod yozadi, tuzatadi, test rejasini beradi.",
    prompt:
      "Sen tajribali dasturchi-agentsan. Vazifani boshdan-oxir bajar: reja tuz, to'liq ishlaydigan kod yoz " +
      "(kerak bo'lsa bir nechta fayl — har fayl alohida kod blokida, nomi bilan), qanday test qilishni ayt va " +
      "keyingi qadamlarni sana. Kodni yarim tashlab ketma. Ulangan connectorlar (GitHub, Cowork) bo'lsa foydalan.",
  },
  {
    id: "researcher",
    name: "Tadqiqotchi",
    icon: "microscope",
    description: "Internetdan qidiradi, manba bilan javob beradi.",
    prompt:
      "Sen puxta tadqiqotchi-agentsan. Savolni bir necha manbadan tekshir, faktlarni solishtir va har da'voni " +
      "manba raqami [n] bilan belgila. Noaniq bo'lsa 'tekshirish kerak' deb yoz. Oxirida qisqa xulosa va manbalar ro'yxati ber.",
    autoResearch: true,
  },
  {
    id: "business",
    name: "Biznes tahlil",
    icon: "chart",
    description: "Bozor tahlili, raqobat, hisobot va jadval.",
    prompt:
      "Sen biznes-tahlilchi agentsan. Bozor, raqobatchilar va imkoniyatlarni tuzilgan holda tahlil qil: " +
      "asosiy topilmalar, jadval (agar mos bo'lsa), xavflar va aniq tavsiyalar. Raqamlar bo'lsa manbadan ol, o'ylab topma.",
    autoResearch: true,
  },
  {
    id: "writer",
    name: "Yozuvchi",
    icon: "pen",
    description: "Matn yozadi va tahrirlaydi.",
    prompt:
      "Sen professional matn muallifi-muharrirsan. Aniq, ravon va maqsadga mos yoz. Ohang va uslubni vazifaga moslashtir; " +
      "kerak bo'lsa bir nechta variant ber. Ortiqcha suv quyma.",
  },
];

export const AGENT_MODE_BY_ID: Record<string, AgentMode> = Object.fromEntries(AGENT_MODES.map((m) => [m.id, m]));

export const DEFAULT_AGENT_MODE = "general";
