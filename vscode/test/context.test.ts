import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  buildContext,
  clampContextLines,
  contextLabel,
  DEFAULT_CONTEXT_LINES,
  MAX_SNIPPET_CHARS,
  pickFence,
  relativeFilePath,
  renderContextBlock,
  type EditorSnapshot,
} from "../src/core/context";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

function snap(over: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return {
    filePath: "src/app.ts",
    languageId: "typescript",
    lines: lines(500),
    selectionStartLine: 249,
    selectionEndLine: 249,
    hasSelection: false,
    ...over,
  };
}

describe("clampContextLines", () => {
  it("noto'g'ri qiymatda standartga qaytadi", () => {
    assert.equal(clampContextLines("abc"), DEFAULT_CONTEXT_LINES);
    assert.equal(clampContextLines(undefined), DEFAULT_CONTEXT_LINES);
    assert.equal(clampContextLines(NaN), DEFAULT_CONTEXT_LINES);
  });
  it("oraliqqa siqadi", () => {
    assert.equal(clampContextLines(-10), 0);
    assert.equal(clampContextLines(10_000), 600);
    assert.equal(clampContextLines(42), 42);
  });
});

describe("relativeFilePath", () => {
  it("ish papkasiga nisbatan qisqartiradi", () => {
    assert.equal(relativeFilePath("D:/proj/src/a.ts", "D:/proj"), "src/a.ts");
    assert.equal(relativeFilePath("D:\\proj\\src\\a.ts", "D:\\proj"), "src/a.ts");
  });
  it("papkadan tashqarida faqat fayl nomi qoladi (uy katalogi oshkor bo'lmaydi)", () => {
    assert.equal(relativeFilePath("C:/Users/hp/secret/notes.md", "D:/proj"), "notes.md");
    assert.equal(relativeFilePath("/home/islombek/.ssh/config", undefined), "config");
  });
});

describe("buildContext", () => {
  it("kursor atrofidan aynan maxLines qator oladi", () => {
    const ctx = buildContext(snap(), 20);
    assert.equal(ctx.endLine - ctx.startLine + 1, 20);
    assert.ok(ctx.startLine < 250 && ctx.endLine > 250);
    assert.equal(ctx.truncated, true);
  });

  it("fayl kichik bo'lsa hammasini oladi va kesilmagan deyiladi", () => {
    const ctx = buildContext(snap({ lines: lines(10), selectionStartLine: 3, selectionEndLine: 3 }), 120);
    assert.equal(ctx.startLine, 1);
    assert.equal(ctx.endLine, 10);
    assert.equal(ctx.truncated, false);
    assert.equal(ctx.snippet.split("\n").length, 10);
  });

  it("fayl boshida oyna chapga chiqib ketmaydi", () => {
    const ctx = buildContext(snap({ selectionStartLine: 0, selectionEndLine: 0 }), 20);
    assert.equal(ctx.startLine, 1);
    assert.equal(ctx.endLine, 20);
  });

  it("fayl oxirida oyna o'ngga chiqib ketmaydi", () => {
    const ctx = buildContext(snap({ lines: lines(30), selectionStartLine: 29, selectionEndLine: 29 }), 10);
    assert.equal(ctx.endLine, 30);
    assert.equal(ctx.startLine, 21);
  });

  it("uzun belgilangan joyning boshi va oxiri qoladi", () => {
    const ctx = buildContext(snap({ selectionStartLine: 0, selectionEndLine: 399, hasSelection: true }), 40);
    assert.equal(ctx.truncated, true);
    assert.match(ctx.snippet, /lines omitted/);
    assert.ok(ctx.snippet.startsWith("line 1\n"));
    assert.ok(ctx.snippet.trimEnd().endsWith("line 400"));
    assert.ok(ctx.snippet.split("\n").length < 45);
  });

  it("maxLines = 0 bo'lsa kod umuman yuborilmaydi", () => {
    const ctx = buildContext(snap(), 0);
    assert.equal(ctx.snippet, "");
  });

  it("belgi chegarasi ham qo'llanadi", () => {
    const huge = Array.from({ length: 50 }, () => "x".repeat(2_000));
    const ctx = buildContext(snap({ lines: huge, selectionStartLine: 0, selectionEndLine: 49 }), 50);
    assert.ok(ctx.snippet.length < MAX_SNIPPET_CHARS + 200, `uzunlik ${ctx.snippet.length}`);
    assert.equal(ctx.truncated, true);
  });

  it("bo'sh hujjatda ishlaydi", () => {
    const ctx = buildContext(snap({ lines: [], selectionStartLine: 0, selectionEndLine: 0 }), 30);
    assert.equal(ctx.snippet, "");
    assert.equal(ctx.totalLines, 0);
  });

  it("belgilanmagan bo'lsa selectionText bo'sh", () => {
    const ctx = buildContext(snap(), 20);
    assert.equal(ctx.selectionText, "");
  });
});

describe("renderContextBlock", () => {
  it("yo'l, til, qator oralig'i va to'siqni yozadi", () => {
    const ctx = buildContext(snap({ lines: lines(5), selectionStartLine: 1, selectionEndLine: 1 }), 120);
    const block = renderContextBlock(ctx);
    assert.match(block, /^File: src\/app\.ts$/m);
    assert.match(block, /^Language: typescript$/m);
    assert.match(block, /^Lines 1-5 of 5$/m);
    assert.match(block, /```typescript/);
  });

  it("diagnostika berilsa qo'shiladi", () => {
    const ctx = buildContext(snap({ lines: lines(5) }), 120);
    const block = renderContextBlock(ctx, { message: "Cannot find name 'foo'", severity: "error", source: "ts", code: "2304", line: 3 });
    assert.match(block, /Problem at line 3: \[error ts 2304\] Cannot find name 'foo'/);
  });

  it("kod ichida ``` bo'lsa tashqi to'siq uzunroq", () => {
    assert.equal(pickFence("no fence"), "```");
    assert.equal(pickFence("a\n```\nb"), "````");
    assert.equal(pickFence("a\n`````\nb"), "``````");
    const ctx = buildContext(snap({ lines: ["```js", "x", "```"], selectionStartLine: 0, selectionEndLine: 2 }), 120);
    const block = renderContextBlock(ctx);
    assert.ok(block.includes("````typescript"));
  });
});

describe("contextLabel", () => {
  it("fayl:boshlanish-tugash", () => {
    const ctx = buildContext(snap({ lines: lines(5), selectionStartLine: 0, selectionEndLine: 0 }), 120);
    assert.equal(contextLabel(ctx), "src/app.ts:1-5");
  });
});
