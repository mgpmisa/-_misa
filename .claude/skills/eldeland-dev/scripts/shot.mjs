import { chromium } from 'playwright';
import fs from 'fs';
const [,, modPath, outPath, fn = 'run', arg = '4'] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
page.on('console', (m) => console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:8124/README.md');
const code = fs.readFileSync(modPath, 'utf8');
const url = await page.evaluate(async ({ code, fn, arg }) => {
  const blob = new Blob([code], { type: 'text/javascript' });
  const m = await import(URL.createObjectURL(blob));
  return await m[fn](...String(arg).split(",").map(Number));
}, { code, fn, arg });
fs.writeFileSync(outPath, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
console.log('saved', outPath);
