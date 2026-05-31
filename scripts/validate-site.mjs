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

const assetMatches = [...index.matchAll(/src="assets\/([^"]+\.png)"/g)].map((match) => match[1]);
const uniqueAssets = new Set(assetMatches);

if (assetMatches.length !== 10 || uniqueAssets.size !== 10) {
  fail(`Expected 10 unique section images, found ${assetMatches.length} references and ${uniqueAssets.size} unique assets.`);
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
  "Anne Lopes Advocacia",
  "OAB/SP 414.702",
  "5511974138009",
  "LegalService",
  "prefers-reduced-motion",
  "overflow-x: hidden",
  "faq-hotspot",
  "whatsapp-link"
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
