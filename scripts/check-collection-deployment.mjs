import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { chromium, expect } from "@playwright/test";

const root = resolve("dist");
const portable = resolve(process.argv[2] || "/tmp/FORM-collection.html");
const prefix = "/revision/preview/";
const screenshot = process.argv[3] || "docs/previews/capture-desktop.png";
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
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file =
      pathname === "/portable.html"
        ? portable
        : pathname.startsWith(prefix)
          ? resolve(root, pathname.slice(prefix.length) || "index.html")
          : "";
    if (!file || (file !== portable && !file.startsWith(root + "/"))) {
      response.writeHead(404).end();
      return;
    }
    const data = await readFile(file);
    response.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    response.end(data);
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
const errors = [],
  external = [],
  requests = [];
function watch(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) {
      requests.push(r.url());
      if (!r.url().startsWith(base + "/")) external.push(r.url());
    }
  });
}
async function scene(page, id) {
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-id",
    id,
    { timeout: 90000 },
  );
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-status",
    "ready",
    { timeout: 90000 },
  );
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-switching",
    "false",
    { timeout: 45000 },
  );
  await expect(page.locator("#capture-note")).toBeVisible();
}
try {
  const page = await browser.newPage({
    viewport: { width: 800, height: 640 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(90000);
  watch(page);
  await page.goto(`${base}${prefix}?room=1&space=apartment&renderer=webgl`);
  await scene(page, "apartment");
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-immersion",
    "1",
    { timeout: 45000 },
  );
  for (const id of ["apartment", "small-garden", "la-night"]) {
    if (id !== "apartment")
      await page
        .getByRole("button", { name: "Next room", exact: true })
        .click();
    await scene(page, id);
    await page.screenshot({
      path: `/tmp/FORM-collection-${id}-production.png`,
    });
  }
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await expect(page.locator(".workspace-content")).toHaveClass(/revealed/, {
    timeout: 45000,
  });
  await expect(page.locator("[data-room]")).toHaveCount(4);
  await page.screenshot({
    path: "/tmp/FORM-collection-gallery-production.png",
  });
  await page.close();
  console.log(
    "Nested production collection: all three new scenes, credit, entry and gallery passed.",
  );
  const start = requests.length;
  const single = await browser.newPage({
    viewport: { width: 700, height: 600 },
    reducedMotion: "reduce",
  });
  single.setDefaultTimeout(90000);
  watch(single);
  await single.goto(
    `${base}/portable.html?room=1&space=apartment&renderer=webgl`,
  );
  await scene(single, "apartment");
  await single.getByRole("button", { name: "Media", exact: true }).click();
  await expect(single.locator(".workspace-content")).toHaveClass(/revealed/, {
    timeout: 45000,
  });
  const thumbnails = await single
    .locator(".room-mini")
    .evaluateAll((nodes) =>
      nodes.map((n) => getComputedStyle(n).backgroundImage),
    );
  if (
    thumbnails.length !== 4 ||
    thumbnails.some((url) => !url.includes("data:image/webp;base64,"))
  )
    throw Error("Portable thumbnails are not embedded");
  await single.locator('[data-room="small-garden"]').click();
  await scene(single, "small-garden");
  const portableRequests = requests.slice(start);
  if (
    portableRequests.length !== 1 ||
    !portableRequests[0].includes("/portable.html?")
  )
    throw Error(JSON.stringify({ portableRequests }));
  if (errors.length || external.length)
    throw Error(JSON.stringify({ errors, external }));
  console.log(
    JSON.stringify({
      portableBytes: (await readFile(portable)).length,
      portableAssetRequests: 0,
      embeddedThumbnails: 4,
      errors,
      external,
    }),
  );
} finally {
  await browser.close();
  server.close();
}
