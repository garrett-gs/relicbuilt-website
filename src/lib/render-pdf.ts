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
    await page.setContent(fullHtml, { waitUntil: "networkidle0", timeout: 30000 });
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
