import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Renderer (React) — file:// ostida ishlashi uchun nisbiy yo'llar (base "./").
export default defineConfig({
  root: "ui",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../ui-dist",
    emptyOutDir: true,
  },
  server: { port: 5173, strictPort: true },
});
