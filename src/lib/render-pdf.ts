import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/**
 * Render an HTML string to a PDF buffer using headless Chromium.
 *
 * Works on:
 * - Vercel serverless functions (uses @sparticuz/chromium binary)
 * - Local dev (set PUPPETEER_EXECUTABLE_PATH env var to your local Chrome
 *   if you want to test PDF rendering locally; otherwise it tries to use
 *   the chromium binary that ships with the package)
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const isLocal = process.env.NODE_ENV === "development";

  // Wrap the body fragment in a full HTML document if needed
  const fullHtml = html.trim().toLowerCase().startsWith("<!doctype")
    ? html
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
        @page { margin: 0.5in; }
      </style></head><body>${html}</body></html>`;

  const executablePath = isLocal && process.env.PUPPETEER_EXECUTABLE_PATH
    ? process.env.PUPPETEER_EXECUTABLE_PATH
    : await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    // `networkidle0` waits for every image/font to finish. A single
    // slow external image (e.g. an inspiration photo hosted somewhere
    // sluggish) hangs the render until the timeout fires and we end up
    // sending the proposal email without an attachment. `load` fires
    // as soon as the document + linked resources are at the load event
    // (best-effort) — then we give images a short grace period before
    // printing. This handles the realistic case where most images
    // arrive quickly but one straggler shouldn't kill the whole PDF.
    await page.setContent(fullHtml, { waitUntil: "load", timeout: 20000 });
    // Give in-flight images another beat to settle, capped so a totally
    // dead image URL can't take us past 25s total.
    await page.evaluate(() => new Promise<void>((resolve) => {
      const imgs = Array.from(document.images);
      if (imgs.length === 0) return resolve();
      let pending = imgs.filter((img) => !img.complete).length;
      if (pending === 0) return resolve();
      const done = () => { if (--pending <= 0) resolve(); };
      imgs.forEach((img) => {
        if (img.complete) return;
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
      // Hard cap so a stuck image can't deadlock us.
      setTimeout(() => resolve(), 4000);
    }));
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
