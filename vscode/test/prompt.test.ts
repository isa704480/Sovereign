import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildContext } from "../src/core/context";
import { buildMessages, buildTurn, MAX_HISTORY_MESSAGES, systemPrompt } from "../src/core/prompt";
import { chunkText, sameOrigin } from "../src/core/api";

const ctx = buildContext(
  {
    filePath: "src/a.ts",
    languageId: "typescript",
    lines: ["const a = 1;", "const b = 2;"],
    selectionStartLine: 0,
    selectionEndLine: 1,
    hasSelection: true,
  },
  120,
);

describe("systemPrompt", () => {
  it("tilni aytadi va cheklovlarni bildiradi", () => {
    assert.match(systemPrompt("ru"), /Russian/);
    assert.match(systemPrompt("uz-cyrl"), /Cyrillic/);
    assert.match(systemPrompt("en"), /cannot edit files/);
  });
});

describe("buildTurn", () => {
  it("ko'rsatma + kontekst", () => {
    const turn = buildTurn({ instruction: "Tushuntiring", context: ctx });
    assert.ok(turn.startsWith("Tushuntiring"));
    assert.match(turn, /File: src\/a\.ts/);
    assert.match(turn, /const a = 1;/);
  });

  it("kontekstsiz ham ishlaydi", () => {
    assert.equal(buildTurn({ instruction: "Salom" }), "Salom");
  });

  it("bir xil matn ikki marta qo'shilmaydi", () => {
    const turn = buildTurn({ instruction: "Salom", userText: "Salom" });
    assert.equal(turn, "Salom");
  });

  it("diagnostika kontekstga tushadi", () => {
    const turn = buildTurn({
      instruction: "Tuzating",
      context: ctx,
      diagnostic: { message: "Type error", severity: "error", line: 2 },
    });
    assert.match(turn, /Problem at line 2: \[error\] Type error/);
  });
});

describe("buildMessages", () => {
  it("system birinchi, foydalanuvchi oxirgi", () => {
    const msgs = buildMessages("en", [], "savol");
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, "system");
    assert.equal(msgs[1].content, "savol");
  });

  it("tarix chegaralanadi (server 60 xabar qabul qiladi)", () => {
    const history = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `m${i}` }));
    const msgs = buildMessages("en", history, "oxirgi");
    assert.equal(msgs.length, MAX_HISTORY_MESSAGES + 2);
    assert.equal(msgs[1].content, "m40");
  });
});

describe("api yordamchilari", () => {
  it("chunkText matnni to'liq bo'laklarga bo'ladi", () => {
    const text = "x".repeat(500);
    const chunks = chunkText(text, 180);
    assert.equal(chunks.length, 3);
    assert.equal(chunks.join(""), text);
    assert.deepEqual(chunkText("", 10), []);
  });

  it("sameOrigin — server bergan sahifa faqat o'sha domenda bo'lishi kerak", () => {
    assert.equal(sameOrigin("https://soveregn.xyz/cli/connect?code=a", "https://soveregn.xyz"), true);
    assert.equal(sameOrigin("https://soveregn.xyz/cli/connect", "https://api.soveregn.xyz"), true);
    assert.equal(sameOrigin("https://api.soveregn.xyz/cli/connect", "https://soveregn.xyz"), true);
    assert.equal(sameOrigin("https://evil.example/cli/connect", "https://soveregn.xyz"), false);
    assert.equal(sameOrigin("http://soveregn.xyz/cli/connect", "https://soveregn.xyz"), false);
    assert.equal(sameOrigin("javascript:alert(1)", "https://soveregn.xyz"), false);
    assert.equal(sameOrigin("http://localhost:3000/cli/connect", "http://localhost:3000"), true);
  });
});
