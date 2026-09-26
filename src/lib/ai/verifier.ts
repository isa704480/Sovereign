import "server-only";

/**
 * Verifier: modelning javobidan shubhali faktlarni ajratib chiqarish.
 * Arzon model (gpt-4o-mini) javobning har bir "muhim da'vosini" tekshiradi va
 * uch turdagi baholash beradi: correct / suspicious / unverifiable.
 * UI'da foydalanuvchiga ⚠️ badge ko'rsatiladi va u tuzatilishi mumkin.
 */

export interface VerifierIssue {
  fact: string;
  verdict: "correct" | "suspicious" | "unverifiable";
  note?: string;
}

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const VERIFIER_MODEL = "openai/gpt-4o-mini";

const SYSTEM = [
  "Sen fakt-tekshirgichsan. Berilgan javobdan aniqlik talab qiladigan (sana, ism, statistika,",
  "kutubxona nomi, API funksiyasi, versiyalar, iqtiboslar) da'volarni ajratib, har birini",
  "baholaysan: 'correct' (aniq to'g'ri), 'suspicious' (shubhali/xato ehtimoli katta),",
  "'unverifiable' (tekshirib bo'lmaydigan). Faqat JSON qaytar. Umumiy fikrlar, mavhum",
  "tavsiflar, kod uslubi haqidagi da'volarni tekshirma. Maksimum 5 ta muhim faktni tanla.",
].join(" ");

const JSON_SCHEMA_HINT = `{
  "issues": [
    { "fact": "Napoleon 1821 yilda Wagram'da vafot etgan", "verdict": "suspicious", "note": "Napoleon Saint Helena'da vafot etgan" },
    { "fact": "Next.js 15 Turbopack bilan keladi", "verdict": "correct" }
  ]
}`;

export async function verifyAnswer(question: string, answer: string): Promise<VerifierIssue[]> {
  if (!process.env.OPENROUTER_API_KEY) return [];
  if (!answer || answer.length < 200) return []; // qisqa javoblarga arzimaydi
  try {
    const res = await fetch(OPENROUTER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://soveregn.xyz",
        "X-Title": "SOVEREIGN Verifier",
      },
      body: JSON.stringify({
        model: VERIFIER_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `SAVOL:\n${question.slice(0, 1500)}\n\nJAVOB:\n${answer.slice(0, 6000)}\n\nJSON formatida qaytar:\n${JSON_SCHEMA_HINT}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];
    const parsed = JSON.parse(content) as { issues?: VerifierIssue[] };
    return (parsed.issues ?? [])
      .filter((i) => i && typeof i.fact === "string" && ["correct", "suspicious", "unverifiable"].includes(i.verdict))
      .slice(0, 5);
  } catch {
    return [];
  }
}
