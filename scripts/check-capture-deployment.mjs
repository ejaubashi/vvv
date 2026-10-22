import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { chromium, expect } from "@playwright/test";

const root = resolve("dist");
const portable = resolve(process.argv[2] || "/tmp/FORM-capture.html");
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
  requests = [],
  external = [];
const watch = (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) {
      requests.push(request.url());
      if (!request.url().startsWith(base + "/")) external.push(request.url());
    }
  });
};
async function open(page, url) {
  await page.goto(url);
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-status",
    "ready",
    { timeout: 90000 },
  );
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-renderer",
    "Spark / Gaussian splats / WebGL 2",
  );
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-immersion",
    "1",
    { timeout: 45000 },
  );
  await expect(page.locator("#capture-note")).toBeVisible();
  await expect(page.locator("#unravel-toggle")).toBeVisible();
  await expect(page.locator("#unravel-toggle")).toBeDisabled();
  await expect(page.locator("#threshold-tools")).not.toBeVisible();
}
async function threshold(page, url, imagePath) {
  await page.goto(url);
  await page
    .getByRole("button", { name: "Enter the lens", exact: true })
    .click();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-threshold",
    "open",
    { timeout: 45000 },
  );
  if (imagePath) await page.screenshot({ path: imagePath });
  await page
    .getByRole("button", { name: "Step into Nocturne", exact: true })
    .click();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-room-id",
    "nocturne",
    { timeout: 45000 },
  );
  await expect(page.locator("#room-view")).toBeFocused();
  await expect(page).toHaveURL(/space=nocturne/);
  if (imagePath)
    await page.screenshot({ path: "/tmp/FORM-threshold-arrival.png" });
}
try {
  await mkdir(dirname(screenshot), { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 850 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(90000);
  watch(page);
  await open(page, `${base}${prefix}?room=1&space=pantheon&renderer=webgl`);
  await page.waitForTimeout(3700);
  await page.screenshot({ path: screenshot });
  await page
    .getByRole("button", { name: "Return to lens", exact: true })
    .click();
  await expect(page.locator("#scene canvas")).toHaveAttribute(
    "data-immersion",
    "0",
    { timeout: 30000 },
  );
  await page.close();
  console.log("Nested deployment: capture, entry and return passed.");

  const start = requests.length;
  const single = await browser.newPage({
    viewport: { width: 900, height: 700 },
    reducedMotion: "reduce",
  });
  single.setDefaultTimeout(90000);
  watch(single);
  await open(
    single,
    `${base}/portable.html?room=1&space=pantheon&renderer=webgl`,
  );
  await single.screenshot({ path: "/tmp/FORM-capture-portable.png" });
  const portableRequests = requests.slice(start);
  if (
    portableRequests.length !== 1 ||
    !portableRequests[0].includes("/portable.html?")
  )
    throw Error(
      `Portable file requested external assets: ${JSON.stringify(portableRequests)}`,
    );
  await single.close();
  const doorway = await browser.newPage({
    viewport: { width: 1000, height: 760 },
    reducedMotion: "reduce",
  });
  doorway.setDefaultTimeout(90000);
  watch(doorway);
  await threshold(
    doorway,
    `${base}${prefix}?room=1&threshold=1&renderer=webgl`,
    "/tmp/FORM-threshold-production.png",
  );
  await threshold(
    doorway,
    `${base}/portable.html?room=1&threshold=1&renderer=webgl`,
  );
  console.log(
    "Nested and portable threshold opening, crossing, URL and focus passed.",
  );
  if (errors.length || external.length)
    throw Error(JSON.stringify({ errors, external }));
  console.log(
    JSON.stringify(
      {
        portableBytes: (await readFile(portable)).length,
        portableAssetRequests: portableRequests.length - 1,
        errors,
        external,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  server.close();
}
