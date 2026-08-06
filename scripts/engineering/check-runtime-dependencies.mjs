import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const webRequire = createRequire(pathToFileURL(resolve("apps/web/package.json")));
const nextPackagePath = webRequire.resolve("next/package.json");
const nextRequire = createRequire(nextPackagePath);

const postcss = nextRequire("postcss");
const postcssVersion = postcss().version;
if (postcssVersion !== "8.5.23") {
  throw new Error(`Expected Next.js to resolve postcss 8.5.23, received ${postcssVersion}.`);
}

const sharp = nextRequire("sharp");
const sharpVersion = sharp.versions?.sharp;
if (sharpVersion !== "0.35.0") {
  throw new Error(`Expected Next.js to resolve sharp 0.35.0, received ${sharpVersion ?? "unknown"}.`);
}

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="black"/></svg>');
const png = await sharp(svg).png().toBuffer();
const pngSignature = "89504e470d0a1a0a";
if (png.subarray(0, 8).toString("hex") !== pngSignature) {
  throw new Error("Sharp runtime did not produce a valid PNG signature.");
}

console.log(`Runtime dependency compatibility passed (postcss ${postcssVersion}, sharp ${sharpVersion}).`);
