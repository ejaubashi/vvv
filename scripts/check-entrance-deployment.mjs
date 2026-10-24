import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 90000 });

const root = resolve("dist"),
  prefix = "/revision/preview/";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webp": "image/webp",
  ".json": "application/json",
  ".txt": "text/plain",
};
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = path.startsWith(prefix)
      ? resolve(root, path.slice(prefix.length) || "index.html")
      : "";
    if (!file.startsWith(root + "/")) return void response.writeHead(404).end();
    const bytes = await readFile(file);
    response.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 640 } });
  page.setDefaultTimeout(90000);
  const errors = [],
    external = [],
    captures = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(base + "/")) external.push(url);
    if (url.endsWith(".sog")) captures.push(url);
  });
  await page.goto(`${base}${prefix}?room=1&space=apartment&renderer=webgl`);
  const canvas = page.locator("#scene canvas"),
    orb = page.locator("#entry-orb");
  await expect(canvas).toHaveAttribute("data-room-status", "ready");
  await expect(canvas).toHaveAttribute("data-room-id", "apartment");
  await expect(orb).toBeVisible();
  await page.waitForTimeout(3500);
  await mkdir("docs/previews", { recursive: true });
  await page.screenshot({ path: "docs/previews/entrance-object.png" });
  await orb.click();
  await expect(canvas).toHaveAttribute("data-entrance", "inside");
  await expect(canvas).toHaveAttribute("data-immersion", "1");
  await expect(page.locator("#unravel-tools")).toBeVisible();
  await page.screenshot({ path: "docs/previews/entrance-arrival.png" });
  await page.locator("#return-to-lens").click();
  await expect(canvas).toHaveAttribute("data-immersion", "0");
  await expect(orb).toBeFocused();
  expect(captures).toHaveLength(1);
  expect(captures[0]).toContain("/apartment/apartment.sog");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  const result = {
    productionPrefix: prefix,
    scene: "apartment",
    backend: "WebGL 2 / Spark",
    motion: "normal",
    capturedDownloads: captures.length,
    externalRequests: external.length,
    pageErrors: errors.length,
    entryAndReturn: "passed",
    screenshots: [
      "docs/previews/entrance-object.png",
      "docs/previews/entrance-arrival.png",
    ],
  };
  await writeFile(
    "/tmp/form-entrance-production-results.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.close();
}
