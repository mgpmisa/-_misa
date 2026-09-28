// ゲーム本体をリポジトリの根から app/ に写す（Electron に詰めるため）
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..');
const DST = path.join(__dirname, 'app');
fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
for (const item of ['index.html', 'css', 'js', 'vendor']) {
  fs.cpSync(path.join(SRC, item), path.join(DST, item), { recursive: true });
}
// 字体（DotGothic16）を同梱していれば、ネットの字体の代わりに使う（オフラインでも同じ見た目）
const font = path.join(__dirname, 'fonts');
if (fs.existsSync(font)) {
  fs.cpSync(font, path.join(DST, 'fonts'), { recursive: true });
  const idx = path.join(DST, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/, '')
             .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/, '<link rel="stylesheet" href="fonts/dotgothic16.css">');
  fs.writeFileSync(idx, html);
}
console.log('app/ に写しました');
