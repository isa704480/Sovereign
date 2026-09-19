/**
 * Runs once per server instance. Guards secrets pasted in masked form (e.g.
 * "sk-proj-••••abcd" copied from a dashboard): such a value crashes every fetch
 * with "Cannot convert argument to a ByteString" because HTTP headers are
 * Latin-1 only. A broken key is removed — so routing falls back to another
 * provider — and the variable is named in the logs so it can be re-entered.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const SECRET = /(_KEY|_SECRET|_TOKEN)$/;
  for (const [name, value] of Object.entries(process.env)) {
    if (!SECRET.test(name) || name.startsWith("NEXT_PUBLIC_") || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (/[^\x21-\x7e]/.test(trimmed)) {
      delete process.env[name];
      console.error(
        `[sovereign] ${name} noto'g'ri: ichida yashirin/ASCII bo'lmagan belgi bor (masalan •). ` +
          "Kalitni provayder saytidan to'liq nusxalab, Vercel env'ga qayta kiriting.",
      );
    } else if (trimmed !== value) {
      process.env[name] = trimmed;
    }
  }
}
