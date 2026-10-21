import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve("dist"),
  target = resolve(process.argv[2] || "dist/FORM.html");
let html = await readFile(resolve(root, "index.html"), "utf8");
const entry = html.match(/<script\b[^>]*src="([^"]+)"[^>]*>/)?.[1];
if (!entry) throw Error("Missing application entry");
// The web deployment keeps Spark lazy. The portable file intentionally bundles it.
const result = await build({
  entryPoints: [resolve(root, entry)],
  bundle: true,
  format: "esm",
  minify: true,
  write: false,
  target: "es2022",
});
html = html.replace(
  /<script\b[^>]*src="[^"]+"[^>]*>\s*<\/script>/g,
  () =>
    `<script type="module">${result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, "");
for (const match of [
  ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
]) {
  let css = await readFile(resolve(root, match[1]), "utf8");
  for (const image of [...css.matchAll(/url\(([^)]+\.webp)\)/g)]) {
    const path = image[1].replace(/^["']|["']$/g, "");
    const bytes = await readFile(resolve(root, "assets", basename(path)));
    css = css.replace(
      image[0],
      `url(data:image/webp;base64,${bytes.toString("base64")})`,
    );
  }
  html = html.replace(match[0], `<style>${css}</style>`);
}
const notices = await readFile(
  resolve(root, "THIRD-PARTY-LICENSES.txt"),
  "utf8",
);
html = html.replace(
  "</body>",
  `<script type="text/plain" id="form-licenses">${notices.replace(/<\/script/gi, "<\\/script")}</script></body>`,
);
const capture = await readFile(resolve(root, "captures/pantheon/pantheon.sog"));
html = html.replace(
  "</body>",
  `<script id="form-capture-data" type="application/octet-stream">${capture.toString("base64")}</script></body>`,
);
if (
  /<script\b[^>]*src=|<link\b[^>]*rel="(?:stylesheet|modulepreload)"/.test(html)
)
  throw Error("External application asset remains");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, html);
console.log(
  `Standalone artwork, including capture: ${target} (${Buffer.byteLength(html)} bytes)`,
);
