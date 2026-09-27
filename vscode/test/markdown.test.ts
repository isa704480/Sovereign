import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { escapeHtml, isSafeLink, renderInline, renderMarkdown, stripMarkdown } from "../src/core/markdown";

const labels = { copy: "Copy", apply: "Apply", applyHint: "Undo with Ctrl+Z" };

describe("escapeHtml", () => {
  it("barcha xavfli belgilarni ekranlaydi", () => {
    assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("renderInline — xom HTML o'tmaydi", () => {
  it("skript tegi matnga aylanadi", () => {
    const html = renderInline('<script>alert(1)</script>');
    assert.ok(!html.includes("<script"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("img onerror o'tmaydi", () => {
    const html = renderInline('<img src=x onerror="alert(1)">');
    assert.ok(!html.includes("<img"));
    assert.ok(!/onerror=/.test(html.replace(/&quot;/g, '"').replace(/&lt;|&gt;/g, "")) || !html.includes("<"));
  });

  it("javascript: havola havola bo'lmaydi", () => {
    const html = renderInline("[bos](javascript:alert(1))");
    assert.ok(!html.includes("<a "));
    assert.ok(!html.includes("javascript:alert(1)</a>"));
  });

  it("data: va vscode: havolalar ham rad etiladi", () => {
    assert.ok(!renderInline("[x](data:text/html;base64,PHNjcmlwdD4=)").includes("<a "));
    assert.ok(!renderInline("[x](vscode://settings)").includes("<a "));
    assert.ok(!renderInline("[x](file:///etc/passwd)").includes("<a "));
    assert.ok(!renderInline("[x](http://insecure.example)").includes("<a "));
  });

  it("https havola ochiladi va data-ext oladi", () => {
    const html = renderInline("[docs](https://soveregn.xyz/docs)");
    // title — hover'da haqiqiy manzil (yorliq undan farq qilishi mumkin).
    assert.equal(html, '<a href="https://soveregn.xyz/docs" title="https://soveregn.xyz/docs" data-ext="1">docs</a>');
  });

  it("yalang'och https havola aniqlanadi", () => {
    const html = renderInline("qarang https://soveregn.xyz/a?b=1&c=2 shu yerda");
    assert.ok(html.includes('<a href="https://soveregn.xyz/a?b=1&amp;c=2" data-ext="1">'));
  });

  it("havola matnidagi URL ikkinchi marta havola qilinmaydi", () => {
    const html = renderInline("[https://soveregn.xyz sahifasi](https://soveregn.xyz/docs)");
    assert.equal((html.match(/<a /g) ?? []).length, 1);
    assert.ok(html.startsWith('<a href="https://soveregn.xyz/docs"'));
  });

  it("havola matnidagi satr ichi kodi saqlanadi", () => {
    const html = renderInline("[`sov login`](https://soveregn.xyz/docs)");
    assert.equal(html, '<a href="https://soveregn.xyz/docs" title="https://soveregn.xyz/docs" data-ext="1"><code>sov login</code></a>');
  });

  it("qalin va kursiv", () => {
    assert.equal(renderInline("**bold** va *kursiv*"), "<strong>bold</strong> va <em>kursiv</em>");
  });

  it("satr ichidagi kod ichidagi belgilash ishlamaydi", () => {
    const html = renderInline("`**not bold** <b>`");
    assert.equal(html, "<code>**not bold** &lt;b&gt;</code>");
  });

  it("NUL va o'rin egasi belgilari tashlanadi", () => {
    assert.ok(!renderInline("a\u0000\u00011\u0001b").includes("\u0000"));
  });
});

describe("renderMarkdown — bloklar", () => {
  it("kod bloki alohida massivda qaytadi, HTML'da faqat indeks", () => {
    const md = "Salom\n\n```ts\nconst a = 1;\n```\n";
    const { html, codeBlocks } = renderMarkdown(md, labels);
    assert.equal(codeBlocks.length, 1);
    assert.equal(codeBlocks[0].code, "const a = 1;");
    assert.equal(codeBlocks[0].lang, "ts");
    assert.ok(html.includes('data-act="copy" data-index="0"'));
    assert.ok(html.includes('data-act="apply" data-index="0"'));
    assert.ok(html.includes("<code>const a = 1;</code>"));
  });

  it("kod bloki ichidagi HTML ekranlanadi", () => {
    const { html } = renderMarkdown("```html\n<script>alert(1)</script>\n```", labels);
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  });

  it("startIndex bilan raqamlash davom etadi", () => {
    const { html, codeBlocks } = renderMarkdown("```\na\n```\n\n```\nb\n```", labels, 7);
    assert.equal(codeBlocks.length, 2);
    assert.ok(html.includes('data-index="7"'));
    assert.ok(html.includes('data-index="8"'));
  });

  it("sarlavha, ro'yxat, iqtibos va ajratgich", () => {
    const { html } = renderMarkdown("# Sarlavha\n\n- bir\n- ikki\n\n1. a\n2. b\n\n> iqtibos\n\n---\n", labels);
    assert.ok(html.includes("<h1>Sarlavha</h1>"));
    assert.ok(html.includes("<ul><li>bir</li><li>ikki</li></ul>"));
    assert.ok(html.includes("<ol><li>a</li><li>b</li></ol>"));
    assert.ok(html.includes("<blockquote>iqtibos</blockquote>"));
    assert.ok(html.includes("<hr>"));
  });

  it("yopilmagan kod bloki matnni yutib yubormaydi", () => {
    const { html, codeBlocks } = renderMarkdown("```ts\nconst a = 1;", labels);
    assert.equal(codeBlocks.length, 1);
    assert.ok(html.includes("const a = 1;"));
  });

  it("xom HTML teg bo'lib emas, matn bo'lib chiqadi", () => {
    const { html } = renderMarkdown('<h1 onclick="x">hey</h1>', labels);
    // Atribut nomi matn sifatida qolishi mumkin, lekin teg ham, qo'shtirnoq ham ochilmaydi.
    assert.ok(!html.includes("<h1"));
    assert.ok(!html.includes('onclick="'));
    assert.ok(html.includes("&lt;h1"));
    assert.ok(html.includes("&quot;x&quot;"));
  });

  it("tilda faqat ruxsat etilgan belgilar qoladi", () => {
    const { html } = renderMarkdown('```ts"><img\nx\n```', labels);
    assert.ok(!html.includes("<img"));
  });

  it("bo'sh kirish bo'sh HTML beradi", () => {
    assert.equal(renderMarkdown("", labels).html, "");
  });
});

describe("isSafeLink", () => {
  it("faqat https", () => {
    assert.equal(isSafeLink("https://a.example/x"), true);
    assert.equal(isSafeLink("http://a.example"), false);
    assert.equal(isSafeLink("javascript:alert(1)"), false);
    assert.equal(isSafeLink("https://a.example/\u0000x"), false);
    assert.equal(isSafeLink("HTTPS://A.EXAMPLE"), true);
  });
});

describe("stripMarkdown", () => {
  it("bildirishnoma uchun sof matn", () => {
    assert.equal(stripMarkdown("**Hi** `code`\n\n```\nblock\n```"), "Hi code");
  });
});
