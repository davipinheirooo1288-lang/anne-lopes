import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = join(root, "reports", "browser");
const targetUrl = process.env.TARGET_URL || "http://localhost:4174/";
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9223);
const expectedTitle = "Anne Lopes Advocacia | Direito Imobiliário em Osasco/SP";
const expectedWhatsAppUrl = "https://wa.me/5511974138009?text=Ol%C3%A1,%20Dra.%20Anne.%20Vi%20seu%20site%20e%20gostaria%20de%20falar%20com%20a%20advogada.";

const chromeCandidates = [
  process.env.CHROME_PATH,
  join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe")
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!chromePath) {
  console.error("Chrome or Edge was not found. Set CHROME_PATH to run browser validation.");
  process.exit(1);
}

mkdirSync(reportDir, { recursive: true });

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

const waitForJson = async (url, attempts = 80) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
};

class CdpPage {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.exceptions = [];
    this.logs = [];

    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.addEventListener("open", resolveReady, { once: true });
      this.ws.addEventListener("error", rejectReady, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolveCommand, rejectCommand } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) rejectCommand(new Error(data.error.message));
        else resolveCommand(data.result || {});
        return;
      }

      this.events.push(data);
      if (data.method === "Runtime.exceptionThrown") {
        this.exceptions.push(data.params?.exceptionDetails?.text || "Runtime exception");
      }
      if (data.method === "Log.entryAdded") {
        const entry = data.params?.entry;
        if (entry && ["error", "warning"].includes(entry.level)) {
          this.logs.push(`${entry.level}: ${entry.text}`);
        }
      }
    });
  }

  async command(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const promise = new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolveCommand, rejectCommand });
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  async waitForEvent(method, timeout = 10000) {
    const existing = this.events.find((event) => event.method === method);
    if (existing) return existing;

    return new Promise((resolveEvent, rejectEvent) => {
      const timer = setTimeout(() => {
        cleanup();
        rejectEvent(new Error(`Timed out waiting for ${method}`));
      }, timeout);

      const onMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.method === method) {
          cleanup();
          resolveEvent(data);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.ws.removeEventListener("message", onMessage);
      };

      this.ws.addEventListener("message", onMessage);
    });
  }

  async close() {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

const openPage = async (url) => {
  const endpoint = `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Could not create Chrome target: HTTP ${response.status}`);
  }
  const pageInfo = await response.json();
  return new CdpPage(pageInfo.webSocketDebuggerUrl);
};

const runViewportCheck = async ({ name, width, height, mobile = false }) => {
  const page = await openPage("about:blank");
  const errors = [];

  await page.command("Runtime.enable");
  await page.command("Log.enable");
  await page.command("Page.enable");
  await page.command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile
  });
  await page.command("Page.navigate", { url: targetUrl });
  await page.waitForEvent("Page.loadEventFired", 15000);
  await wait(600);

  const metrics = await page.command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const doc = document.documentElement;
      const imgs = [...document.images];
      const allLinks = [...document.querySelectorAll('a[href]')];
      const badLinks = allLinks.filter((link) => !link.href || link.href.endsWith('#')).map((link) => link.outerHTML);
      document.querySelector('.faq-hotspot')?.click();
      const faqVisible = !document.querySelector('.faq-popover')?.hidden;
      document.querySelector('.faq-popover__close')?.click();
      return {
        title: document.title,
        sections: document.querySelectorAll('.template-section').length,
        images: imgs.length,
        loadedImages: imgs.filter((img) => img.complete && img.naturalWidth > 0).length,
        hotspots: document.querySelectorAll('.hotspot').length,
        whatsappLinks: document.querySelectorAll('a.whatsapp-link').length,
        badWhatsappLinks: [...document.querySelectorAll('a.whatsapp-link')].filter((link) => link.href !== '${expectedWhatsAppUrl}').length,
        faqButtons: document.querySelectorAll('.faq-hotspot').length,
        faqVisible,
        schema: [...document.querySelectorAll('script[type="application/ld+json"]')].length,
        faqSchema: [...document.querySelectorAll('script[type="application/ld+json"]')].some((script) => script.textContent.includes('FAQPage')),
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        twitterCard: document.querySelector('meta[name="twitter:card"]')?.content,
        pictures: document.querySelectorAll('picture').length,
        webpSources: [...document.querySelectorAll('source[type="image/webp"]')].length,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        overflowX: doc.scrollWidth > doc.clientWidth + 1,
        badLinks
      };
    })()`
  });

  const result = metrics.result.value;

  if (result.title !== expectedTitle) {
    errors.push(`Unexpected title: ${result.title}`);
  }
  if (result.sections !== 10) errors.push(`Expected 10 sections, found ${result.sections}.`);
  if (result.images !== 10) errors.push(`Expected 10 image elements, found ${result.images}.`);
  if (result.pictures !== 10 || result.webpSources !== 10) {
    errors.push(`Expected 10 picture/WebP sources, found ${result.pictures}/${result.webpSources}.`);
  }
  if (result.loadedImages < 1) errors.push("No above-the-fold images loaded in the browser.");
  if (result.hotspots < 35) errors.push(`Expected at least 35 hotspots, found ${result.hotspots}.`);
  if (result.whatsappLinks < 18 || result.badWhatsappLinks > 0) {
    errors.push(`WhatsApp links invalid: ${result.whatsappLinks} total, ${result.badWhatsappLinks} bad.`);
  }
  if (result.faqButtons !== 6 || !result.faqVisible) {
    errors.push(`FAQ interaction failed: ${result.faqButtons} buttons, visible=${result.faqVisible}.`);
  }
  if (result.schema < 2 || !result.faqSchema) errors.push("LegalService/FAQ JSON-LD schema not found.");
  if (result.canonical !== "https://anne-lopes.vercel.app/") {
    errors.push(`Unexpected canonical URL: ${result.canonical}`);
  }
  if (result.twitterCard !== "summary_large_image") {
    errors.push(`Unexpected Twitter Card: ${result.twitterCard}`);
  }
  if (result.overflowX) {
    errors.push(`Horizontal overflow detected: scrollWidth=${result.scrollWidth}, clientWidth=${result.clientWidth}.`);
  }
  if (result.badLinks.length) {
    errors.push(`Found empty/decorative links: ${result.badLinks.length}.`);
  }

  const screenshot = await page.command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true
  });
  const screenshotPath = join(reportDir, `${name}.png`);
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  errors.push(...page.exceptions);
  errors.push(...page.logs.filter((entry) => !entry.includes("favicon")));

  await page.close();

  return {
    name,
    width,
    height,
    screenshot: screenshotPath,
    metrics: result,
    errors
  };
};

const userDataDir = join(tmpdir(), `anne-lopes-chrome-${Date.now()}`);
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank"
], {
  stdio: "ignore",
  windowsHide: true
});

let exitCode = 0;

try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const checks = [
    await runViewportCheck({ name: "mobile-360", width: 360, height: 800, mobile: true }),
    await runViewportCheck({ name: "desktop-1440", width: 1440, height: 900 }),
    await runViewportCheck({ name: "mobile-390", width: 390, height: 844, mobile: true }),
    await runViewportCheck({ name: "mobile-430", width: 430, height: 932, mobile: true }),
    await runViewportCheck({ name: "tablet-768", width: 768, height: 1024, mobile: true })
  ];

  const failures = checks.flatMap((check) => check.errors.map((error) => `${check.name}: ${error}`));
  console.log(JSON.stringify(checks, null, 2));

  if (failures.length) {
    console.error("Browser validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    exitCode = 1;
  } else {
    console.log("Browser validation passed: desktop and mobile loaded with no overflow, broken images, console errors or inactive primary interactions.");
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  chrome.kill();
}

process.exit(exitCode);
