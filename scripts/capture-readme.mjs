/**
 * README の画像を撮り直す。実験ごとの GIF（docs/readme/NN-<id>.gif）と、入口のヒーロー画像（hero.png）。
 *
 *   PAGES_BASE_PATH=/armillary npm run build
 *   node scripts/serve-pages.mjs          # 別のターミナルで
 *   npm run readme:capture                # 全部撮る
 *   npm run readme:capture -- curtain,orrery   # 一部だけ撮り直す
 *
 * 既定では push 前のローカル（serve-pages.mjs）を撮る。公開中のサイトを撮るなら URL= で渡す。
 * SHEET=<path>.png を付けると、各 GIF の中盤のコマを並べた一覧画像も書き出す。
 * GIF は最初のコマしかプレビューされないことが多いので、仕上がりの確認にはこちらを見る。
 *
 * ブラウザはインストール済みの Chrome を使う（playwright-core はブラウザを同梱しない）。
 * Playwright の Chromium を別途落とさずに済むので、依存が軽い。
 */
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// gifenc は CommonJS なので名前付き import できない。
const { GIFEncoder, quantize, applyPalette } = gifenc;

const URL = process.env.URL ?? 'http://localhost:4000/armillary/';
const OUT = join(import.meta.dirname, '..', 'docs', 'readme');
const ONLY = process.argv[2]?.split(',');

// 1280x720 で撮って 1/2 に縮める。README の 2 列表示では 640 幅で足り、
// 等倍のままだと 1 本 2〜3MB になる。縮小は 2x2 の平均（箱フィルタ）で、細い罫線が消えにくい。
const W = 1280;
const H = 720;
const SCALE = 2;
const GW = W / SCALE;
const GH = H / SCALE;

/**
 * 撮り方。書いていない実験は 'scrub'（ピン区間をスクロールで送る）。
 * pin: false の実験はスクロールで進まないので、それぞれの動かし方を与える。
 *   select  — 自走させ、途中で天体を 1 つクリックする（Orrery）
 *   still   — 何もせず自走させる
 *   pointer — カーソルを 8 の字に動かす（カーソルに反応する実験）
 *   wiggle  — その場で上下にスクロールを揺らす（スクロール速度に反応する実験）
 */
const MODE = {
  orrery: 'select',
  'radial-burst': 'still',
  'paper-sphere': 'pointer',
  'off-axis-window': 'pointer',
  'velocity-parallax': 'wiggle',
};

// LabSection は区間の最初と最後の 10% でフェードする。そこを撮ると頭と尻が真っ黒になるので外す。
// fade: false の実験は終端の絵を見せたいので、最後まで撮る。
const NO_FADE = new Set(['rangefinder']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'networkidle' });
// フォントが入る前に測ると、ピンの開始位置がずれる（app/page.tsx と同じ理由）。
await page.evaluate(() => document.fonts.ready);
await sleep(2500);

// ピン留めされた実験は pin-spacer に包まれ、その高さが「スクロールで送れる距離 + 1 画面」になる。
const sections = await page.evaluate(() =>
  [...document.querySelectorAll('section[id]')].map((el) => {
    const box = el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
    return {
      id: el.id,
      top: box.getBoundingClientRect().top + scrollY,
      span: box.offsetHeight - innerHeight,
    };
  }),
);

const scrollTo = (y) => page.evaluate((y) => window.scrollTo(0, y), y);

function downscale(png) {
  const out = new Uint8Array(GW * GH * 4);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let dy = 0; dy < SCALE; dy++)
          for (let dx = 0; dx < SCALE; dx++)
            s += png.data[((y * SCALE + dy) * W + (x * SCALE + dx)) * 4 + c];
        out[(y * GW + x) * 4 + c] = s / (SCALE * SCALE);
      }
  return out;
}

const shot = async () => downscale(PNG.sync.read(await page.screenshot({ type: 'png' })));

/**
 * GIF に書き出す。容量を決めているのは 2 点。
 *
 * - パレットは全コマ共通の 1 枚にする。コマごとに作ると、同じ黒でも番号が揺れて
 *   次の差分がほとんど取れなくなる。数コマを抜き出して量子化すれば全体の色は拾える。
 * - 前のコマと同じ番号になった画素は透明（0 番）にして、前のコマを透かして見せる（dispose: 1）。
 *   背景がほぼ黒で動く部分が小さいので、これで 1/3〜1/5 になる。
 *   0 番は「変化なし」専用に空けておく。実在の色と兼ねると、その色の画素が常に抜けてしまう。
 */
function encode(frames, file) {
  const step = Math.ceil(frames.length / 8);
  const sample = frames.filter((_, i) => i % step === 0);
  const all = new Uint8Array(sample.length * GW * GH * 4);
  sample.forEach((f, i) => all.set(f.rgba, i * GW * GH * 4));
  const colors = quantize(all, 127, { format: 'rgb565' });
  const palette = [[0, 0, 0], ...colors];

  const gif = GIFEncoder();
  let prev = null;
  for (const [i, f] of frames.entries()) {
    const idx = applyPalette(f.rgba, colors, 'rgb565').map((v) => v + 1);
    const out = new Uint8Array(idx);
    if (prev) for (let p = 0; p < out.length; p++) if (out[p] === prev[p]) out[p] = 0;
    gif.writeFrame(out, GW, GH, {
      palette: i === 0 ? palette : undefined,
      delay: f.delay,
      transparent: i > 0,
      transparentIndex: 0,
      dispose: 1,
      repeat: 0,
    });
    prev = idx;
  }
  gif.finish();
  writeFileSync(file, gif.bytes());
  return gif.bytes().length;
}

/** scrub: 区間を等分して 1 コマずつ送る。scrub: 0.6 の追従遅れがあるので、各コマで少し待つ。 */
async function captureScrub(s) {
  const [p0, p1] = NO_FADE.has(s.id) ? [0.02, 1] : [0.11, 0.89];
  const N = 44;
  const frames = [];
  await scrollTo(s.top + s.span * p0);
  await sleep(1500);
  for (let k = 0; k < N; k++) {
    await scrollTo(s.top + s.span * (p0 + ((p1 - p0) * k) / (N - 1)));
    await sleep(90);
    frames.push({ rgba: await shot(), delay: 90 });
  }
  // 最後の絵で少し止めてからループさせる。
  await sleep(1200);
  frames.push({ rgba: await shot(), delay: 1400 });
  return frames;
}

/** 実時間で撮る。撮影 1 回の所要時間がまちまちなので、コマの表示時間は実測の間隔から決める。 */
async function captureLive(s, mode) {
  const frames = [];
  await scrollTo(s.top);
  await sleep(1800);
  if (s.id === 'orrery') await page.screenshot({ path: join(OUT, 'hero.png') });

  const duration = mode === 'select' ? 6500 : 5000;
  const t0 = Date.now();
  let last = t0;
  let clicked = false;
  if (mode === 'pointer') await page.mouse.move(W / 2, H / 2);
  while (Date.now() - t0 < duration) {
    const t = (Date.now() - t0) / 1000;
    if (mode === 'pointer')
      await page.mouse.move(W / 2 + Math.sin(t * 1.3) * W * 0.3, H / 2 + Math.sin(t * 2.1) * H * 0.25);
    if (mode === 'wiggle') await scrollTo(s.top + Math.sin(t * 2.4) * H * 0.18);
    if (mode === 'select' && !clicked && t > 1.5) {
      // 天体は公転しているので、押す直前に位置を読む。見た目の円の兄弟にある当たり判定の円を押す。
      const [x, y] = await page.evaluate(() => {
        const hit = document.querySelector('[data-label="parallax"]').previousElementSibling;
        const r = hit.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      });
      await page.mouse.click(x, y);
      // 乗せたままだと HOVER TO HOLD で止まるので、カーソルを外して公転を再開させる。
      await page.mouse.move(40, H / 2);
      clicked = true;
    }
    const rgba = await shot();
    const now = Date.now();
    if (frames.length) frames.at(-1).delay = Math.max(40, Math.round((now - last) / 10) * 10);
    frames.push({ rgba, delay: 100 });
    last = now;
  }
  if (mode === 'wiggle') await scrollTo(s.top);
  return frames;
}

mkdirSync(OUT, { recursive: true });
const mids = [];
for (const [n, s] of sections.entries()) {
  if (ONLY && !ONLY.includes(s.id)) continue;
  const mode = MODE[s.id] ?? 'scrub';
  const frames = mode === 'scrub' ? await captureScrub(s) : await captureLive(s, mode);
  const name = `${String(n + 1).padStart(2, '0')}-${s.id}.gif`;
  const bytes = encode(frames, join(OUT, name));
  mids.push(frames[Math.floor(frames.length * 0.6)].rgba);
  console.log(`${name}  ${frames.length} frames  ${(bytes / 1024).toFixed(0)}KB`);
}
await browser.close();

if (process.env.SHEET && mids.length) {
  const cols = 3;
  const sheet = new PNG({ width: GW * cols, height: GH * Math.ceil(mids.length / cols) });
  // 端数で空いたマスが透明（ビューアでは白）にならないよう、黒で埋めておく。
  for (let i = 3; i < sheet.data.length; i += 4) sheet.data[i] = 255;
  mids.forEach((rgba, i) => {
    const ox = (i % cols) * GW;
    const oy = Math.floor(i / cols) * GH;
    for (let y = 0; y < GH; y++)
      sheet.data.set(rgba.subarray(y * GW * 4, (y + 1) * GW * 4), ((oy + y) * sheet.width + ox) * 4);
  });
  writeFileSync(process.env.SHEET, PNG.sync.write(sheet));
  console.log(`sheet: ${process.env.SHEET}`);
}
