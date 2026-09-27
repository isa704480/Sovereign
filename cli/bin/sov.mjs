#!/usr/bin/env node
// `sov` kirish nuqtasi (package.json bin) — vibe rejim. Windows npm shim'i (sov.cmd)
// argv[1] sifatida shu faylni beradi, shuning uchun nom belgisi shu yerda qo'yiladi
// (src/invoked.mjs), keyin asosiy CLI yuklanadi.
import { INVOKED_AS_MARK } from "../src/invoked.mjs";

globalThis[INVOKED_AS_MARK] = "sov";
await import("./sovereign.mjs");
