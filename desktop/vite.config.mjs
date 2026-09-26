import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEV = "localhost:5173";

/** SOVEREIGN_URL (agar berilgan bo'lsa) origin'i — faqat http(s). */
function configuredOrigin() {
  try {
    const u = new URL(process.env.SOVEREIGN_URL || "");
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

/**
 * index.html'dagi qat'iy CSP'ni moslaydi:
 *  - connect-src'ga sozlangan SOVEREIGN_URL qo'shiladi (build va dev);
 *  - faqat dev (vite serve) rejimida HMR uchun ws/http localhost:5173 va
 *    React Refresh preamble'i uchun inline skript ruxsat etiladi.
 */
function cspPlugin() {
  let isServe = false;
  return {
    name: "sovereign-csp",
    configResolved(cfg) {
      isServe = cfg.command === "serve";
    },
    transformIndexHtml(html) {
      return html.replace(/(http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/, (_m, a, policy, z) => {
        let p = policy;
        const extra = [configuredOrigin()].filter(Boolean);
        if (isServe) extra.push(`http://${DEV}`, `ws://${DEV}`);
        if (extra.length) p = p.replace(/connect-src ([^;]*)/, (_x, v) => `connect-src ${v} ${extra.join(" ")}`);
        if (isServe) p = p.replace(/script-src ([^;]*)/, (_x, v) => `script-src ${v} 'unsafe-inline'`);
        return a + p + z;
      });
    },
  };
}

// Renderer (React) — file:// ostida ishlashi uchun nisbiy yo'llar (base "./").
export default defineConfig({
  root: "ui",
  base: "./",
  plugins: [react(), cspPlugin()],
  // Desktop UI oddiy CSS — PostCSS kerak emas. Aks holda Vite yuqoriga qarab qidirib,
  // repo ildizidagi (Next.js) postcss.config.mjs'ni topadi va CI'da @tailwindcss/postcss
  // o'rnatilmagani uchun build yiqiladi.
  css: { postcss: { plugins: [] } },
  build: {
    outDir: "../ui-dist",
    emptyOutDir: true,
    // Electron 44 (Chromium 14x) — zamonaviy sintaksis transpilyatsiyasiz.
    target: "chrome120",
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, strictPort: true },
});
