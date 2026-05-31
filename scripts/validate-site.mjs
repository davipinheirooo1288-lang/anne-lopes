import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const indexPath = join(publicDir, "index.html");
const cssPath = join(publicDir, "styles.css");
const jsPath = join(publicDir, "script.js");

const failures = [];

const fail = (message) => failures.push(message);
const read = (path) => readFileSync(path, "utf8");

const readPngSize = (path) => {
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG file`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
};

const index = read(indexPath);
const css = read(cssPath);
const js = read(jsPath);
const expectedWhatsAppUrl = "https://wa.me/5511974138009?text=Olá,%20Dra.%20Anne.%20Vi%20seu%20site%20e%20gostaria%20de%20falar%20com%20a%20advogada.";

const assetMatches = [...index.matchAll(/src="assets\/([^"]+\.png)"/g)].map((match) => match[1]);
const uniqueAssets = new Set(assetMatches);
const webpMatches = [...index.matchAll(/assets\/([^"',\s]+\.webp)/g)].map((match) => match[1]);
const uniqueWebpAssets = new Set(webpMatches);
const pictureCount = (index.match(/<picture>/g) || []).length;

if (assetMatches.length !== 10 || uniqueAssets.size !== 10) {
  fail(`Expected 10 unique section images, found ${assetMatches.length} references and ${uniqueAssets.size} unique assets.`);
}

if (uniqueWebpAssets.size < 40 || pictureCount !== 10) {
  fail(`Expected responsive WebP sources inside 10 picture elements, found ${uniqueWebpAssets.size} unique WebP assets and ${pictureCount} picture elements.`);
}

for (const asset of uniqueAssets) {
  const assetPath = join(publicDir, "assets", asset);
  try {
    const stat = statSync(assetPath);
    const size = readPngSize(assetPath);
    if (size.width !== 1672 || size.height !== 941) {
      fail(`${asset} has unexpected dimensions ${size.width}x${size.height}.`);
    }
    if (stat.size < 100_000) {
      fail(`${asset} looks too small to be a valid final template asset.`);
    }
  } catch (error) {
    fail(`Could not validate ${asset}: ${error.message}`);
  }
}

for (const asset of uniqueWebpAssets) {
  const assetPath = join(publicDir, "assets", asset);
  try {
    const stat = statSync(assetPath);
    if (stat.size < 5_000) {
      fail(`${asset} looks too small to be a valid final WebP template asset.`);
    }
  } catch (error) {
    fail(`Could not validate ${asset}: ${error.message}`);
  }
}

const requiredIds = ["inicio", "areas", "imobiliario", "atendimento", "sobre", "faq", "contato"];
for (const id of requiredIds) {
  if (!index.includes(`id="${id}"`)) {
    fail(`Missing section id #${id}.`);
  }
}

const anchorTargets = [...index.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
for (const target of anchorTargets) {
  if (!index.includes(`id="${target}"`)) {
    fail(`Anchor target #${target} is referenced but not present.`);
  }
}

const requiredSnippets = [
  "<title>Anne Lopes Advocacia | Direito Imobiliário em Osasco/SP</title>",
  "Advogada em Osasco/SP com atuação em Direito Imobiliário",
  "OAB/SP 414.702",
  "5511974138009",
  "LegalService",
  "Attorney",
  "FAQPage",
  "rel=\"canonical\" href=\"https://anne-lopes.vercel.app/\"",
  "twitter:card",
  "prefers-reduced-motion",
  "overflow-x: hidden",
  "faq-hotspot",
  "whatsapp-link",
  expectedWhatsAppUrl
];

for (const snippet of requiredSnippets) {
  const haystack = snippet === "prefers-reduced-motion" || snippet === "overflow-x: hidden" ? css : `${index}\n${js}`;
  if (!haystack.includes(snippet)) {
    fail(`Missing required snippet: ${snippet}`);
  }
}

const whatsappLinks = (index.match(/whatsapp-link/g) || []).length;
if (whatsappLinks < 18) {
  fail(`Expected at least 18 WhatsApp-enabled hotspots, found ${whatsappLinks}.`);
}

if (/data-message=/.test(index)) {
  fail("WhatsApp links must use the canonical requested message instead of per-button data-message overrides.");
}

if (/C:\\|file:\/\//i.test(index + css + js)) {
  fail("Published files must not contain local Windows or file:// paths.");
}

if (failures.length) {
  console.error("Validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Validation passed: assets, anchors, SEO hooks, WhatsApp hotspots and responsive safeguards are in place.");
