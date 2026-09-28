// Prints the online statement page to PDF with headless Chrome, so the PDF
// attached to client mail is identical to the page the client can open - the
// same result as its "Download as PDF" button. The page's own print styles
// (A4, border, repeating letterhead and footer) do the layout.
//
// One browser is started on first use and kept for later mails. If Chrome
// cannot start (missing on the host, or missing system libraries), callers
// fall back to the simpler pdfkit statement, so mail never breaks over it.
//
// Which Chrome: PUPPETEER_EXECUTABLE_PATH if set, else the one puppeteer
// downloaded, else a Chrome/Chromium already installed on the machine.

const fs = require('fs');

const SYSTEM_BROWSERS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

let browserPromise = null;

async function launch() {
  const puppeteer = require('puppeteer');
  // --no-sandbox: servers often run as root, where Chrome's sandbox refuses to start.
  const open = (executablePath) => puppeteer.launch({ headless: true, executablePath, args: LAUNCH_ARGS });

  if (process.env.PUPPETEER_EXECUTABLE_PATH) return open(process.env.PUPPETEER_EXECUTABLE_PATH);

  try {
    return await open(undefined);
  } catch (err) {
    const installed = SYSTEM_BROWSERS.find((p) => fs.existsSync(p));
    if (!installed) throw err;
    return open(installed);
  }
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = launch().then((browser) => {
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
