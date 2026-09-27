import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { cliConfigPath, parseCliConfig } from "../src/core/cli-config";
import { apiUrl, DEFAULT_BASE_URL, isAcceptableBaseUrl, sanitizeBaseUrl } from "../src/core/url";

const TOKEN = "sov_" + "b".repeat(40);

describe("parseCliConfig", () => {
  it("to'g'ri konfiguratsiyadan tokenni oladi", () => {
    const raw = JSON.stringify({ baseUrl: "https://api.soveregn.xyz", token: TOKEN, email: "a@b.com", openrouterKey: "sk-xxx" });
    assert.deepEqual(parseCliConfig(raw), { baseUrl: "https://api.soveregn.xyz", token: TOKEN, email: "a@b.com" });
  });

  it("boshqa kalitlar (OpenRouter va h.k.) olinmaydi", () => {
    const parsed = parseCliConfig(JSON.stringify({ token: TOKEN, openrouterKey: "sk-secret" }));
    assert.ok(parsed);
    assert.deepEqual(Object.keys(parsed).sort(), ["baseUrl", "email", "token"]);
  });

  it("tokensiz / yaroqsiz tokenli fayl — null", () => {
    assert.equal(parseCliConfig(JSON.stringify({ token: "" })), null);
    assert.equal(parseCliConfig(JSON.stringify({ token: "short" })), null);
    assert.equal(parseCliConfig(JSON.stringify({ token: `${TOKEN}\r\nX: y` })), null);
    assert.equal(parseCliConfig(JSON.stringify({})), null);
  });

  it("buzilgan / g'alati kirish — null", () => {
    assert.equal(parseCliConfig("not json"), null);
    assert.equal(parseCliConfig("[]"), null);
    assert.equal(parseCliConfig("null"), null);
    assert.equal(parseCliConfig(null), null);
    assert.equal(parseCliConfig(undefined), null);
    assert.equal(parseCliConfig("x".repeat(1_000_001)), null);
  });

  it("xavfli baseUrl standartga tushadi", () => {
    const parsed = parseCliConfig(JSON.stringify({ token: TOKEN, baseUrl: "http://evil.example" }));
    assert.equal(parsed?.baseUrl, DEFAULT_BASE_URL);
  });
});

describe("cliConfigPath", () => {
  it("POSIX", () => {
    assert.equal(cliConfigPath("/home/islombek"), "/home/islombek/.sovereign/config.json");
  });
  it("Windows", () => {
    assert.equal(cliConfigPath("C:\\Users\\hp"), "C:\\Users\\hp\\.sovereign\\config.json");
  });
});

describe("sanitizeBaseUrl", () => {
  it("https o'tadi, oxiridagi / olib tashlanadi", () => {
    assert.equal(sanitizeBaseUrl("https://soveregn.xyz/"), "https://soveregn.xyz");
    assert.equal(sanitizeBaseUrl("https://api.soveregn.xyz"), "https://api.soveregn.xyz");
  });
  it("http faqat localhost uchun", () => {
    assert.equal(sanitizeBaseUrl("http://localhost:3000"), "http://localhost:3000");
    assert.equal(sanitizeBaseUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
    assert.equal(sanitizeBaseUrl("http://evil.example"), DEFAULT_BASE_URL);
  });
  it("boshqa sxemalar rad etiladi", () => {
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x", "", null, undefined, 42]) {
      assert.equal(sanitizeBaseUrl(bad), DEFAULT_BASE_URL, String(bad));
    }
  });
  it("isAcceptableBaseUrl", () => {
    assert.equal(isAcceptableBaseUrl("https://x.example"), true);
    assert.equal(isAcceptableBaseUrl("http://x.example"), false);
  });
  it("apiUrl har doim tozalangan manzilga qo'shadi", () => {
    assert.equal(apiUrl("https://x.example/", "/api/cli/me"), "https://x.example/api/cli/me");
    assert.equal(apiUrl("javascript:x", "/api/cli/me"), `${DEFAULT_BASE_URL}/api/cli/me`);
  });
});
