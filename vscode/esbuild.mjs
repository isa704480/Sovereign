/**
 * Kengaytma xosti (extension host) uchun bitta CommonJS bundle: dist/extension.js.
 * `vscode` moduli ish vaqtida muharrir tomonidan beriladi — tashqi (external) qoladi.
 *
 *   node esbuild.mjs            # bir marta (production)
 *   node esbuild.mjs --watch    # F5 / Extension Development Host uchun
 */
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["vscode"],
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[esbuild] watching…");
} else {
  await build(options);
}
