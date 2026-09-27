/**
 * Webview ↔ kengaytma xosti chegarasidan o'tadigan HAR BIR xabar shu yerda tekshiriladi.
 * Webview — alohida, ishonchsiz kontekst (unga model chiqishi tushadi), shuning uchun
 * undan kelgan har bir maydon turi, uzunligi va ruxsat etilgan qiymatlari bo'yicha
 * qat'iy tekshiriladi; noma'lum xabar `null` beradi va indamay tashlanadi.
 *
 * Sof modul — `vscode` ni import qilmaydi, `node --test` bilan sinaladi.
 */

export const MAX_PROMPT_CHARS = 8_000;
export const MAX_APPLY_CHARS = 200_000;
export const MAX_URL_CHARS = 2_000;

export type InboundMessage =
  | { type: "ready" }
  | { type: "ask"; text: string; useContext: boolean }
  | { type: "stop" }
  | { type: "newChat" }
  | { type: "apply"; index: number }
  | { type: "copy"; index: number }
  | { type: "signIn" }
  | { type: "useCliLogin" }
  | { type: "openSettings" }
  | { type: "openLink"; url: string };

export type OutboundMessage =
  | { type: "init"; strings: Record<string, string>; lang: string; signedIn: boolean; model: string }
  | { type: "status"; signedIn: boolean; model: string }
  | { type: "context"; label: string | null }
  | { type: "user"; text: string }
  | { type: "start"; id: number }
  | { type: "delta"; id: number; text: string }
  | { type: "end"; id: number; html: string; blocks: number }
  | { type: "busy"; value: boolean }
  | { type: "error"; text: string }
  | { type: "notice"; text: string }
  | { type: "authCode"; code: string; url: string }
  | { type: "authEnd" }
  | { type: "reset" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // Boshqaruv belgilari (NUL, ANSI qochish) tashlanadi — jurnal/terminalni buzmasin.
  const clean = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (!clean.length || clean.length > max) return null;
  return clean;
}

function index(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 999) return null;
  return v;
}

/** Webview'dan kelgan xom `event.data` → tekshirilgan xabar yoki `null`. */
export function parseInbound(raw: unknown): InboundMessage | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "ready":
    case "stop":
    case "newChat":
    case "signIn":
    case "useCliLogin":
    case "openSettings":
      return { type } as InboundMessage;

    case "ask": {
      const text = str(raw.text, MAX_PROMPT_CHARS);
      if (text === null) return null;
      return { type: "ask", text, useContext: raw.useContext !== false };
    }

    case "apply":
    case "copy": {
      const i = index(raw.index);
      if (i === null) return null;
      return { type, index: i };
    }

    case "openLink": {
      const url = str(raw.url, MAX_URL_CHARS);
      if (url === null) return null;
      // Ikkinchi qavat: markdown qatlami ham faqat https chiqaradi, bu yerda qayta tekshiramiz.
      if (!/^https:\/\/[^\s<>"'`]+$/i.test(url)) return null;
      return { type: "openLink", url };
    }

    default:
      return null;
  }
}

/** Kengaytmadan webview'ga yuboriladigan xabarni tekshiradi (dasturchi xatosini erta topish uchun). */
export function isOutbound(msg: OutboundMessage): boolean {
  return isRecord(msg) && typeof (msg as { type?: unknown }).type === "string";
}
