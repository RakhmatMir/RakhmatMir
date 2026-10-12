import puppeteer from "puppeteer-core";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "frames");
const fps = 24;
const durationMs = 20000;
const totalFrames = Math.floor((durationMs / 1000) * fps);
const htmlPath = path.join(__dirname, "brag.html");
const bragMp4 = path.join(__dirname, "..", "brag.mp4");

fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto("file://" + htmlPath, { waitUntil: "networkidle0", timeout: 60000 });
await page.evaluateHandle("document.fonts.ready");

for (let f = 0; f < totalFrames; f++) {
  const ms = Math.round((f / fps) * 1000);
  await page.evaluate((t) => window.seekTo(t), ms);
  const file = path.join(outDir, `frame_${String(f).padStart(5, "0")}.png`);
  await page.screenshot({ path: file, type: "png" });
  if (f % 48 === 0) console.log(`frame ${f}/${totalFrames}`);
}

await browser.close();

const ff = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(outDir, "frame_%05d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    bragMp4,
  ],
  { stdio: "inherit" }
);

if (ff.status !== 0) process.exit(ff.status || 1);

spawnSync(
  "ffmpeg",
  ["-y", "-i", bragMp4, "-vframes", "1", path.join(__dirname, "..", "brag.jpg")],
  { stdio: "inherit" }
);

console.log("Wrote", bragMp4);
