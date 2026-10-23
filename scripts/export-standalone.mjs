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
html = html.replace(
  /<link\b(?=[^>]*rel="preload")(?=[^>]*as="font")[^>]*>/g,
  "",
);
for (const match of [
  ...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g),
]) {
  let css = await readFile(resolve(root, match[1]), "utf8");
  for (const asset of [
    ...css.matchAll(/url\(\s*(["']?)([^"')]+\.(webp|woff2))\1\s*\)/g),
  ]) {
    const path = asset[2];
    const bytes = await readFile(resolve(root, "assets", basename(path)));
    const mime = asset[3] === "woff2" ? "font/woff2" : "image/webp";
    css = css.replace(
      asset[0],
      `url(data:${mime};base64,${bytes.toString("base64")})`,
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
for (const id of ["pantheon", "apartment", "small-garden", "la-night"]) {
  const capture = await readFile(resolve(root, `captures/${id}/${id}.sog`));
  const thumbnail = await readFile(resolve(root, `captures/${id}/thumb.webp`));
  // The normal gallery uses self-hosted thumbnails. Override its inline URLs
  // in the offline edition, before the gallery is created.
  html = html.replace(
    "</head>",
    `<style>.room-edition-${id} .room-mini{background-image:url(data:image/webp;base64,${thumbnail.toString("base64")})!important}</style></head>`,
  );
  html = html.replace(
    "</body>",
    `<script data-capture="${id}" type="application/octet-stream">${capture.toString("base64")}</script></body>`,
  );
}
if (
  /<script\b[^>]*src=|<link\b[^>]*rel="(?:stylesheet|modulepreload)"/.test(html)
)
  throw Error("External application asset remains");
if (/url\(["']?[^)]*\.woff2["']?\)|<link\b[^>]*as="font"/.test(html))
  throw Error("External font asset remains");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, html);
console.log(
  `Standalone artwork, including capture: ${target} (${Buffer.byteLength(html)} bytes)`,
);
