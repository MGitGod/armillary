# Parallax シリーズ（実験 #11〜#15）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** パララックスを「速度差だけでは奥行きにならない」という一本の主張で貫き、四つの技法を一つずつ見せてから、最後に測距儀として融合させる 5 実験をラボに足す。

**Architecture:** 数学は全部 `lib/` の純粋関数に出して Node で検算する（既存の `lib/orbital.ts` / `lib/radial-burst.ts` と同じ分け方）。実験は `Experiment` 型のオブジェクトを 1 つ export するだけで、スクロールの配線は `LabSection` が持つ。スクロール位置で決まる #11 #12 #15 は `render` + `build`、位置の関数でない入力（ポインタ・スクロール速度）を使う #13 #14 は `pin: false` + `Component`。

**Tech Stack:** Next.js / React 19 / TypeScript / GSAP 3.15（ScrollTrigger 同梱、追加依存ゼロ）/ Tailwind v4 / Node 24 組み込みテストランナー

**設計の出典:** `docs/superpowers/specs/2026-08-29-parallax-series-design.md`
**確定値の実測元:** `docs/parallax-atlas.html`（リポジトリにコミット済み。図版の見た目を詰めるときはこれを開いて比べる）

## Global Constraints

- **追加依存は入れない。** GSAP 3.15 に旧 Club GreenSock のプラグインが全て同梱されている。`npm install` を伴う変更は禁止
- **THREE.js を使わない。** 奥行きが要る箇所も SVG で自前投影する（既存 spec の決定。#13 はその実証が主題）
- **層は 4 枚に統一。** 3〜4 枚を超えると速度差を知覚できず、合成コストだけ増える
- **`z ∈ [0,1]`**（0 = 手前、1 = 奥）。深度は全モジュールでこの向き
- **`transform` と `opacity` 以外を毎フレーム動かさない。** `top` / `margin` / `background-position` は再レイアウトを起こす
- **`maxTravel()` は関数として使う。** spec の 110 / 90 という数値は見本帳の寸法（ステージ 400px）で出たもので、そのまま持ち込まない
- **`lib/` に置くものは純粋関数のみ。** DOM も描画も `window` 参照も持たない（テストが Node で回らなくなる）
- **テストは `lib/*.test.ts`。** `npm test` の glob がこれなので、この名前以外だと回らない
- **`.ts` 拡張子つきで import する**（`from './parallax.ts'`）。`tsconfig.json` の `allowImportingTsExtensions: true` がその前提
- **コメントは後日チュートリアル記事に育てる前提で書く。** 何が定石か／なぜその値か／試して駄目だった代案／踏んだ落とし穴。数値には根拠を添える
- **reduced-motion:** `LabSection` はピン留めする実験（#11 #12 #15）を自動で守る。`pin: false` の #13 #14 は**自前で対応が要る**
- **`render()` が単体で静止画として成立すること。** `LabSection` は動きを減らす設定のとき
  `build()` を**呼び出しごとスキップする**（アニメを止めるのではない）。したがって
  **`build()` の中でしか位置が書かれない要素は、その設定で恒久的に壊れる**
  ── SVG 要素なら原点 (0,0) に、DOM 要素なら transform 無しの位置に固まる。
  位置・色・ぼけなど、静止画として意味を持つ属性は `render()` 側の初期値で与え、
  `build()` はそれを上書きするだけにすること。既存の `shutter.tsx` が
  「レイアウトで済むものはレイアウトで済ませる」と書いているのと同じ理由
- コミットメッセージは日本語。既存の `feat(radial-burst): …` の形に揃える

## File Structure

| ファイル | 責務 |
|---|---|
| `lib/parallax.ts` | 深度 → 手がかりの写像、移動量の上限、速度 skew、ばね、稜線パス生成。#12 #14 #15 が使う |
| `lib/parallax.test.ts` | 上の回帰テスト |
| `lib/parallax-astro.ts` | 視差楕円、視差角 → 距離、星のデータ。#11 #15 が使う |
| `lib/parallax-astro.test.ts` | 上の回帰テスト |
| `lib/frustum.ts` | 非対称視錐台の投影と、比較用の平行移動。#13 #15 が使う |
| `lib/frustum.test.ts` | 上の回帰テスト |
| `components/lab/experiments/stellar-parallax.tsx` | #11 |
| `components/lab/experiments/depth-stack.tsx` | #12 |
| `components/lab/experiments/off-axis-window.tsx` | #13 |
| `components/lab/experiments/velocity-parallax.tsx` | #14 |
| `components/lab/experiments/rangefinder.tsx` | #15 |
| `components/lab/registry.ts` | import 5 行と配列に 5 要素 |

`lib/` の 3 つは互いに依存しない。実験は lib に片方向に依存する。

---

### Task 1: `lib/parallax.ts` — 深度から全部を導く

**Files:**
- Create: `lib/parallax.ts`
- Test: `lib/parallax.test.ts`

**Interfaces:**
- Consumes: なし（このタスクが土台）
- Produces:
  - `type DepthCues = { speed: number; blur: number; saturate: number; contrast: number; scale: number }`
  - `depthCues(z: number, gain?: number): DepthCues`
  - `maxTravel(nearHeight: number, farHeight: number, nearSpeed: number, farSpeed: number, safety?: number): number`
  - `velocitySkew(velocity: number, z: number): number`
  - `springStiffness(z: number): number`
  - `type Spring = { y: number; v: number }`
  - `stepSpring(s: Spring, target: number, z: number, dt: number): Spring`
  - `ridgePath(phase: number, amp: number, base: number): string`
  - `ridgeBox(visibleHeight: number): { height: number; bottom: number; viewBox: string }`
  - `RIDGE_W = 600`, `RIDGE_VIEW_H = 300`, `RIDGE_FOOT = 700`

- [ ] **Step 1: 失敗するテストを書く**

`lib/parallax.test.ts` を新規作成:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIDGE_FOOT,
  RIDGE_VIEW_H,
  depthCues,
  maxTravel,
  ridgeBox,
  ridgePath,
  springStiffness,
  stepSpring,
  velocitySkew,
} from './parallax.ts';

const near = (a: number, b: number, eps = 1e-12) => Math.abs(a - b) < eps;

test('手前（z=0）は恒等。何も掛からない', () => {
  const c = depthCues(0);
  assert.ok(near(c.speed, 1));
  assert.ok(near(c.blur, 0));
  assert.ok(near(c.saturate, 1));
  assert.ok(near(c.contrast, 1));
  assert.ok(near(c.scale, 1));
});

test('奥（z=1）は速度が落ち、ぼけ・彩度・コントラストが効く', () => {
  const c = depthCues(1);
  assert.ok(near(c.speed, 0.28));
  assert.ok(near(c.blur, 3.2));
  assert.ok(near(c.saturate, 0.45));
  assert.ok(near(c.contrast, 0.72));
  assert.ok(near(c.scale, 1.06));
});

test('gain は深度→速度の傾きだけを反転させる。方向は反転させない', () => {
  // gain=+1: 奥ほど遅い（正常）
  assert.ok(depthCues(1, 1).speed < depthCues(0, 1).speed);
  // gain=0: 全層が同じ速度＝奥行き消失
  assert.ok(near(depthCues(0, 0).speed, 1));
  assert.ok(near(depthCues(1, 0).speed, 1));
  // gain=-1: 奥ほど速い（反転）
  assert.ok(near(depthCues(1, -1).speed, 1.72));
  assert.ok(depthCues(1, -1).speed > depthCues(0, -1).speed);
  // どの gain でも速度は正のまま＝シーンごと逆走しない
  for (const g of [-1, -0.5, 0, 0.5, 1]) {
    for (const z of [0, 0.34, 0.67, 1]) {
      assert.ok(depthCues(z, g).speed > 0, `gain=${g} z=${z} で速度が負になった`);
    }
  }
});

test('speed は z について単調', () => {
  const zs = [0, 0.25, 0.5, 0.75, 1];
  const asc = zs.map((z) => depthCues(z, 1).speed);
  const desc = zs.map((z) => depthCues(z, -1).speed);
  for (let i = 1; i < zs.length; i++) {
    assert.ok(asc[i] < asc[i - 1], 'gain=+1 では単調減少');
    assert.ok(desc[i] > desc[i - 1], 'gain=-1 では単調増加');
  }
});

test('maxTravel が返す量なら、手前の稜線が奥を追い越さない', () => {
  const S = 400, Hn = 150, Hf = 245;
  const vn = depthCues(0).speed, vf = depthCues(1).speed;
  const range = maxTravel(Hn, Hf, vn, vf);

  const crest = (H: number, v: number, r: number) => S - H - r * v;
  // 上限いっぱいでも追い越さない
  assert.ok(crest(Hn, vn, range) > crest(Hf, vf, range));
  // 安全率なしの理論上限では、ちょうど接する
  const bound = maxTravel(Hn, Hf, vn, vf, 1);
  assert.ok(Math.abs(crest(Hn, vn, bound) - crest(Hf, vf, bound)) < 1e-9);
  // 上限を超えると追い越す
  assert.ok(crest(Hn, vn, bound * 1.2) < crest(Hf, vf, bound * 1.2));
});

test('maxTravel は速度差がないとき無限、奥が手前より低いとき 0', () => {
  assert.equal(maxTravel(150, 245, 1, 1), Infinity);
  assert.equal(maxTravel(245, 150, 1, 0.28), 0);
});

test('velocitySkew は飽和域でも深度の順序を保つ', () => {
  const zs = [0, 0.34, 0.67, 1];
  // 常用域の上端（見本帳の実測は 2,000〜8,600 px/s）
  for (const v of [2169, 5000, 8642, 20000]) {
    const s = zs.map((z) => velocitySkew(v, z));
    for (let i = 1; i < s.length; i++) {
      assert.ok(s[i] > s[i - 1], `v=${v} で z=${zs[i]} が z=${zs[i - 1]} を上回らない`);
    }
  }
});

test('velocitySkew は深度ごとの上限を超えない。符号は速度に従う', () => {
  for (const z of [0, 0.5, 1]) {
    const lim = 6 + 9 * z;
    assert.ok(near(velocitySkew(1e9, z), lim, 1e-9));
    assert.ok(near(velocitySkew(-1e9, z), -lim, 1e-9));
  }
  assert.equal(velocitySkew(0, 0.5), 0);
});

test('ばねは臨界減衰。行き過ぎない', () => {
  let s = { y: 0, v: 0 };
  let peak = 0, prev = -1;
  for (let i = 0; i < 2000; i++) {
    s = stepSpring(s, 1, 0, 1 / 240);
    peak = Math.max(peak, s.y);
    assert.ok(s.y >= prev - 1e-12, '単調に近づく');
    prev = s.y;
  }
  assert.ok(peak <= 1 + 1e-3, `行き過ぎた: ${peak}`);
  assert.ok(near(s.y, 1, 1e-3), '最後は目標に収束する');
});

test('奥ほど柔らかく、遅れて追いつく', () => {
  assert.ok(springStiffness(1) < springStiffness(0));
  const run = (z: number) => {
    let s = { y: 0, v: 0 };
    for (let i = 0; i < 40; i++) s = stepSpring(s, 1, z, 1 / 240);
    return s.y;
  };
  assert.ok(run(1) < run(0), '同じ時間で、奥のほうが手前より遅れている');
});

test('ridgeBox は延長しても縦の倍率を変えない', () => {
  for (const H of [150, 190, 245, 280]) {
    const b = ridgeBox(H);
    // 元の倍率（H / 300）と、延長後の倍率（height / 700）が一致する
    assert.ok(near(b.height / RIDGE_FOOT, H / RIDGE_VIEW_H, 1e-9));
    // 上端の位置が変わらない = 延長分がそのまま bottom のマイナス
    assert.ok(near(b.height + b.bottom, H, 1e-9));
    // 延長分が下向きの余裕になる
    assert.ok(-b.bottom > 0);
  }
});

test('ridgePath は閉じた図形で、足が延長線まで届く', () => {
  const d = ridgePath(0, 46, 96);
  assert.ok(d.startsWith(`M0 ${RIDGE_FOOT}`), '左下から始まる');
  assert.ok(d.endsWith(`L600 ${RIDGE_FOOT}Z`), '右下で閉じる');
  // 稜線の頂点は viewBox の上半分に収まる
  const ys = [...d.matchAll(/L\d+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const crest = ys.filter((y) => y < RIDGE_FOOT);
  assert.ok(crest.length > 40, '刻みが十分ある');
  assert.ok(Math.min(...crest) > 0, 'viewBox の上へはみ出さない');
  assert.ok(Math.max(...crest) < RIDGE_VIEW_H, '稜線が地面より下へ行かない');
});

test('ridgePath は phase で形が変わり、同じ phase なら同じ形', () => {
  assert.equal(ridgePath(1.5, 46, 96), ridgePath(1.5, 46, 96));
  assert.notEqual(ridgePath(0, 46, 96), ridgePath(2.7, 46, 96));
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/parallax.test.ts
```

Expected: FAIL — `Cannot find module './parallax.ts'`

- [ ] **Step 3: 実装を書く**

`lib/parallax.ts` を新規作成:

```ts
/**
 * @file parallax.ts
 * @description 深度から見た目を導く写像。純粋関数だけを置く（DOM も描画も持たない）。
 *
 * 速度・ぼけ・彩度・コントラスト・スケールを別々に手で調整すると必ずずれる。
 * z ひとつを入力とする関数にして、そこから全部を導出する。
 *
 * 運動視差は単独では弱い単眼手がかりで、他と足し算して初めて効く
 * （両眼視差と併用すると 3D 構造の検出閾値が平均 48% 下がる: Royal Society, 2016）。
 * 「速度差だけでは奥行きにならない」がシリーズ全体の主張。
 */

export type DepthCues = {
  /** 移動量の倍率。1 = スクロールと等速。 */
  speed: number;
  /** ぼけ [px]。 */
  blur: number;
  saturate: number;
  contrast: number;
  scale: number;
};

/**
 * 深度 z ∈ [0,1]（0 = 手前, 1 = 奥）から手がかり一式を導く。
 *
 * gain は深度→速度の**傾き**。方向ではない。
 *   +1 正常（奥ほど遅い） / 0 奥行き消失（全層が一枚の板） / −1 反転（奥ほど速い）
 *
 * ここを `(1 - 0.72*z) * gain` と書くと、gain が負のとき全層の符号が反転して
 * シーンごと逆走する（区間の終わりに全部が画面外へ出る）。それは逆視差ではない。
 * 掛けるのは z のほうであって、式全体ではない。
 *
 * blur を z^1.6 にしているのは、線形だと手前側でぼけ始めるのが早すぎるため。
 * 1.0 / 1.6 / 2.2 を比べて 1.6 を採った（1.0 は近景が濁り、2.2 は奥が効かない）。
 */
export const depthCues = (z: number, gain = 1): DepthCues => ({
  speed: 1 - 0.72 * z * gain,
  blur: 3.2 * Math.pow(z, 1.6),
  saturate: 1 - 0.55 * z,
  contrast: 1 - 0.28 * z,
  scale: 1 + 0.06 * z,
});

/**
 * 手前の稜線が奥の稜線を追い越さない移動量の上限。
 *
 * 追い越すと風景が裏返って読めなくなる。ステージ高 S のとき稜線の高さは
 * `S − H − range·v` なので、手前が奥より上に行かない条件は
 *
 *     S − H_near − range·v_near  >  S − H_far − range·v_far
 *     ⟺  range  <  (H_far − H_near) / (v_near − v_far)
 *
 * S が消えるので、ステージ高には依存しない。
 * 寸法ごとに変わる値なので、数値を手で置かずここから取る。
 * safety は理論上限に対する余裕（見本帳では 132px の上限に対し 110px を採った）。
 */
export const maxTravel = (
  nearHeight: number,
  farHeight: number,
  nearSpeed: number,
  farSpeed: number,
  safety = 0.83,
) => {
  const dv = nearSpeed - farSpeed;
  if (dv <= 0) return Infinity;   // 速度差がなければ追い越しは起きない
  return Math.max(0, ((farHeight - nearHeight) / dv) * safety);
};

/**
 * スクロール速度による歪み。
 *
 * 定石は `velocity / -300`（係数 0.0033）を ±10〜20° でクランプするもの
 * （GSAP コミュニティの skew デモ）。深度を効かせようと
 * `clamp(v · k · (1+z), ±14°)` と書くと、**常用域で全層が上限に張り付いて
 * 深度差がちょうど消える**。実測 8,000 px/s で 4 層とも 8.2° になった。
 * 見せたいものが、見せたい場面でだけ消える。
 *
 * クランプ自体を深度依存にすると解ける。飽和しても順序が残る。
 */
export const velocitySkew = (velocity: number, z: number) => {
  const lim = 6 + 9 * z;
  const raw = velocity * 0.0022 * (1 + 1.6 * z);
  return Math.max(-lim, Math.min(lim, raw));
};

/** 深度ごとのばね剛性。奥ほど柔らかく、遅れて追いつく。 */
export const springStiffness = (z: number) => 26 - 17 * z;

export type Spring = { y: number; v: number };

/**
 * 臨界減衰ばねを 1 ステップ進める。減衰係数 2√k が臨界減衰の条件。
 * 速度を先に更新してから位置に使う（半陰的オイラー）。陽的だと発散しやすい。
 */
export const stepSpring = (s: Spring, target: number, z: number, dt: number): Spring => {
  const k = springStiffness(z);
  const a = k * (target - s.y) - 2 * Math.sqrt(k) * s.v;
  const v = s.v + a * dt;
  return { y: s.y + v * dt, v };
};

// ── 稜線 ────────────────────────────────────────────

export const RIDGE_W = 600;
/** 稜線を描く座標系の高さ。地面がここ。 */
export const RIDGE_VIEW_H = 300;
/** viewBox の実際の下端。地面よりさらに下へ延ばしてある。 */
export const RIDGE_FOOT = 700;

/**
 * 稜線 SVG の寸法。
 *
 * `bottom: 0` で置いて translateY で持ち上げると、SVG の下端とステージ下端の
 * 間に隙間が空く（塗りが尽きて背景が透ける）。静止画では見えず、スクロールして初めて出る。
 *
 * viewBox を下へ延長し、要素も同じ比率で伸ばして下端を画面外へ追い出す。
 * `preserveAspectRatio="none"` なので縦の倍率は `要素高 / viewBox 高` で決まり、
 * 3 つを揃えると倍率は延長前の `H/300` のまま変わらない
 * ＝ 稜線の位置と振幅は延長前と一致する。延長分が移動量の余裕になる。
 */
export const ridgeBox = (visibleHeight: number) => ({
  height: visibleHeight * (RIDGE_FOOT / RIDGE_VIEW_H),
  bottom: -visibleHeight * ((RIDGE_FOOT - RIDGE_VIEW_H) / RIDGE_VIEW_H),
  viewBox: `0 0 ${RIDGE_W} ${RIDGE_FOOT}`,
});

/**
 * 稜線のパス。正弦を 3 本重ねて作る。
 * 長いパスデータを手書きしない（既存 spec の方針）。周期の比を無理数寄りにして、
 * 折り返しが目立たないようにしてある。
 */
export const ridgePath = (phase: number, amp: number, base: number) => {
  let d = `M0 ${RIDGE_FOOT}L0 ${RIDGE_VIEW_H - base}`;
  for (let x = 0; x <= RIDGE_W; x += 12) {
    const y =
      RIDGE_VIEW_H -
      base -
      Math.sin(x / 118 + phase) * amp -
      Math.sin(x / 41 + phase * 2.1) * amp * 0.32 -
      Math.sin(x / 23 + phase * 0.7) * amp * 0.12;
    d += `L${x} ${y.toFixed(1)}`;
  }
  return d + `L${RIDGE_W} ${RIDGE_FOOT}Z`;
};

/** 4 層の既定値。手前ほど低く大きく、奥ほど高く薄い。 */
export const RIDGE_LAYERS = [0, 1, 2, 3].map((i) => {
  const z = i / 3;
  return {
    z,
    /** 見える高さ [px]。 */
    height: 150 + z * 95,
    phase: i * 2.7,
    amp: 46 - z * 16,
    base: 96 + z * 42,
  };
});
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/parallax.test.ts
```

Expected: PASS（12 テスト）

- [ ] **Step 5: 型検査**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add lib/parallax.ts lib/parallax.test.ts && git commit -m "feat(parallax): 深度から手がかりを導く純関数と、移動量の上限・速度 skew"
```

---

### Task 2: `lib/parallax-astro.ts` — 視差楕円と距離

**Files:**
- Create: `lib/parallax-astro.ts`
- Test: `lib/parallax-astro.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `LY_PER_PC = 3.26156`, `ARCSEC_PX = 90`
  - `type Star = { name: string; parallax: number; eclipticLat: number; x: number; y: number; mag: number }`
  - `STARS: Star[]`（6 星）
  - `ellipseAxes(parallax: number, eclipticLat: number): { major: number; minor: number }`
  - `parallaxOffset(parallax: number, eclipticLat: number, theta: number): { dx: number; dy: number }`
  - `parsecFromArcsec(parallax: number): number`
  - `lightYears(pc: number): number`
  - `pixelShift(parallax: number, k?: number): number`
  - `isMeasurable(parallax: number, k?: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`lib/parallax-astro.test.ts` を新規作成:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCSEC_PX,
  LY_PER_PC,
  STARS,
  ellipseAxes,
  isMeasurable,
  lightYears,
  parallaxOffset,
  parsecFromArcsec,
  pixelShift,
} from './parallax-astro.ts';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test('黄道の極では真円、黄道面上では直線に退化する', () => {
  const p = 0.5;
  for (const beta of [90, -90]) {
    const e = ellipseAxes(p, beta);
    assert.ok(near(e.major, e.minor), `β=${beta} で真円にならない`);
  }
  const flat = ellipseAxes(p, 0);
  assert.ok(near(flat.major, p));
  assert.ok(near(flat.minor, 0), '黄道面上では短軸が 0（直線）');
});

test('軌跡そのものが、極では真円、黄道面上では直線になる', () => {
  // ellipseAxes（半軸）だけを見ても、この主張は固定できない。
  // 実際に軌跡を生む parallaxOffset を臨界値で直接叩く。
  // ここを空けておくと、ellipseAxes を触らずに parallaxOffset だけを
  // 壊す変更が、テストを全部すり抜ける。
  const p = 0.42;
  const thetas = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
  for (const beta of [90, -90]) {
    for (const th of thetas) {
      const o = parallaxOffset(p, beta, th);
      assert.ok(near(o.dx * o.dx + o.dy * o.dy, p * p, 1e-9),
        `β=${beta} θ=${th.toFixed(2)} で真円から外れた`);
    }
  }
  for (const th of thetas) {
    assert.ok(near(parallaxOffset(p, 0, th).dy, 0), '黄道面上では dy が常に 0');
  }
});

test('半軸は ϖ と ϖ·|sin β|', () => {
  const e = ellipseAxes(0.3792, -39.6);
  assert.ok(near(e.major, 0.3792));
  assert.ok(near(e.minor, 0.3792 * Math.abs(Math.sin((-39.6 * Math.PI) / 180))));
  assert.ok(e.minor > 0, '負の黄緯でも短軸は正');
});

test('一年で楕円を一周し、なぞる範囲が半軸に一致する', () => {
  const p = 0.4, beta = 30;
  const e = ellipseAxes(p, beta);
  let maxX = -Infinity, maxY = -Infinity;
  const N = 720;
  for (let i = 0; i < N; i++) {
    const o = parallaxOffset(p, beta, (i / N) * Math.PI * 2);
    maxX = Math.max(maxX, Math.abs(o.dx));
    maxY = Math.max(maxY, Math.abs(o.dy));
  }
  assert.ok(near(maxX, e.major, 1e-4));
  assert.ok(near(maxY, e.minor, 1e-4));
  // 一周して元に戻る
  const a = parallaxOffset(p, beta, 0);
  const b = parallaxOffset(p, beta, Math.PI * 2);
  assert.ok(near(a.dx, b.dx, 1e-9) && near(a.dy, b.dy, 1e-9));
});

test('d = 1/ϖ。これは d = B/θ の B = 1 AU, θ = 秒角 という特殊形', () => {
  assert.ok(near(parsecFromArcsec(1), 1), '1 秒角 = 1 パーセク');
  assert.ok(near(parsecFromArcsec(0.5), 2));
  assert.ok(near(lightYears(1), LY_PER_PC));
});

test('6 星の距離が実測値と一致する（有効数字 3 桁）', () => {
  const expect: Record<string, [number, number]> = {
    // 名前: [pc, ly]
    'Proxima Centauri': [1.30, 4.24],
    Sirius: [2.64, 8.60],
    Altair: [5.13, 16.7],
    Vega: [7.68, 25.0],
    Polaris: [132, 429],
    Betelgeuse: [182, 593],
  };
  assert.equal(STARS.length, 6);
  for (const s of STARS) {
    const [pc, ly] = expect[s.name];
    const got = parsecFromArcsec(s.parallax);
    assert.ok(Math.abs(got - pc) / pc < 0.005, `${s.name}: ${got} pc（期待 ${pc}）`);
    const gotLy = lightYears(got);
    assert.ok(Math.abs(gotLy - ly) / ly < 0.005, `${s.name}: ${gotLy} ly（期待 ${ly}）`);
  }
});

test('地上観測の限界がそのまま図に出る。測れないのは 2 星だけ', () => {
  const out = STARS.filter((s) => !isMeasurable(s.parallax));
  assert.deepEqual(out.map((s) => s.name).sort(), ['Betelgeuse', 'Polaris']);
  // 測れない星は 100 pc より遠い
  for (const s of out) assert.ok(parsecFromArcsec(s.parallax) > 100);
  // 測れる星は 1px 以上ずれる
  for (const s of STARS.filter((x) => isMeasurable(x.parallax))) {
    assert.ok(pixelShift(s.parallax) >= 1);
  }
});

test('図上のずれは縮尺に比例する', () => {
  assert.ok(near(pixelShift(0.3792), 0.3792 * ARCSEC_PX));
  assert.ok(near(pixelShift(0.5, 100), 50));
});

test('星の配置とデータが図に載る形で揃っている', () => {
  for (const s of STARS) {
    assert.ok(s.parallax > 0, `${s.name}: 視差が正`);
    assert.ok(Math.abs(s.eclipticLat) <= 90, `${s.name}: 黄緯が範囲内`);
    assert.ok(s.x >= 0 && s.x <= 620, `${s.name}: x が viewBox 内`);
    assert.ok(s.y >= 0 && s.y <= 350, `${s.name}: y が viewBox 内`);
    assert.ok(s.mag > 0, `${s.name}: 描画半径が正`);
  }
  // 近い順に並べておく（表の並びをコード側で保証する）
  for (let i = 1; i < STARS.length; i++) {
    assert.ok(STARS[i].parallax <= STARS[i - 1].parallax, '視差の降順＝近い順');
  }
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/parallax-astro.test.ts
```

Expected: FAIL — `Cannot find module './parallax-astro.ts'`

- [ ] **Step 3: 実装を書く**

`lib/parallax-astro.ts` を新規作成:

```ts
/**
 * @file parallax-astro.ts
 * @description 恒星視差。純粋関数とデータだけを置く（DOM も描画も持たない）。
 *
 * 視差を装飾ではなく計測として扱うための道具。
 * 地球が軌道を一周するあいだ、星は空の上で楕円を描く。半軸は ϖ と ϖ·sin β。
 * 黄道の極では真円に、黄道面上では直線に退化する。
 * 楕円の大きさは距離の逆数にそのまま比例する。
 */

/** 1 パーセク = 3.26156 光年。 */
export const LY_PER_PC = 3.26156;

/**
 * 図の縮尺。1 秒角あたりの px。
 * 実際の見かけの角度に対して極端な誇張で、ESA の Gaia 解説動画も
 * 同じく約 1 万倍で描いている。誇張していること自体を画面に出す。
 */
export const ARCSEC_PX = 90;

/** 地上観測で視差が測れる限界。図の上で 1px 未満は測れないものとして扱う。 */
export const MEASURABLE_PX = 1;

export type Star = {
  name: string;
  /** 年周視差 ϖ ["]。Hipparcos / Gaia の実測。 */
  parallax: number;
  /** 黄緯 β [deg]。概数。楕円の潰れ方を決める。 */
  eclipticLat: number;
  /** 図上の基準位置（viewBox 620×350）。 */
  x: number;
  y: number;
  /** 描画半径。 */
  mag: number;
};

/**
 * 視差の降順＝近い順に並べてある。表の並びをここで保証する。
 *
 * 下 2 つは図上のずれが 1px を切る。これが重要で、
 * 地上観測の限界（約 100 pc）がそのまま図に出る
 * ──「測れない」を演出ではなく事実として見せられる。
 */
export const STARS: Star[] = [
  { name: 'Proxima Centauri', parallax: 0.7687, eclipticLat: -44.6, x: 108, y: 262, mag: 2.0 },
  { name: 'Sirius',           parallax: 0.3792, eclipticLat: -39.6, x: 296, y: 196, mag: 3.4 },
  { name: 'Altair',           parallax: 0.1948, eclipticLat:  29.3, x: 452, y: 118, mag: 2.6 },
  { name: 'Vega',             parallax: 0.1303, eclipticLat:  61.7, x: 196, y:  84, mag: 2.9 },
  { name: 'Polaris',          parallax: 0.0076, eclipticLat:  66.1, x: 516, y:  58, mag: 2.2 },
  { name: 'Betelgeuse',       parallax: 0.0055, eclipticLat: -16.0, x: 384, y: 278, mag: 3.1 },
];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 視差楕円の半軸。長軸 ϖ、短軸 ϖ·|sin β|。 */
export const ellipseAxes = (parallax: number, eclipticLat: number) => ({
  major: parallax,
  minor: parallax * Math.abs(Math.sin(rad(eclipticLat))),
});

/**
 * 公転位相 θ（0〜2π が一年）における見かけのずれ［秒角］。
 * θ を一周させると半軸 (ϖ, ϖ·sin β) の楕円をなぞる。
 */
export const parallaxOffset = (parallax: number, eclipticLat: number, theta: number) => ({
  dx: -parallax * Math.sin(theta),
  dy: -parallax * Math.cos(theta) * Math.sin(rad(eclipticLat)),
});

/**
 * d[pc] = 1 / ϖ["]。
 * これは測距儀の式 d = B/θ の、B = 1 AU・θ = 秒角 という特殊形にすぎない
 * （#15 が同じ式を基線長を変えて使う）。
 */
export const parsecFromArcsec = (parallax: number) => 1 / parallax;

export const lightYears = (pc: number) => pc * LY_PER_PC;

/** 図上のずれ [px]。 */
export const pixelShift = (parallax: number, k = ARCSEC_PX) => parallax * k;

/** 図の上で測れるか。1px を切ると測れない。 */
export const isMeasurable = (parallax: number, k = ARCSEC_PX) =>
  pixelShift(parallax, k) >= MEASURABLE_PX;
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/parallax-astro.test.ts
```

Expected: PASS（8 テスト）

- [ ] **Step 5: コミット**

```bash
git add lib/parallax-astro.ts lib/parallax-astro.test.ts && git commit -m "feat(parallax): 視差楕円と距離の純関数、Hipparcos/Gaia の実測 6 星"
```

---

### Task 3: `lib/frustum.ts` — 非対称視錐台

**Files:**
- Create: `lib/frustum.ts`
- Test: `lib/frustum.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type Vec3 = { x: number; y: number; z: number }`
  - `type Vec2 = { x: number; y: number }`
  - `type Eye = Vec3`
  - `projectOffAxis(p: Vec3, eye: Eye): Vec2`
  - `projectNaive(p: Vec3, eye: Eye, depthScale?: number): Vec2`
  - `shaftRings(half: number, depths: number[]): Vec3[][]`
  - `SHAFT_DEPTHS: number[]`, `SHAFT_HALF: number`, `EYE_Z_RATIO = 1.30`

- [ ] **Step 1: 失敗するテストを書く**

`lib/frustum.test.ts` を新規作成:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHAFT_DEPTHS,
  SHAFT_HALF,
  projectNaive,
  projectOffAxis,
  shaftRings,
  type Eye,
} from './frustum.ts';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const width = (pts: { x: number }[]) =>
  Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));

test('スクリーン平面（pz=0）の点は、視点をどこへ振っても動かない', () => {
  for (const eye of [{ x: 0, y: 0, z: 430 }, { x: 90, y: -50, z: 430 }] as Eye[]) {
    const a = projectOffAxis({ x: 60, y: -40, z: 0 }, eye);
    const b = projectNaive({ x: 60, y: -40, z: 0 }, eye);
    assert.ok(near(a.x, 60) && near(a.y, -40), '視錐台');
    assert.ok(near(b.x, 60) && near(b.y, -40), '平行移動');
  }
});

test('視点が正面でも視錐台は透視短縮する。平行移動はしない', () => {
  const eye: Eye = { x: 0, y: 0, z: 430 };
  const p = { x: 100, y: 100, z: -430 };
  // t = 430 / (430 + 430) = 0.5
  const off = projectOffAxis(p, eye);
  assert.ok(near(off.x, 50) && near(off.y, 50), '奥は半分に縮む');
  const nv = projectNaive(p, eye);
  assert.ok(near(nv.x, 100) && near(nv.y, 100), '平行移動は形を変えない');
});

test('視点を振ると、平行移動は奥面の幅を変えず、視錐台は縮める', () => {
  const eye: Eye = { x: 82, y: 43, z: 430 };
  const rings = shaftRings(SHAFT_HALF, SHAFT_DEPTHS);
  const front = rings[0];
  const back = rings[rings.length - 1];

  const nvFront = front.map((p) => projectNaive(p, eye));
  const nvBack = back.map((p) => projectNaive(p, eye));
  assert.ok(near(width(nvFront), width(nvBack)), '平行移動では奥面も同じ幅（剛体移動）');

  const offFront = front.map((p) => projectOffAxis(p, eye));
  const offBack = back.map((p) => projectOffAxis(p, eye));
  assert.ok(width(offBack) < width(offFront) * 0.7, '視錐台では奥面が明確に縮む');
});

test('視点を振ると、視錐台の奥面は手前面より大きくずれる（せん断）', () => {
  const eye: Eye = { x: 82, y: 43, z: 430 };
  const centre = (pts: { x: number }[]) =>
    (Math.max(...pts.map((p) => p.x)) + Math.min(...pts.map((p) => p.x))) / 2;
  const rings = shaftRings(SHAFT_HALF, SHAFT_DEPTHS);
  const cf = centre(rings[0].map((p) => projectOffAxis(p, eye)));
  const cb = centre(rings[rings.length - 1].map((p) => projectOffAxis(p, eye)));
  assert.ok(near(cf, 0), '手前面はスクリーン平面上なので動かない');
  assert.ok(cb > 30, `奥面が視点側へ寄る: ${cb}`);
});

test('無限遠の消失点は、視点のスクリーン座標に一致する', () => {
  const eye: Eye = { x: 82, y: 43, z: 430 };
  const far = projectOffAxis({ x: 500, y: -500, z: -1e9 }, eye);
  assert.ok(near(far.x, eye.x, 1e-3));
  assert.ok(near(far.y, eye.y, 1e-3));
});

test('視点が動かなければ投影も動かない', () => {
  const eye: Eye = { x: 0, y: 0, z: 430 };
  const p = { x: 30, y: 20, z: -200 };
  assert.deepEqual(projectOffAxis(p, eye), projectOffAxis(p, eye));
});

test('projectNaive の depthScale が実際に効く', () => {
  // 既定値 350 は「確定値」なのに、他のテストは全部この値に無反応
  // （p.z=0 か eye.x/y=0 で項が消えるか、幅の max−min で一律オフセットが相殺される）。
  // eye と p.z の両方を非ゼロにして、出力の数値そのものを見る。
  const eye: Eye = { x: 10, y: -6, z: 430 };
  // -p.z / depthScale = 350/350 = 1 なので、視点のオフセットがそのまま乗る
  const at350 = projectNaive({ x: 0, y: 0, z: -350 }, eye);
  assert.ok(near(at350.x, 10) && near(at350.y, -6));
  // 引数経路も死角にしない。係数が 2 になる
  const at175 = projectNaive({ x: 0, y: 0, z: -350 }, eye, 175);
  assert.ok(near(at175.x, 20) && near(at175.y, -12));
});

test('シャフトは各深度に 4 隅を持ち、手前から奥へ並ぶ', () => {
  const rings = shaftRings(SHAFT_HALF, SHAFT_DEPTHS);
  assert.equal(rings.length, SHAFT_DEPTHS.length);
  for (const r of rings) assert.equal(r.length, 4);
  assert.equal(rings[0][0].z, 0, '手前面はスクリーン平面上');
  for (let i = 1; i < rings.length; i++) {
    assert.ok(rings[i][0].z < rings[i - 1][0].z, '奥へ進む');
  }
  // 4 隅が正方形
  const r0 = rings[0];
  assert.ok(near(width(r0), SHAFT_HALF * 2));
});
```

- [ ] **Step 2: 落ちることを確認する**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/frustum.test.ts
```

Expected: FAIL — `Cannot find module './frustum.ts'`

- [ ] **Step 3: 実装を書く**

`lib/frustum.ts` を新規作成:

```ts
/**
 * @file frustum.ts
 * @description 非対称視錐台（off-axis perspective）。純粋関数だけを置く。
 *
 * ビューポートを壁に空いた穴として扱うための投影。
 * Kooima の generalized perspective projection と同じものだが、
 * 射影行列を組む必要はない ── 視点からスクリーン平面（z=0）へ光線を張り直して
 * 交点を取るだけで足りる。
 *
 * 点と線だけなら投影は自前で書けて、出力は 1px の正確な線になる。
 * WebGL の lineWidth が実質 1px 固定でアンチエイリアスも効かない問題を、
 * そもそも踏まない（既存 spec の「THREE.js を使わない」判断の実証）。
 */

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };
/** 視点。z > 0 が画面の手前側。 */
export type Eye = Vec3;

/** 視点距離 ez をステージ幅の何倍に取るか。 */
export const EYE_Z_RATIO = 1.30;

/**
 * 非対称視錐台。視点 eye から点 p へ引いた光線が、スクリーン平面 z=0 と
 * 交わる位置を返す。
 *
 *   t  = ez / (ez − pz)
 *   s  = eye + (p − eye)·t
 *
 * pz = 0 なら t = 1 で p がそのまま返る（スクリーン平面上の点は動かない）。
 * pz → −∞ で t → 0、投影点は視点のスクリーン座標へ収束する（消失点）。
 */
export const projectOffAxis = (p: Vec3, eye: Eye): Vec2 => {
  const t = eye.z / (eye.z - p.z);
  return { x: eye.x + (p.x - eye.x) * t, y: eye.y + (p.y - eye.y) * t };
};

/**
 * 比較用。よくある「パララックス」の実装 ── 深度に比例した平行移動。
 *
 * 割り算が無いので透視短縮が起きず、奥の面は形を変えない（剛体移動）。
 * 動いてはいるが、穴を覗いている感じにはならない。
 * この 1 行の差が「動いている」と「覗いている」を分ける。
 */
export const projectNaive = (p: Vec3, eye: Eye, depthScale = 350): Vec2 => ({
  x: p.x + eye.x * (-p.z / depthScale),
  y: p.y + eye.y * (-p.z / depthScale),
});

/** 覗き込むシャフトの断面の半分の辺長。 */
export const SHAFT_HALF = 96;
/** 断面を置く深度。手前面はスクリーン平面上に置く。 */
export const SHAFT_DEPTHS = [0, -70, -140, -210, -280, -350];

/** 各深度の 4 隅。左上→右上→右下→左下の順（polygon にそのまま流せる）。 */
export const shaftRings = (half: number, depths: number[]): Vec3[][] =>
  depths.map((z) => [
    { x: -half, y: -half, z },
    { x: half, y: -half, z },
    { x: half, y: half, z },
    { x: -half, y: half, z },
  ]);
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test lib/frustum.test.ts
```

Expected: PASS（7 テスト）

- [ ] **Step 5: 全テストと型検査**

```bash
npm test && npx tsc --noEmit
```

Expected: 3 モジュール分すべて PASS、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add lib/frustum.ts lib/frustum.test.ts && git commit -m "feat(parallax): 非対称視錐台の投影と、比較用の平行移動"
```

---

### Task 4: 実験 #11 `stellar-parallax` — 恒星視差

**Files:**
- Create: `components/lab/experiments/stellar-parallax.tsx`
- Modify: `components/lab/registry.ts`

**Interfaces:**
- Consumes: `lib/parallax-astro.ts` の `STARS` / `ARCSEC_PX` / `parallaxOffset` / `ellipseAxes` / `parsecFromArcsec` / `lightYears` / `isMeasurable` / `pixelShift`
- Produces: `export const stellarParallax: Experiment`

**要点:** スクロール量を地球の公転位置そのものにする。区間 1 本 = 1 年。
スクロールを往復させると視差楕円を往復してなぞる。

- [ ] **Step 1: 実験ファイルを書く**

`components/lab/experiments/stellar-parallax.tsx` を新規作成:

```tsx
import React from 'react';
import type { Experiment } from '../../../lib/lab';
import {
  ARCSEC_PX,
  STARS,
  ellipseAxes,
  isMeasurable,
  lightYears,
  parallaxOffset,
  parsecFromArcsec,
  pixelShift,
} from '../../../lib/parallax-astro';

/** 図の中で選んでおく星。地上から測れるうちで 2 番目に近い。 */
const FOCUS = STARS.findIndex((s) => s.name === 'Sirius');
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 遠景の星。視差 0 の基準として置く。決定的に散らす（SSR と一致させるため）。 */
const BACKDROP = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({ length: 150 }, () => ({
    cx: +(rnd() * 620).toFixed(1),
    cy: +(rnd() * 350).toFixed(1),
    r: +(rnd() * 0.9 + 0.25).toFixed(2),
  }));
})();

/**
 * 恒星視差。
 *
 * 見本帳では自動再生＋日付スライダーで作ったが、ラボでは捨てた。
 * **スクロール量を地球の公転位置そのものにする。**
 * 「スクロールしたから何かが動く」ではなく「観測者が動いたから星がずれる」になる。
 * 区間 1 本 = 1 年なので、スクロールを往復させると視差楕円を往復してなぞる。
 * scrub の性質がそのまま意味になる、シリーズで唯一の実験。
 *
 * 図の縮尺は 1" = 90px。実際の見かけの角度に対して極端な誇張で、
 * ESA の Gaia 解説動画も同じく約 1 万倍で描いている。誇張自体を画面に出す。
 *
 * ポラリスとベテルギウスはずれが 1px を切って測れない。
 * これが演出ではなく事実で、地上観測の限界 100 pc がそのまま図に出る。
 */
export const stellarParallax: Experiment = {
  id: 'stellar-parallax',
  title: 'Stellar Parallax',
  tech: ['視差楕円', 'scrub = 公転位相'],
  note: 'スクロールが観測の基線になる。近い星ほど大きな楕円を描き、遠い星は動かない。',
  length: 2.5,

  render: () => {
    const focus = STARS[FOCUS];
    const axes = ellipseAxes(focus.parallax, focus.eclipticLat);
    return (
      <div className="relative w-full max-w-4xl">
        <svg viewBox="0 0 620 350" className="block w-full border border-white/15">
          {/* 視差 0 の遠景。ここが動かないから、近い星の動きが読める。 */}
          <g fill="currentColor" className="text-white/30">
            {BACKDROP.map((s, i) => (
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
            ))}
          </g>

          {/* 黄道。楕円の潰れる向きの基準。 */}
          <path
            d="M0 232 C 150 208, 300 250, 620 196"
            fill="none" stroke="currentColor" strokeWidth={0.8}
            strokeDasharray="5 5" className="text-white/25"
          />
          <text x={10} y={224} fontSize={8.5} letterSpacing={1.6}
                className="fill-white/30 font-mono">ECLIPTIC</text>

          {/* 選んだ星の視差楕円。半軸は ϖ と ϖ·|sin β|。 */}
          <ellipse
            className="sp-ellipse"
            cx={focus.x} cy={focus.y}
            rx={axes.major * ARCSEC_PX} ry={axes.minor * ARCSEC_PX}
            fill="none" stroke="currentColor" strokeWidth={0.9}
            strokeDasharray="3 3" style={{ color: 'rgb(224 82 58)' }}
          />

          {STARS.map((s, i) => {
            // 動きを減らす設定では build() が呼ばれないので、ここで θ=0 の位置を与える。
            // 与えないと 6 星すべてが SVG 原点に重なり、ラベルだけが正しい位置に残る。
            // s.x, s.y に置くだけでは足りない ── θ=0 でも dy = −ϖ·sin β ≠ 0 なので楕円から外れる。
            const o0 = parallaxOffset(s.parallax, s.eclipticLat, 0);
            const x0 = (s.x + o0.dx * ARCSEC_PX).toFixed(2);
            const y0 = (s.y + o0.dy * ARCSEC_PX).toFixed(2);
            return (
            <g key={s.name}>
              <g className="sp-star" data-i={i} transform={`translate(${x0},${y0})`}>
                <circle r={s.mag} className="fill-white" />
                {i === FOCUS && (
                  <circle r={s.mag + 4} fill="none" strokeWidth={1}
                          stroke="currentColor" style={{ color: 'rgb(224 82 58)' }} />
                )}
              </g>
              <text x={s.x + 10} y={s.y - 8} fontSize={9} letterSpacing={0.6}
                    className="fill-white/40 font-mono">{s.name.toUpperCase()}</text>
            </g>
            );
          })}
        </svg>

        {/* 読み値。d = 1/ϖ がその場で走る。 */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-white/40">
          <span>OBS <b className="sp-month font-medium text-white/80">1月</b></span>
          <span>ϖ = <b className="font-medium text-white/80">{focus.parallax.toFixed(4)}″</b></span>
          <span>d = 1/ϖ = <b className="font-medium text-white/80">
            {parsecFromArcsec(focus.parallax).toFixed(2)} pc</b></span>
          <span><b className="font-medium text-white/80">
            {lightYears(parsecFromArcsec(focus.parallax)).toFixed(2)} ly</b></span>
          <span className="text-white/25">1″ = {ARCSEC_PX}px（誇張）</span>
        </div>

        {/* 測れる／測れないを表で出す。地上観測の限界がそのまま出る。 */}
        <table className="mt-4 w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr className="text-white/25">
              {['星', 'ϖ ["]', 'd [pc]', 'd [ly]', '図上のずれ'].map((h, i) => (
                <th key={h} className={`border-b border-white/10 pb-1 font-normal ${i ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STARS.map((s) => {
              const pc = parsecFromArcsec(s.parallax);
              const ok = isMeasurable(s.parallax);
              return (
                <tr key={s.name} className={ok ? 'text-white/55' : 'text-white/25'}>
                  <td className="border-b border-white/5 py-1 text-left">{s.name}</td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">{s.parallax.toFixed(4)}</td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">{pc < 10 ? pc.toFixed(2) : Math.round(pc)}</td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">
                    {lightYears(pc) < 10 ? lightYears(pc).toFixed(2) : Math.round(lightYears(pc))}
                  </td>
                  <td className="border-b border-white/5 py-1 text-right tabular-nums">
                    {ok ? `${pixelShift(s.parallax).toFixed(1)} px` : '< 1 px'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  },

  build: (tl, root) => {
    const stars = root.querySelectorAll<SVGGElement>('.sp-star');
    const month = root.querySelector<HTMLElement>('.sp-month');
    if (stars.length === 0) return;

    // 区間 1 本 = 1 年。theta を 0→2π へ回すだけで、あとは写像に任せる。
    const clock = { theta: 0 };
    tl.to(clock, {
      theta: Math.PI * 2,
      duration: 1,
      ease: 'none',
      onUpdate: () => {
        stars.forEach((g) => {
          const s = STARS[Number(g.dataset.i)];
          const o = parallaxOffset(s.parallax, s.eclipticLat, clock.theta);
          g.setAttribute(
            'transform',
            `translate(${(s.x + o.dx * ARCSEC_PX).toFixed(2)},${(s.y + o.dy * ARCSEC_PX).toFixed(2)})`,
          );
        });
        if (month) {
          const i = Math.floor((clock.theta / (Math.PI * 2)) * 12) % 12;
          month.textContent = MONTHS[(i + 12) % 12];
        }
      },
    });
  },
};
```

- [ ] **Step 2: registry に足す**

`components/lab/registry.ts` の import 群の末尾（`radialBurst` の下）に 1 行:

```ts
import { stellarParallax } from './experiments/stellar-parallax';
```

配列の末尾（`radialBurst,` の下）に 1 行:

```ts
  stellarParallax,
```

- [ ] **Step 3: 型検査とテスト**

```bash
npx tsc --noEmit && npm test
```

Expected: 型エラーなし、既存テストは全 PASS（このタスクは lib を変えないので新規テストは無い）

- [ ] **Step 4: ビルドが通ることを確認する**

```bash
npm run build
```

Expected: 成功。`stellar-parallax` を含むページが生成される

- [ ] **Step 5: 目で確認する**

`npm run dev` を起動して `/#stellar-parallax` を開き、スクロールして確認する:

- スクロールを下げると星が動き、**上げ戻すと同じ経路を逆にたどる**（scrub なので当然だが、これが「観測者が戻った」意味になっているか）
- Proxima が最も大きく動き、Polaris と Betelgeuse は**目で見て動かない**
- 楕円の破線の上を Sirius がなぞる
- 読み値の月が 1月→12月 と進む

**注意:** 既存 spec と同じ制約で、rAF が回らない環境（描画されていないタブ）では観測できない。ここは実際に見て判断するしかない。

- [ ] **Step 6: コミット**

```bash
git add components/lab/experiments/stellar-parallax.tsx components/lab/registry.ts && git commit -m "feat(parallax): 恒星視差。スクロールを公転位相に直結させる（実験 #11）"
```

---

### Task 5: 実験 #12 `depth-stack` — 深度層

**Files:**
- Create: `components/lab/experiments/depth-stack.tsx`
- Modify: `components/lab/registry.ts`

**Interfaces:**
- Consumes: `lib/parallax.ts` の `RIDGE_LAYERS` / `depthCues` / `maxTravel` / `ridgeBox` / `ridgePath`
- Produces: `export const depthStack: Experiment`

**要点:** 手がかりを 1 つずつ外せる。これがこの実験の存在理由。
`build` はタイムラインから行程だけを受け取り、見た目はトグルの現在値と合わせて毎回導出する。

- [ ] **Step 1: 実験ファイルを書く**

`components/lab/experiments/depth-stack.tsx` を新規作成:

```tsx
import React from 'react';
import type { Experiment } from '../../../lib/lab';
import {
  RIDGE_LAYERS,
  depthCues,
  maxTravel,
  ridgeBox,
  ridgePath,
} from '../../../lib/parallax';

const STAGE_H = 420;
const CUES = [
  { key: 'speed', label: '速度差' },
  { key: 'blur', label: 'ぼけ' },
  { key: 'tone', label: '彩度・コントラスト' },
  { key: 'occ', label: '遮蔽' },
] as const;
type CueKey = (typeof CUES)[number]['key'];

/**
 * 深度層。
 *
 * 手がかりを 1 つずつ外せるようにしてあるのが、この実験の全て。
 *
 *   速度差だけ残す → 層が動いているだけで奥に見えない（世の中のパララックスの大半）
 *   遮蔽を切る    → 最も派手に崩れる。手前が奥を隠すことが単眼で最強の手がかり
 *
 * 運動視差は単独では弱い単眼手がかりで、他と足し算して初めて効く。
 * 両眼視差と併用すると 3D 構造の検出閾値が平均 48% 下がるという測定がある
 * （Royal Society, 2016）。それを体で確かめられるようにした。
 *
 * 速度・ぼけ・彩度・スケールは全部 depthCues(z) から導く。
 * 別々に手で調整すると必ずずれる。
 */
export const depthStack: Experiment = {
  id: 'depth-stack',
  title: 'Depth Stack',
  tech: ['大気遠近', '遮蔽', 'depthCues(z)'],
  note: '手がかりを一つずつ外せる。速度差だけ残すと、動いているのに奥に見えなくなる。',
  length: 2.2,

  render: () => (
    <div className="relative w-full max-w-4xl">
      <div
        className="ds-stage relative overflow-hidden border border-white/15"
        style={{ height: STAGE_H, background: 'linear-gradient(#12212e, #05090d)' }}
      >
        {RIDGE_LAYERS.map((L, i) => {
          const box = ridgeBox(L.height);
          return (
            <svg
              key={i}
              className="ds-ridge absolute block"
              data-z={L.z}
              viewBox={box.viewBox}
              preserveAspectRatio="none"
              style={{
                left: '-8%',
                width: '116%',
                height: box.height,
                bottom: box.bottom,
                zIndex: RIDGE_LAYERS.length - i,
                willChange: 'transform',
                transformOrigin: '50% 20%',
                // 奥ほど地の色に寄る。大気遠近の主成分。
                color: `color-mix(in srgb, #dce8f2 ${(88 - L.z * 66).toFixed(0)}%, #12212e)`,
                // 動きを減らす設定では build() が呼ばれず applyCues() も draw() も走らないので、
                // 初期値をここで与えておく。与えないと静止画から大気遠近と遠近の縮尺が抜ける。
                // 行程 0 では移動量が 0 なので、transform は scale だけでよい。
                filter: `blur(${depthCues(L.z).blur.toFixed(2)}px) saturate(${depthCues(L.z).saturate.toFixed(2)}) contrast(${depthCues(L.z).contrast.toFixed(2)})`,
                transform: `scale(${depthCues(L.z).scale})`,
              }}
            >
              <path d={ridgePath(L.phase, L.amp, L.base)} fill="currentColor" />
            </svg>
          );
        })}

        {/* 前景の計器枠。遮蔽の最前面。 */}
        <svg viewBox="0 0 600 300" preserveAspectRatio="none"
             className="pointer-events-none absolute inset-0" style={{ zIndex: 20 }}>
          <rect x={16} y={16} width={568} height={268} fill="none"
                stroke="currentColor" strokeWidth={1} className="text-white/20" />
          {[[300, 16, 300, 40], [300, 260, 300, 284], [16, 150, 40, 150], [560, 150, 584, 150]].map((l, i) => (
            <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]}
                  stroke="currentColor" strokeWidth={1} style={{ color: 'rgb(224 82 58)' }} />
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/25">手がかり</span>
        {CUES.map((c) => (
          <button
            key={c.key}
            type="button"
            data-cue={c.key}
            aria-pressed="true"
            className="ds-cue rounded-sm border border-white/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white/50 transition-colors hover:border-white/40 hover:text-white/80 aria-pressed:border-transparent aria-pressed:bg-white/85 aria-pressed:text-black"
          >
            {c.label}
          </button>
        ))}
        {/* 初期テキストを持たせる。build() を通らない静止画でも読み値が空にならない。 */}
        <span className="ds-read ml-auto font-mono text-[11px] text-white/40">
          progress 0% · 手がかり 4/4 · 層 {RIDGE_LAYERS.length}
        </span>
      </div>
    </div>
  ),

  build: (tl, root) => {
    const ridges = Array.from(root.querySelectorAll<SVGElement>('.ds-ridge'));
    const read = root.querySelector<HTMLElement>('.ds-read');
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.ds-cue'));
    if (ridges.length === 0) return;

    const on: Record<CueKey, boolean> = { speed: true, blur: true, tone: true, occ: true };
    const state = { p: 0 };

    // 移動量は「手前の稜線が奥を追い越さない」上限から取る。
    // ステージ寸法が変わると変わる値なので、数値を手で置かない。
    const near = RIDGE_LAYERS[0];
    const far = RIDGE_LAYERS[RIDGE_LAYERS.length - 1];
    const range = maxTravel(
      near.height, far.height,
      depthCues(near.z).speed, depthCues(far.z).speed,
    );

    /**
     * ぼけ・彩度・不透明度・合成モードは、トグルを押したときしか変わらない。
     * 毎フレーム書くとスクロールのたびに合成が走るので、ここに分けてある
     * （毎フレーム触ってよいのは transform と opacity だけ、という制約に従う）。
     */
    const applyCues = () => {
      for (const el of ridges) {
        const z = Number(el.dataset.z);
        const c = depthCues(z);
        const blur = on.blur ? c.blur : 0;
        const sat = on.tone ? c.saturate : 1;
        const con = on.tone ? c.contrast : 1;
        el.style.filter = `blur(${blur.toFixed(2)}px) saturate(${sat.toFixed(2)}) contrast(${con.toFixed(2)})`;
        // 遮蔽を切ると層が透ける。単眼で最強の手がかりが抜けたときの崩れ方を見せる。
        el.style.opacity = on.occ ? '1' : z === 0 ? '0.55' : '0.45';
        el.style.mixBlendMode = on.occ ? 'normal' : 'screen';
      }
    };

    /** 毎フレーム。transform だけを書く。 */
    const draw = () => {
      for (const el of ridges) {
        const z = Number(el.dataset.z);
        const c = depthCues(z);
        const speed = on.speed ? c.speed : 1;
        el.style.transform =
          `translate3d(0,${(-state.p * range * speed).toFixed(2)}px,0) scale(${c.scale})`;
      }
      if (read) {
        const n = CUES.filter((c) => on[c.key]).length;
        read.textContent = `progress ${(state.p * 100).toFixed(0)}% · 手がかり ${n}/4 · 層 ${ridges.length}`;
      }
    };

    const onClick = (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement;
      const k = b.dataset.cue as CueKey;
      on[k] = !on[k];
      b.setAttribute('aria-pressed', String(on[k]));
      applyCues();
      draw();
    };
    for (const b of buttons) b.addEventListener('click', onClick);

    tl.to(state, { p: 1, duration: 1, ease: 'none', onUpdate: draw });
    applyCues();
    draw();

    return () => {
      for (const b of buttons) b.removeEventListener('click', onClick);
    };
  },
};
```

- [ ] **Step 2: registry に足す**

import に 1 行、配列の `stellarParallax,` の下に 1 行:

```ts
import { depthStack } from './experiments/depth-stack';
```
```ts
  depthStack,
```

- [ ] **Step 3: 型検査・テスト・ビルド**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: すべて成功

- [ ] **Step 4: 目で確認する**

`/#depth-stack` を開いて:

- **「速度差」以外を全部切る** → 層が動いているだけで奥行きが消えることを確認する。これが確認できなければこの実験は失敗
- **「遮蔽」だけ切る** → 最も派手に崩れることを確認する
- スクロールの端から端まで動かして、**手前の稜線が奥の稜線を追い越さない**ことを確認する（追い越したら `maxTravel` の `safety` を下げる）
- 層を上へ動かしたとき、**ステージ下端に隙間が空かない**ことを確認する（空いたら `ridgeBox` が効いていない）

- [ ] **Step 5: コミット**

```bash
git add components/lab/experiments/depth-stack.tsx components/lab/registry.ts && git commit -m "feat(parallax): 深度層。手がかりを一つずつ外せるようにする（実験 #12）"
```

---

### Task 6: 実験 #13 `off-axis-window` — 覗き窓

**Files:**
- Create: `components/lab/experiments/off-axis-window.tsx`
- Modify: `components/lab/registry.ts`

**Interfaces:**
- Consumes: `lib/frustum.ts` の `EYE_Z_RATIO` / `SHAFT_DEPTHS` / `SHAFT_HALF` / `projectNaive` / `projectOffAxis` / `shaftRings` / `type Eye`
- Produces: `export const offAxisWindow: Experiment`

**要点:** `pin: false` + `Component`。ポインタ駆動なので scrub されたタイムラインからは取れない。
**reduced-motion 対応を自前で書く**（`LabSection` は `pin: false` の実験を守らない）。

- [ ] **Step 1: 実験ファイルを書く**

`components/lab/experiments/off-axis-window.tsx` を新規作成:

```tsx
"use client";
import React, { useEffect, useRef, useState } from 'react';
import type { Experiment } from '../../../lib/lab';
import {
  EYE_Z_RATIO,
  SHAFT_DEPTHS,
  SHAFT_HALF,
  projectNaive,
  projectOffAxis,
  shaftRings,
  type Eye,
  type Vec2,
} from '../../../lib/frustum';

const VIEW = 320;
const CENTRE = VIEW / 2;
const EYE_Z = VIEW * EYE_Z_RATIO;
const RINGS = shaftRings(SHAFT_HALF, SHAFT_DEPTHS);
const GNOMON_Z = -175;
const GNOMON_R = 34;

type Project = (p: { x: number; y: number; z: number }, eye: Eye) => Vec2;
type PanelRefs = {
  polys: SVGPolygonElement[];
  edges: SVGLineElement[];
  gnomon: SVGLineElement[];
  project: Project;
};

const pts = (ps: Vec2[]) =>
  ps.map((p) => `${(CENTRE + p.x).toFixed(1)},${(CENTRE + p.y).toFixed(1)}`).join(' ');

/** 視点が正面にある静止ポーズ。 */
const REST_EYE: Eye = { x: 0, y: 0, z: EYE_Z };

/**
 * 静止ポーズの幾何を先に計算しておく。
 *
 * ポリゴンの points を rAF の中でしか書かないと、**最初のフレームが来るまで図形が存在しない**。
 * SSR が返す HTML にも入らないし、バックグラウンドタブでは rAF が止まるので空のまま残る。
 * 枠とラベルだけが出て中身が無い、という絵になる。
 *
 * このリポジトリは同じ穴を一度踏んで直している（radial-burst の「図版パスの事前計算」）。
 * 定数だけの純粋計算なので SSR でも安全。
 */
const restGeometry = (project: Project) => {
  const rings = RINGS.map((ring) => ring.map((v) => project(v, REST_EYE)));
  const last = rings[rings.length - 1];
  const seg = (a: Vec2, b: Vec2) => ({
    x1: (CENTRE + a.x).toFixed(1), y1: (CENTRE + a.y).toFixed(1),
    x2: (CENTRE + b.x).toFixed(1), y2: (CENTRE + b.y).toFixed(1),
  });
  const h = [{ x: -GNOMON_R, y: 0, z: GNOMON_Z }, { x: GNOMON_R, y: 0, z: GNOMON_Z }]
    .map((v) => project(v, REST_EYE));
  const v = [{ x: 0, y: -GNOMON_R, z: GNOMON_Z }, { x: 0, y: GNOMON_R, z: GNOMON_Z }]
    .map((q) => project(q, REST_EYE));
  return {
    polys: rings.map(pts),
    edges: [0, 1, 2, 3].map((i) => seg(rings[0][i], last[i])),
    gnomon: [seg(h[0], h[1]), seg(v[0], v[1])],
  };
};

/** 片側のパネル。投影関数だけが違う。 */
function Panel({
  label, hot, project, refs,
}: {
  label: string;
  hot?: boolean;
  project: Project;
  refs: React.MutableRefObject<PanelRefs | null>;
}) {
  const root = useRef<SVGSVGElement | null>(null);
  // 静止ポーズ。render が返す HTML にそのまま乗るので、最初のフレーム前でも図形が出る。
  const rest = restGeometry(project);
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    refs.current = {
      polys: Array.from(svg.querySelectorAll<SVGPolygonElement>('polygon')),
      edges: Array.from(svg.querySelectorAll<SVGLineElement>('line.edge')),
      gnomon: Array.from(svg.querySelectorAll<SVGLineElement>('line.gnomon')),
      project,
    };
  }, [project, refs]);

  return (
    <div className="relative flex-1">
      <span
        className={`absolute left-2.5 top-2 z-10 border border-white/10 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${hot ? 'text-[rgb(224,82,58)]' : 'text-white/30'}`}
      >
        {label}
      </span>
      <svg ref={root} viewBox={`0 0 ${VIEW} ${VIEW}`} className="block w-full">
        {RINGS.map((_, i) => (
          <polygon
            key={i}
            points={rest.polys[i]}
            fill="none"
            strokeWidth={i === 0 ? 1.4 : 1}
            stroke="currentColor"
            style={i === 0 ? { color: 'rgb(224 82 58)' } : undefined}
            className={i === 0 ? undefined : 'text-white/25'}
            opacity={i === 0 ? 1 : 1 - i * 0.11}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <line key={i} {...rest.edges[i]}
                className="edge text-white/15" stroke="currentColor" strokeWidth={0.7} />
        ))}
        {[0, 1].map((i) => (
          <line key={i} {...rest.gnomon[i]}
                className="gnomon" stroke="currentColor" strokeWidth={1.2}
                style={{ color: 'rgb(224 82 58)' }} />
        ))}
      </svg>
    </div>
  );
}

/**
 * 覗き窓。
 *
 * A は層を深度に比例して平行移動しているだけ。奥の面は形を変えない。
 * B は視点位置からスクリーン平面へ光線を張り直しているので、奥の壁がせん断して
 * 手前の枠に隠れる ── 遮蔽と透視が同時に成立する。
 * 同じ立体・同じ視点入力で、違うのは投影だけ。
 *
 * 数学は光線とスクリーン平面の交点を取るだけで、これが Kooima の
 * generalized perspective projection と同じもの。行列を組まなくても 3 行で足りる。
 *
 * 点と線だけなら投影は自前で書けて、出力は 1px の正確な線になる。
 * WebGL の lineWidth がほぼ 1px 固定でアンチエイリアスも効かない問題を、そもそも踏まない。
 * 「THREE.js を使わない」という既存の判断が、奥行きを諦める理由にならないことの実証。
 *
 * 視点入力をポインタから webcam の頭部位置（MediaPipe Face Mesh）に差し替えると
 * 画面が本当に壁の穴になる。投影側のコードは一切変わらない。
 */
function OffAxisWindow() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const a = useRef<PanelRefs | null>(null);
  const b = useRef<PanelRefs | null>(null);
  const [auto, setAuto] = useState(true);
  // 動きを減らす設定を state でも持つ。ボタンの表示に使う。
  // matchMedia は SSR で触れないので、初期値は false にして mount 後に同期する。
  const [reduced, setReduced] = useState(false);
  const eye = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const readout = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** 実際に首が振れているか。ボタンはこれを表示する。 */
  const sweeping = auto && !reduced;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    // pin:false なので LabSection の reduced-motion 対応が効かない。自前で見る。
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let t0 = 0;
    let alive = true;

    const drawPanel = (p: PanelRefs | null, e: Eye) => {
      if (!p) return;
      const projected = RINGS.map((ring) => ring.map((v) => p.project(v, e)));
      p.polys.forEach((poly, i) => poly.setAttribute('points', pts(projected[i])));
      p.edges.forEach((line, i) => {
        const f = projected[0][i], k = projected[projected.length - 1][i];
        line.setAttribute('x1', String(CENTRE + f.x)); line.setAttribute('y1', String(CENTRE + f.y));
        line.setAttribute('x2', String(CENTRE + k.x)); line.setAttribute('y2', String(CENTRE + k.y));
      });
      const h = [{ x: -GNOMON_R, y: 0, z: GNOMON_Z }, { x: GNOMON_R, y: 0, z: GNOMON_Z }].map((v) => p.project(v, e));
      const v2 = [{ x: 0, y: -GNOMON_R, z: GNOMON_Z }, { x: 0, y: GNOMON_R, z: GNOMON_Z }].map((v) => p.project(v, e));
      const set = (line: SVGLineElement, s: Vec2, t: Vec2) => {
        line.setAttribute('x1', String(CENTRE + s.x)); line.setAttribute('y1', String(CENTRE + s.y));
        line.setAttribute('x2', String(CENTRE + t.x)); line.setAttribute('y2', String(CENTRE + t.y));
      };
      set(p.gnomon[0], h[0], h[1]);
      set(p.gnomon[1], v2[0], v2[1]);
    };

    const frame = (now: number) => {
      if (!alive) return;
      if (!t0) t0 = now;
      // 動きを減らす設定では、自動の首振りだけ止める。
      // ポインタへの応答は本人の操作なので残す（WCAG 2.3.3 はインタラクション由来の
      // アニメーションを「無効化できること」を求めるもので、操作そのものは禁じない）。
      if (auto && !reduce.matches) {
        const t = (now - t0) / 1000;
        eye.current.tx = Math.sin(t * 0.72) * 82;
        eye.current.ty = Math.sin(t * 0.47) * 42;
      }
      eye.current.x += (eye.current.tx - eye.current.x) * 0.1;
      eye.current.y += (eye.current.ty - eye.current.y) * 0.1;
      const e: Eye = { x: eye.current.x, y: eye.current.y, z: EYE_Z };
      drawPanel(a.current, e);
      drawPanel(b.current, e);
      if (readout.current) {
        readout.current.textContent = `eye = (${e.x.toFixed(0)}, ${e.y.toFixed(0)}, ${EYE_Z.toFixed(0)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onMove = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setAuto(false);
      eye.current.tx = ((ev.clientX - r.left) / r.width - 0.5) * 190;
      eye.current.ty = ((ev.clientY - r.top) / r.height - 0.5) * 120;
    };
    const onLeave = () => { eye.current.tx = 0; eye.current.ty = 0; };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [auto]);

  return (
    <div className="w-full max-w-4xl">
      <div ref={wrap} className="flex gap-px border border-white/15 bg-white/15">
        <Panel label="A ／ 平行移動（よくある実装）"
               project={(p, e) => projectNaive(p, e)} refs={a} />
        <Panel label="B ／ 非対称視錐台（正しい投影）" hot
               project={projectOffAxis} refs={b} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-white/40">
        {/*
          aria-pressed は auto ではなく sweeping（実際に効いている状態）を指す。
          auto を直に出すと、動きを減らす設定のユーザーに対して
          「構造的に起動しえない機能」をオンと表示し続けることになる。
          そのうえで、押しても何も起きないボタンは無効にする。
        */}
        <button
          type="button"
          onClick={() => setAuto((v) => !v)}
          aria-pressed={sweeping}
          disabled={reduced}
          title={reduced ? '動きを減らす設定のため停止中' : undefined}
          className="rounded-sm border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors hover:border-white/40 hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/20 aria-pressed:border-transparent aria-pressed:bg-white/85 aria-pressed:text-black"
        >
          自動で首を振る
        </button>
        <span ref={readout} />
        <span className="text-white/25">同じ立体・同じ視点入力。違うのは投影だけ</span>
      </div>
    </div>
  );
}

export const offAxisWindow: Experiment = {
  id: 'off-axis-window',
  title: 'Off-axis Window',
  tech: ['非対称視錐台', 'SVG 自前投影'],
  note: '平行移動と正しい投影を並置する。奥の壁がせん断して初めて、穴を覗いている感じになる。',
  pin: false,
  Component: OffAxisWindow,
};
```

- [ ] **Step 2: registry に足す**

```ts
import { offAxisWindow } from './experiments/off-axis-window';
```
```ts
  offAxisWindow,
```

- [ ] **Step 3: 型検査・テスト・ビルド**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: すべて成功

- [ ] **Step 4: 目で確認する**

`/#off-axis-window` を開いて:

- パネルの上でポインタを動かす。**A は奥の四角が形を変えずに滑るだけ、B は奥の壁がせん断して手前の枠に隠れる**
- B だけが「穴を覗いている」感じになることを確認する。ならなければこの実験は失敗
- OS の「視差効果を減らす」を有効にして再読み込みし、**自動の首振りが止まり、ポインタには反応し続ける**ことを確認する

- [ ] **Step 5: コミット**

```bash
git add components/lab/experiments/off-axis-window.tsx components/lab/registry.ts && git commit -m "feat(parallax): 覗き窓。平行移動と非対称視錐台を並置する（実験 #13）"
```

---

### Task 7: 実験 #14 `velocity-parallax` — 速度視差

**Files:**
- Create: `components/lab/experiments/velocity-parallax.tsx`
- Modify: `components/lab/registry.ts`

**Interfaces:**
- Consumes: `lib/parallax.ts` の `stepSpring` / `velocitySkew` / `type Spring`、`lib/gsap-config.ts` の `ScrollTrigger`
- Produces: `export const velocityParallax: Experiment`

**要点:** `pin: false` + `Component`。自前で `ScrollTrigger` を張って `getVelocity()` を読む。
**reduced-motion では速度エフェクトごと殺す**（#13 と違い、これは操作ではなく副作用なので残さない）。

- [ ] **Step 1: 実験ファイルを書く**

`components/lab/experiments/velocity-parallax.tsx` を新規作成:

```tsx
"use client";
import React, { useEffect, useRef } from 'react';
import { ScrollTrigger } from '../../../lib/gsap-config';
import type { Experiment } from '../../../lib/lab';
import { stepSpring, velocitySkew, type Spring } from '../../../lib/parallax';

const WORDS = [
  { text: 'SURFACE', z: 0.00, size: 62, top: 40 },
  { text: 'MIDDLE',  z: 0.34, size: 50, top: 132 },
  { text: 'DEEP',    z: 0.67, size: 40, top: 216 },
  { text: 'FLOOR',   z: 1.00, size: 30, top: 288 },
];
const TRAVEL = 210;

/**
 * 速度視差。
 *
 * 深度を位置のずれではなく**追従の遅れ**で表現する。
 * 層ごとに剛性の違うばねを持たせ、奥ほど柔らかくする（臨界減衰）。
 * スクロールを止めても、奥の層はまだ沈み続けている。
 *
 * スクロール速度そのものを可視化しているので、**止まっている状態では視差が完全に消える**。
 * これは欠点ではなく利点で、読んでいる最中は画面が静止する。
 *
 * 画像素材が一切なくてもタイポグラフィだけで成立するので、
 * 写真を持たない編集系・テキスト主体のサイトで唯一使えるパララックスでもある。
 *
 * skew のクランプを固定値にすると、常用域（実測 2,000〜8,600 px/s）で
 * 全層が上限に張り付いて深度差がちょうど消える。上限自体を深度依存にしてある
 * （lib/parallax.ts の velocitySkew を参照）。
 */
function VelocityParallax() {
  const stage = useRef<HTMLDivElement | null>(null);
  const read = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;

    // pin:false なので自前で見る。これは操作ではなく副作用なので、
    // 動きを減らす設定では速度エフェクトごと殺す（#13 と扱いが違う）。
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nodes = Array.from(el.querySelectorAll<HTMLElement>('.vp-word'));
    const springs: Spring[] = nodes.map(() => ({ y: 0, v: 0 }));
    const skews = nodes.map(() => 0);
    let velocity = 0;
    let progress = 0;
    let raf = 0;
    let prev = 0;
    let alive = true;

    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        progress = self.progress;
        velocity = self.getVelocity();
      },
    });

    const frame = (now: number) => {
      if (!alive) return;
      const dt = prev ? Math.min((now - prev) / 1000, 0.05) : 0.016;
      prev = now;
      // スクロールが止まると ScrollTrigger は onUpdate を呼ばなくなるので、
      // 速度は自前で減衰させる。放置すると最後の値が残り続ける。
      velocity *= 0.86;

      let maxLag = 0;
      nodes.forEach((node, i) => {
        const z = WORDS[i].z;
        const target = -progress * TRAVEL * (1 - 0.55 * z);
        springs[i] = stepSpring(springs[i], target, z, dt);
        const want = velocitySkew(velocity, z);
        skews[i] += (want - skews[i]) * 0.16;
        node.style.transform =
          `translate3d(0,${springs[i].y.toFixed(2)}px,0) skewY(${skews[i].toFixed(2)}deg)`;
        maxLag = Math.max(maxLag, Math.abs(target - springs[i].y));
      });
      if (read.current) {
        read.current.textContent =
          `velocity ${velocity.toFixed(0)} px/s · 最大遅れ ${maxLag.toFixed(1)} px`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      st.kill();
    };
  }, []);

  return (
    <div className="w-full max-w-4xl">
      <div
        ref={stage}
        className="relative overflow-hidden border border-white/15"
        style={{ height: 380 }}
      >
        {WORDS.map((w) => (
          <div
            key={w.text}
            className="vp-word absolute left-0 w-full whitespace-nowrap text-center leading-none"
            style={{
              top: w.top,
              fontSize: w.size,
              willChange: 'transform',
              color: w.z === 0 ? 'rgb(224 82 58)' : `color-mix(in srgb, #dce8f2 ${(100 - w.z * 55).toFixed(0)}%, #12212e)`,
            }}
          >
            {w.text}
          </div>
        ))}
        {/* 深度の目盛り。層が動いても、これは動かない。 */}
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 9 }}>
          {WORDS.map((w) => (
            <React.Fragment key={w.text}>
              <div className="absolute inset-x-0 h-px bg-white/10" style={{ top: w.top + w.size * 0.62 }} />
              <div className="absolute left-2.5 font-mono text-[9px] tracking-[0.14em] text-white/25"
                   style={{ top: w.top + w.size * 0.62 + 3 }}>
                z {w.z.toFixed(2)}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[11px] text-white/40">
        {/*
          初期テキストを持たせる。動きを減らす設定では effect ごと早期 return するので、
          ここで与えないと読み値が恒久的に空欄になる。
          静止時（速度 0・遅れ 0）の値そのものなので、意味も合う。
        */}
        <span ref={read}>velocity 0 px/s · 最大遅れ 0.0 px</span>
        <span className="text-white/25">勢いよくスクロールして、止めてみる</span>
      </div>
    </div>
  );
}

export const velocityParallax: Experiment = {
  id: 'velocity-parallax',
  title: 'Velocity Parallax',
  tech: ['臨界減衰ばね', 'getVelocity()'],
  note: '位置ではなく遅れで深度を出す。止まると視差が完全に消えるので、読んでいる間は静止する。',
  pin: false,
  Component: VelocityParallax,
};
```

- [ ] **Step 2: registry に足す**

```ts
import { velocityParallax } from './experiments/velocity-parallax';
```
```ts
  velocityParallax,
```

- [ ] **Step 3: 型検査・テスト・ビルド**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: すべて成功

- [ ] **Step 4: 目で確認する**

`/#velocity-parallax` を開いて:

- **勢いよくスクロールして止める。** 奥の層がまだ沈み続けていることを確認する
- **止まった状態で視差が完全に消える**ことを確認する（これが利点）
- 速い／遅いの両方で、**4 層の歪みの量が違う**ことを確認する。全部同じに見えたら `velocitySkew` の上限が固定になっている
- OS の「視差効果を減らす」を有効にして再読み込みし、**何も動かない**ことを確認する

- [ ] **Step 5: コミット**

```bash
git add components/lab/experiments/velocity-parallax.tsx components/lab/registry.ts && git commit -m "feat(parallax): 速度視差。位置ではなく遅れで深度を出す（実験 #14）"
```

---

### Task 8: 実験 #15 `rangefinder` — 測距儀（統合）

**Files:**
- Create: `components/lab/experiments/rangefinder.tsx`
- Modify: `components/lab/registry.ts`

**Interfaces:**
- Consumes:
  - `lib/parallax.ts` の `RIDGE_LAYERS` / `depthCues` / `ridgeBox` / `ridgePath` / `stepSpring` / `type Spring`
  - `lib/frustum.ts` の `EYE_Z_RATIO` / `projectOffAxis`
- Produces: `export const rangefinder: Experiment`

**要点:** 四つの融合であって並置ではない。**#11 と同じ式 `d = B/θ` を、基線長を変えて使う。**
`d[pc] = 1/ϖ` はその特殊形にすぎない ── シリーズの最初と最後が同じ 1 本の式で閉じる。

- [ ] **Step 1: 実験ファイルを書く**

`components/lab/experiments/rangefinder.tsx` を新規作成:

```tsx
import React from 'react';
import { EYE_Z_RATIO, projectOffAxis } from '../../../lib/frustum';
import type { Experiment } from '../../../lib/lab';
import {
  RIDGE_LAYERS,
  depthCues,
  ridgeBox,
  ridgePath,
  stepSpring,
  type Spring,
} from '../../../lib/parallax';

const STAGE_W = 600;
const STAGE_H = 420;
const EYE_Z = STAGE_W * EYE_Z_RATIO;
/** 基線長。観測者がこの幅だけ横へ移動する。d = B/θ の B。 */
const BASELINE = STAGE_W;
/** 標的の実際の深度。読み値の答え合わせ用（画面には出さない）。 */
const TARGET_Z = -430;

/**
 * 行程 0 の時点の標的位置。
 * 動きを減らす設定では build() が呼ばれないので、これを render() 側で与えないと
 * 標的が SVG 原点に張り付いた静止画になる（#11 で踏んだのと同じ穴）。
 */
const TARGET_AT_START = projectOffAxis(
  { x: 0, y: 0, z: TARGET_Z },
  { x: (0 - 0.5) * BASELINE, y: 0, z: EYE_Z },
);

/** 層の深度。z ∈ [0,1] を実際の奥行きへ写す。draw() と render() で同じ式を使う。 */
const layerDepth = (z: number) => -60 - z * 420;

/**
 * 行程 0 の時点の層の横位置。ばねは y=0 から始まるが、目標はここ。
 * render() 側にも同じ値を置いておかないと、動きを減らす設定で
 * 「観測者が基線の中央に居る」別の絵になり、遠近の縮尺も抜ける。
 */
const ridgeXAtStart = (z: number) =>
  projectOffAxis(
    { x: 0, y: 0, z: layerDepth(z) },
    { x: (0 - 0.5) * BASELINE, y: 0, z: EYE_Z },
  ).x;

/**
 * 測距儀。四つの技法の融合であって、並置ではない。
 *
 * スクロールで観測者が基線上を移動する。すると 4 つが順に効く:
 *
 *   1. 4 層のシーンが非対称視錐台で張り直される（#13）── 平行移動ではなく本物のせん断
 *   2. 各層が深度ごとのばねで遅れて追従する（#14）── 動きに質量が出る
 *   3. 層が大気遠近を持つ（#12）── せん断が奥行きとして読める
 *   4. レチクルが標的のずれ角を読み、基線長から距離を算出する（#11）
 *
 * 4 が入ることで、他の 3 つが「距離を測るために必要な仕組み」になる。
 * 装飾を 4 つ重ねたのではなく、1 台の機械の部品として全部が要る。
 *
 * **#11 と同じ式を使う。** どちらも d = B/θ:
 *   #11 恒星視差 → B = 1 AU, θ = ϖ["] なので d[pc] = 1/ϖ
 *   #15 測距儀   → B = 基線長,  θ = 標的のずれ角
 * d = 1/ϖ は d = B/θ の特殊形にすぎない。シリーズの最初と最後が同じ式で閉じる。
 *
 * 実際の光学測距儀（合致式）も、固定基線の両端から見た像のずれで距離を出す機械。
 */
export const rangefinder: Experiment = {
  id: 'rangefinder',
  title: 'Rangefinder',
  tech: ['視錐台 + 大気遠近 + ばね', 'd = B/θ'],
  note: '四つが合わさって一台の機械になる。基線を移動し、ずれ角から距離を算出する。',
  length: 3.5,
  fade: false,

  render: () => (
    <div className="relative w-full max-w-4xl">
      <div
        className="rf-stage relative overflow-hidden border border-white/15"
        style={{ height: STAGE_H, background: 'linear-gradient(#12212e, #05090d)' }}
      >
        {RIDGE_LAYERS.map((L, i) => {
          const box = ridgeBox(L.height);
          return (
            <svg
              key={i}
              className="rf-ridge absolute block"
              data-z={L.z}
              viewBox={box.viewBox}
              preserveAspectRatio="none"
              style={{
                left: '-14%', width: '128%',
                height: box.height, bottom: box.bottom,
                zIndex: RIDGE_LAYERS.length - i,
                willChange: 'transform', transformOrigin: '50% 20%',
                color: `color-mix(in srgb, #dce8f2 ${(88 - L.z * 66).toFixed(0)}%, #12212e)`,
                filter: `blur(${depthCues(L.z).blur.toFixed(2)}px) saturate(${depthCues(L.z).saturate.toFixed(2)}) contrast(${depthCues(L.z).contrast.toFixed(2)})`,
                // 行程 0 の位置と縮尺。build() を通らない静止画のための初期値。
                transform: `translate3d(${ridgeXAtStart(L.z).toFixed(2)}px,0,0) scale(${depthCues(L.z).scale})`,
              }}
            >
              <path d={ridgePath(L.phase, L.amp, L.base)} fill="currentColor" />
            </svg>
          );
        })}

        {/* 標的。奥に浮かぶ十字。これのずれ角を測る。 */}
        <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none"
             className="pointer-events-none absolute inset-0" style={{ zIndex: 15 }}>
          <g
            className="rf-target"
            transform={`translate(${(STAGE_W / 2 + TARGET_AT_START.x).toFixed(2)},${STAGE_H / 2})`}
            style={{ color: 'rgb(224 82 58)' }}
          >
            <line x1={-16} y1={0} x2={16} y2={0} stroke="currentColor" strokeWidth={1.4} />
            <line x1={0} y1={-16} x2={0} y2={16} stroke="currentColor" strokeWidth={1.4} />
            <circle r={22} fill="none" stroke="currentColor" strokeWidth={0.7} opacity={0.6} />
          </g>
        </svg>

        {/* レチクル。標的が動いても、これは動かない。ずれ角はこの中心からの距離。 */}
        <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none"
             className="pointer-events-none absolute inset-0" style={{ zIndex: 20 }}>
          <rect x={16} y={16} width={STAGE_W - 32} height={STAGE_H - 32}
                fill="none" stroke="currentColor" strokeWidth={1} className="text-white/20" />
          <line x1={STAGE_W / 2} y1={16} x2={STAGE_W / 2} y2={STAGE_H - 16}
                stroke="currentColor" strokeWidth={0.5} className="text-white/15" />
          <line x1={16} y1={STAGE_H / 2} x2={STAGE_W - 16} y2={STAGE_H / 2}
                stroke="currentColor" strokeWidth={0.5} className="text-white/15" />
          {Array.from({ length: 21 }, (_, i) => {
            const x = STAGE_W / 2 + (i - 10) * 22;
            const major = (i - 10) % 5 === 0;
            return (
              <line key={i} x1={x} y1={STAGE_H / 2 - (major ? 10 : 5)}
                    x2={x} y2={STAGE_H / 2 + (major ? 10 : 5)}
                    stroke="currentColor" strokeWidth={0.7} className="text-white/25" />
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-white/40">
        <span>基線 B = <b className="rf-b font-medium text-white/80">0</b> / {BASELINE}</span>
        <span>ずれ角 θ = <b className="rf-theta font-medium text-white/80">0.000</b></span>
        <span>d = B/θ = <b className="rf-d font-medium" style={{ color: 'rgb(224 82 58)' }}>—</b></span>
        <span className="text-white/25">#11 と同じ式。d[pc] = 1/ϖ はこの B = 1 AU の場合</span>
      </div>
    </div>
  ),

  build: (tl, root) => {
    const ridges = Array.from(root.querySelectorAll<SVGElement>('.rf-ridge'));
    const target = root.querySelector<SVGGElement>('.rf-target');
    const readB = root.querySelector<HTMLElement>('.rf-b');
    const readT = root.querySelector<HTMLElement>('.rf-theta');
    const readD = root.querySelector<HTMLElement>('.rf-d');
    if (ridges.length === 0 || !target) return;

    // ばねの初期位置は render() が置いた行程 0 の位置に合わせる。
    // 0 から始めると、最初のフレームで静止画の位置から大きく飛ぶ。
    const springs: Spring[] = ridges.map((el) => ({
      y: ridgeXAtStart(Number(el.dataset.z)),
      v: 0,
    }));
    const state = { p: 0 };

    const draw = (dt: number) => {
      // 行程の 0→1 で、観測者が基線の左端から右端へ移動する。
      const eyeX = (state.p - 0.5) * BASELINE;

      ridges.forEach((el, i) => {
        const z = Number(el.dataset.z);
        // 層を「奥にある平面」として視錐台で張り直す。
        // 平行移動と違い、視点が寄った側の壁がせん断して手前に隠れる。
        const depth = layerDepth(z);
        const s = projectOffAxis({ x: 0, y: 0, z: depth }, { x: eyeX, y: 0, z: EYE_Z });
        // ばねで遅れて追従させる。深度ごとに剛性が違うので、動きに質量が出る。
        springs[i] = stepSpring(springs[i], s.x, z, dt);
        el.style.transform =
          `translate3d(${springs[i].y.toFixed(2)}px,0,0) scale(${depthCues(z).scale})`;
      });

      // 標的のずれ角。レチクル中心からの角度で測る。
      const t = projectOffAxis(
        { x: 0, y: 0, z: TARGET_Z },
        { x: eyeX, y: 0, z: EYE_Z },
      );
      target.setAttribute('transform', `translate(${(STAGE_W / 2 + t.x).toFixed(2)},${STAGE_H / 2})`);

      const b = Math.abs(eyeX * 2);
      const theta = Math.abs(t.x);
      if (readB) readB.textContent = b.toFixed(0);
      if (readT) readT.textContent = theta.toFixed(3);
      // d = B/θ。基線が伸びるほど読みが安定する（測距儀そのものの性質）。
      if (readD) readD.textContent = theta > 0.5 ? `${(b / theta).toFixed(1)}` : '—';
    };

    // タイムラインは目標（state.p）を動かすだけ。積分は rAF が持つ。
    //
    // ばねを onUpdate の中で積分してはいけない。scrub された onUpdate は
    // **スクロールが止まると呼ばれなくなる**ので、ばねが収束せず途中で凍る。
    // 「止めても奥の層はまだ沈んでいる」という #14 の売りが、ここで逆に壊れる。
    // #14 を pin:false + Component にしたのと同じ理由が、build の中でも効く。
    tl.to(state, { p: 1, duration: 1, ease: 'none' });

    let raf = 0;
    let prev = 0;
    let alive = true;
    const frame = (now: number) => {
      if (!alive) return;
      const dt = prev ? Math.min((now - prev) / 1000, 0.05) : 0.016;
      prev = now;
      draw(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  },
};
```

**注意:** `LabSection` は reduced-motion のとき `build()` をそもそも呼ばないので、
この rAF ループは動きを減らす設定では起動しない。#13 #14 のような自前の対応は要らない。

- [ ] **Step 2: registry に足す**

```ts
import { rangefinder } from './experiments/rangefinder';
```
```ts
  rangefinder,
```

- [ ] **Step 3: 型検査・テスト・ビルド**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: すべて成功

- [ ] **Step 4: 目で確認する**

`/#rangefinder` を開いて:

- スクロールで**層がせん断する**（平行移動ではない）ことを確認する。#12 と並べて見比べる
- 層の動きに**遅れ（質量）**があることを確認する
- **スクロールを途中で止めて、層がその場で凍らずに落ち着くまで動き続ける**ことを確認する。
  凍るなら、ばねが rAF ではなくタイムラインの `onUpdate` で回っている
- 標的がレチクル中心を横切り、**`d = B/θ` の読みが基線の伸びとともに安定する**ことを確認する
- **`d` の読みが暴れ続けるようなら `TARGET_Z` を調整する。** θ が 0 付近で発散するのは式どおりで、`θ > 0.5` のガードがそれを抑えている
- `fade: false` にしてあるので、区間の終わりで**絵が保持される**ことを確認する（測り終わった状態を残す）

- [ ] **Step 5: ダイヤルの弧を確認する**

実験が 15 個になった。既存 spec の積み残しにある「実験が 10 個を超えるとダイヤルの弧が細くなりすぎて押しにくくなる」が、ここで顕在化する可能性がある。

`components/lab/IndexDial.tsx` の表示を確認し、**15 本の弧が押せるかどうかを実際に触って判断する**。

- 押せる → 何もしない。既存 spec の積み残しに「15 個で確認したが問題なかった」と追記する
- 押しにくい → **このタスクでは直さない。** 別途設計が要る。積み残しに「15 個で顕在化した」と記録して次に回す

- [ ] **Step 6: コミット**

```bash
git add components/lab/experiments/rangefinder.tsx components/lab/registry.ts && git commit -m "feat(parallax): 測距儀。四つの技法を一台の機械に融合する（実験 #15）"
```

- [ ] **Step 7: spec に実装後の実測を追記してコミット**

`docs/superpowers/specs/2026-08-29-parallax-series-design.md` の末尾に「## 実装後」節を足し、次を記録する:

- 各実験で実際に採った `maxTravel` の値（設計時の 110 / 90 とどう違ったか）
- `#15` の `TARGET_Z` の最終値と、`d = B/θ` の読みが安定する基線長
- 目視でしか判断できなかった項目（どれを実際に見て、どれを見ていないか）
- ダイヤルの弧の判断結果
- 未着手として残したもの

```bash
git add docs/superpowers/specs/2026-08-29-parallax-series-design.md && git commit -m "docs(parallax): 実装後の実測と、未着手の棚卸し"
```

---

## Self-Review

**1. Spec coverage**

| spec の項目 | 対応タスク |
|---|---|
| 4 軸の分解（主張の骨格） | 各実験のコメントに分散。#12 が「速度差だけでは足りない」を担う |
| #11 スクロール scrub | Task 4 |
| #13 #14 は `pin: false` | Task 6 / Task 7 |
| 穴 1（符号は傾きを反転） | Task 1 の `depthCues` と「gain は傾きだけを反転させる」テスト |
| 穴 2（塗りが尽きる） | Task 1 の `ridgeBox` と「延長しても縦の倍率を変えない」テスト |
| 穴 3（移動量の上限） | Task 1 の `maxTravel` と追い越し判定テスト、Task 5 で実使用 |
| 穴 4（skew の飽和） | Task 1 の `velocitySkew` と「飽和域でも深度の順序を保つ」テスト、Task 7 で実使用 |
| 単一の深度値から全部を導く | Task 1 の `depthCues` |
| 層は 4 枚 | Task 1 の `RIDGE_LAYERS`（4 要素）、Task 7 の `WORDS`（4 要素） |
| 遮蔽が最強の手がかり | Task 5 のトグルと Step 4 の目視項目 |
| 視錐台は 3 行 | Task 3 の `projectOffAxis` |
| THREE.js 不使用の実証 | Task 6 |
| 止まると視差が消える | Task 7 |
| #15 は融合 | Task 8 |
| `d = B/θ` で最初と最後が閉じる | Task 2 の `parsecFromArcsec` コメント、Task 8 の読み値と表示 |
| 視差角の誇張を明示 | Task 4 の「1″ = 90px（誇張）」表示、Task 2 の `ARCSEC_PX` コメント |
| 6 星の実測値 | Task 2 の `STARS` と距離テスト |
| 1px を切る 2 星 | Task 2 の `isMeasurable` テスト、Task 4 の表 |
| 検証方法（3 モジュール） | Task 1 / 2 / 3 の各テスト |
| コメントの方針 | 全実験ファイルの doc コメント |
| ダイヤルの弧（積み残し） | Task 8 Step 5 で判断のみ。直さない |

**修正した gap:** spec の `lib/frustum.test.ts` の項目に「視点が原点のとき両投影が一致する」とあったが成立しない（`ex=ey=0` でも視錐台は `t<1` で縮む）。spec 側を先に訂正済み。Task 3 のテストは訂正後の不変量（`pz=0` で一致／`ex=ey=0` でも視錐台だけ縮む／消失点は `(ex,ey)`）で書いてある。

**2. Placeholder scan**

`TBD` / `TODO` / 「適切に」「後で」なし。全コードステップに実コードあり。
Task 6 に `any` を仮置きして後段で差し替える手順を書いていたが、自己レビューで削除した。
`PanelRefs` / `Project` を最初から定義し、`any` を一切使わない形にしてある。

**3. Type consistency**

- `depthCues(z, gain?)` — Task 1 定義、Task 5 / 8 で使用。引数順・戻り値のプロパティ名（`speed` / `blur` / `saturate` / `contrast` / `scale`）一致
- `maxTravel(nearHeight, farHeight, nearSpeed, farSpeed, safety?)` — Task 1 定義、Task 5 で 4 引数で使用（`safety` 既定値）
- `velocitySkew(velocity, z)` / `stepSpring(s, target, z, dt)` / `type Spring = { y, v }` — Task 1 定義、Task 7 / 8 で使用。一致
- `ridgeBox(h)` → `{ height, bottom, viewBox }` / `ridgePath(phase, amp, base)` — Task 1 定義、Task 5 / 8 で使用。一致
- `RIDGE_LAYERS` の要素 `{ z, height, phase, amp, base }` — Task 1 定義、Task 5 / 8 で全プロパティ使用。一致
- `projectOffAxis(p, eye)` / `projectNaive(p, eye, depthScale?)` / `type Eye` / `type Vec2` — Task 3 定義、Task 6 / 8 で使用。一致
- `STARS` の要素 `{ name, parallax, eclipticLat, x, y, mag }` — Task 2 定義、Task 4 で全プロパティ使用。一致
- `Experiment` 型（`id` / `title` / `tech` / `note` / `length` / `pin` / `fade` / `render` / `build` / `Component`）— `lib/lab.ts` の既存定義に一致。`build` の戻り値でクリーンアップ関数を返しているのは Task 5 のみで、型どおり
