// Prints the online statement page to PDF with headless Chrome, so the PDF
// attached to client mail is identical to the page the client can open - the
// same result as its "Download as PDF" button. The page's own print styles
// (A4, border, repeating letterhead and footer) do the layout.
//
// One browser is started on first use and kept for later mails. If Chrome
// cannot start (missing on the host, or missing system libraries), callers
// fall back to the simpler pdfkit statement, so mail never breaks over it.
//
// PUPPETEER_EXECUTABLE_PATH points at a system Chrome/Chromium if the one
// puppeteer downloads cannot be used.

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    const puppeteer = require('puppeteer');
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      // --no-sandbox: servers often run as root, where Chrome's sandbox refuses to start.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }).then((browser) => {
      // A crashed browser is replaced on the next print rather than reused.
      browser.on('disconnected', () => { browserPromise = null; });
      return browser;
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

/** Print a full HTML document to an A4 PDF. Resolves to a Buffer. */
async function htmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 30000 });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { htmlToPdf };
