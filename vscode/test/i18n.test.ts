import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bundleFor, DEFAULT_LANG, dictEntry, dictKeys, fmt, isLang, LANGS, resolveLang, translate } from "../src/core/i18n";

describe("i18n — loyiha qoidasi (4 til)", () => {
  it("har kalitda 4 til bor va hech biri bo'sh emas", () => {
    for (const key of dictKeys()) {
      const entry = dictEntry(key);
      for (const lang of LANGS) {
        assert.equal(typeof entry[lang], "string", `${key}.${lang} — matn emas`);
        assert.ok(entry[lang].trim().length > 0, `${key}.${lang} — bo'sh`);
      }
    }
  });

  it("o'rin egalari (placeholder) tillar orasida bir xil", () => {
    const holders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const key of dictKeys()) {
      const entry = dictEntry(key);
      const want = holders(entry.en);
      for (const lang of LANGS) {
        assert.equal(holders(entry[lang]), want, `${key}: ${lang} o'rin egalari mos emas`);
      }
    }
  });

  it("uz-cyrl qiymatlarida kichik lotin so'z yo'q, uz qiymatlarida kirill yo'q", () => {
    // Ruxsat etilgan lotin bo'laklari: brend nomlari, tugma birikmalari, texnik atamalar.
    const allowed = new Set(["sovereign", "ctrl", "sov", "cli", "login", "vs", "code", "id", "http", "https", "localhost", "json", "auto"]);
    for (const key of dictKeys()) {
      const entry = dictEntry(key);
      // Kod (`...`) va o'rin egalari tekshirilmaydi — ular ataylab lotin.
      const cyrl = entry["uz-cyrl"].replace(/`[^`]*`/g, "").replace(/\{[^}]*\}/g, "");
      for (const word of cyrl.match(/[A-Za-z]{2,}/g) ?? []) {
        assert.ok(allowed.has(word.toLowerCase()), `${key} (uz-cyrl): lotin so'z "${word}"`);
      }
      assert.ok(!/[Ѐ-ӿ]/.test(entry.uz), `${key} (uz): kirill harfi bor`);
    }
  });
});

describe("resolveLang", () => {
  it("sozlama ustun", () => {
    assert.equal(resolveLang("uz-cyrl", "en-US"), "uz-cyrl");
    assert.equal(resolveLang("ru", "en"), "ru");
  });
  it("auto — muharrir tiliga ergashadi", () => {
    assert.equal(resolveLang("auto", "ru"), "ru");
    assert.equal(resolveLang("auto", "en-US"), "en");
    assert.equal(resolveLang("auto", "uz"), "uz");
    assert.equal(resolveLang("auto", "uz-Cyrl"), "uz-cyrl");
  });
  it("noma'lum til — standart (en)", () => {
    assert.equal(resolveLang("auto", "de"), DEFAULT_LANG);
    assert.equal(resolveLang(undefined, undefined), DEFAULT_LANG);
    assert.equal(resolveLang("klingon", "zh-cn"), DEFAULT_LANG);
  });
});

describe("fmt / translate", () => {
  it("o'rin egalarini almashtiradi", () => {
    assert.equal(fmt("a {x} b", { x: 1 }), "a 1 b");
    assert.equal(fmt("a {x} b", {}), "a {x} b");
    assert.equal(fmt("a {x} b"), "a {x} b");
  });
  it("tarjima va zaxira", () => {
    assert.equal(translate("ru", "panel.send"), "Отправить");
    assert.equal(translate("en", "panel.send"), "Send");
    assert.match(translate("uz", "err.server", { status: 502 }), /502/);
  });
});

describe("isLang / bundleFor", () => {
  it("isLang", () => {
    assert.equal(isLang("uz-cyrl"), true);
    assert.equal(isLang("tr"), false);
  });
  it("webview lug'ati panel va auth kalitlaridan iborat", () => {
    const bundle = bundleFor("uz");
    assert.ok(Object.keys(bundle).length > 10);
    assert.ok(Object.keys(bundle).every((k) => k.startsWith("panel.") || k.startsWith("auth.")));
    assert.equal(bundle["panel.send"], "Yuborish");
  });
});
