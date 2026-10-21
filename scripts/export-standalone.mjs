import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
const root = resolve("dist"),
  target = resolve(process.argv[2] || "dist/FORM.html");
let html = await readFile(resolve(root, "index.html"), "utf8");
const files = new Map();
for (const match of html.matchAll(
  /<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.(?:js|css))"[^>]*>/g,
)) {
  files.set(
    match[1],
    await readFile(resolve(root, "assets", basename(match[1])), "utf8"),
  );
}
html = html.replace(
  /<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g,
  (_, url) =>
    `<script type="module">${files.get(url).replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(
  /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_, url) => `<style>${files.get(url)}</style>`,
);
if (/<script\b[^>]*src=|<link\b[^>]*rel="stylesheet"/.test(html))
  throw Error("External application asset remains");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, html);
console.log(`Standalone artwork: ${target} (${Buffer.byteLength(html)} bytes)`);
