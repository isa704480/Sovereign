import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { MAX_PROMPT_CHARS, parseInbound } from "../src/core/protocol";

describe("parseInbound — oddiy xabarlar", () => {
  it("parametrsiz turlar o'tadi", () => {
    for (const type of ["ready", "stop", "newChat", "signIn", "useCliLogin", "openSettings"]) {
      assert.deepEqual(parseInbound({ type }), { type });
    }
  });

  it("noma'lum tur rad etiladi", () => {
    assert.equal(parseInbound({ type: "evalCode", code: "1" }), null);
    assert.equal(parseInbound({ type: "__proto__" }), null);
  });

  it("obyekt bo'lmagan kirish rad etiladi", () => {
    for (const bad of [null, undefined, 1, "ready", [], true]) {
      assert.equal(parseInbound(bad), null);
    }
  });
});

describe("parseInbound — ask", () => {
  it("matn va bayroqni oladi", () => {
    assert.deepEqual(parseInbound({ type: "ask", text: "salom", useContext: true }), {
      type: "ask",
      text: "salom",
      useContext: true,
    });
  });

  it("useContext berilmasa true", () => {
    assert.deepEqual(parseInbound({ type: "ask", text: "x" }), { type: "ask", text: "x", useContext: true });
  });

  it("useContext: false hurmat qilinadi", () => {
    const msg = parseInbound({ type: "ask", text: "x", useContext: false });
    assert.equal(msg && msg.type === "ask" && msg.useContext, false);
  });

  it("bo'sh, matn bo'lmagan va juda uzun so'rov rad etiladi", () => {
    assert.equal(parseInbound({ type: "ask", text: "" }), null);
    assert.equal(parseInbound({ type: "ask", text: 42 }), null);
    assert.equal(parseInbound({ type: "ask", text: "a".repeat(MAX_PROMPT_CHARS + 1) }), null);
  });

  it("boshqaruv belgilari tozalanadi", () => {
    const msg = parseInbound({ type: "ask", text: "a\u0000b\u001bc" });
    assert.equal(msg && msg.type === "ask" && msg.text, "abc");
  });

  it("faqat boshqaruv belgilaridan iborat so'rov rad etiladi", () => {
    assert.equal(parseInbound({ type: "ask", text: "\u0000\u0001" }), null);
  });
});

describe("parseInbound — copy/apply", () => {
  it("butun, manfiy bo'lmagan indeks", () => {
    assert.deepEqual(parseInbound({ type: "apply", index: 0 }), { type: "apply", index: 0 });
    assert.deepEqual(parseInbound({ type: "copy", index: 5 }), { type: "copy", index: 5 });
  });

  it("noto'g'ri indeks rad etiladi", () => {
    for (const index of [-1, 1.5, NaN, Infinity, 1000, "1", null, undefined]) {
      assert.equal(parseInbound({ type: "apply", index }), null, `index=${String(index)}`);
    }
  });

  it("xom kod webview'dan qabul qilinmaydi (faqat indeks)", () => {
    const msg = parseInbound({ type: "apply", index: 1, code: "rm -rf /" });
    assert.deepEqual(msg, { type: "apply", index: 1 });
  });
});

describe("parseInbound — openLink", () => {
  it("https o'tadi", () => {
    assert.deepEqual(parseInbound({ type: "openLink", url: "https://soveregn.xyz/docs" }), {
      type: "openLink",
      url: "https://soveregn.xyz/docs",
    });
  });

  it("boshqa sxemalar rad etiladi", () => {
    for (const url of [
      "http://x.example",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "vscode://settings",
      "file:///etc/passwd",
      "//evil.example",
      "https://a b",
      "",
    ]) {
      assert.equal(parseInbound({ type: "openLink", url }), null, url);
    }
  });

  it("juda uzun URL rad etiladi", () => {
    assert.equal(parseInbound({ type: "openLink", url: `https://a.example/${"x".repeat(2100)}` }), null);
  });
});
