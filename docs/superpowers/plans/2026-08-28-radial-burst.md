# Radial Burst 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 中心から放射して消えていく札（ラボ実験 #10）を、`lib/radial-burst.ts`（純粋関数＋状態機械）と `components/lab/experiments/radial-burst.tsx`（DOM の機械）に分けて実装し、設計書の実測値を回帰テストとして残す。

**Architecture:** 幾何と発生の規則を `lib/radial-burst.ts` に閉じ込め、長さは全て「盤の半径 R」に対する比で持つ。描画側は R（px）を掛けるだけ。角度は黄金角 137.5° の通し番号で出し、将来の重なりを外接円で予測して棄却する。DOM + SVG で描くので、のちの作品版（`orientation: 'upright'` / `persist: true` / 図版を `<img>` に差し替え）が同じ核の再利用で済む。

**Tech Stack:** Next.js (App Router) / React 19 / TypeScript / GSAP（`gsap.ticker` のみ。ScrollTrigger は使わない）/ Tailwind v4 / Node 24 の組み込みテストランナー（`node --test`。型剥がしは Node ネイティブなので、テスト依存パッケージは足さない）

**設計書:** `docs/superpowers/specs/2026-08-28-radial-burst-design.md`（数値・判断・未着手は全部そこが正。会話の記録ではなく設計書を読むこと）

**ブランチ:** `main` で作業しないこと。着手前に `git switch -c feat/radial-burst`（または `superpowers:using-git-worktrees` で隔離）。

---

## Global Constraints

設計書の「確定値」節から逐語。全タスクの要件にこれが暗黙に含まれる。

- 速度 `0.26` R/s、速度カーブは減速（ease-out）、速度のばらつき `±40%`
- 発生間隔 `0.18` s
- カード径 `0.13` R（ばらつき `±20%`）
- 到達半径 `R の 0.50〜1.00`（最大＝札の**中心**が外周に達する）
- 出発半径＝その札の外接円の半径 `rho = size × √2 ÷ 2`
- フェード 行程 `0→0.16` で入り、`0.55→1.00` で出る
- 安全マージン `1.18`（1.12 では 5 シード中 1 つで破れた。**下げないこと**）
- 候補角 黄金角 `137.50776405003785`° ＋ `±8.6`° のジッタ、最大 `14` 回
- `R` は盤の半径 `min(幅, 高さ) × 0.40`。**長さは全て R 比で持ち、lib は px を一切知らない**
- 当たり判定は**外接円のみ**。札の向き（`orientation`）に依存させない
- 衝突予測の刻み数は固定値にしない。`clamp(ceil(horizon × vRel / (0.4 × lim)), 8, 600)`
- ピン留めしない（`pin: false` ＋ `Component`）。Orrery / Paper Sphere と同じ
- コメント・ドキュメントは日本語。既存ファイルの書き方・語彙に合わせる
- SVG の線は `vector-effect="non-scaling-stroke"`（小さく描く SVG が消える件の既存教訓）
- 60fps で React の再レンダリングを起こさない。毎フレームの値は DOM に直接書く（Orrery の時計と同じ）

---

## File Structure

| ファイル | 責務 |
|---|---|
| `lib/radial-burst.ts`（新規） | 候補角の列、衝突予測、半径・不透明度・座標の写像、発生の状態機械。**DOM も GSAP も持たない** |
| `lib/radial-burst.test.ts`（新規） | 上の回帰テスト。設計中に使った測定をそのまま残す |
| `components/lab/experiments/radial-burst.tsx`（新規） | 機械。ticker、札の生成と破棄、リサイズ、reduced-motion、濃度と外周の目盛り |
| `components/lab/registry.ts`（修正） | import 1 行 ＋ 配列に 1 行 |
| `tsconfig.json`（修正） | `allowImportingTsExtensions: true` を足す |
| `package.json`（修正） | `"test"` スクリプトを足す |
| `docs/superpowers/specs/2026-08-28-radial-burst-design.md`（修正） | 状態と未着手の更新 |

既存の `lib/orbital.ts` / `lib/sphere.ts` / `lib/curves.ts` と同じ分け方（純粋関数の lib ＋ DOM を持つ component）。

**再利用するもの（新しく書かないこと）:**

- `lib/curves.ts` の `rosePath` / `lissajousPath` / `polygonPath` — 札の図版
- `lib/orbital.ts` の `ticks(count, majorEvery)` — 外周の目盛り。Orrery が `ticks(72, 6)` で使っているのと同じ関数
- `lib/gsap-config.ts` の `gsap` — ticker

---

## テスト環境について（Task 1 で 1 度だけ整える）

Node 24.18 は `.ts` を型剥がしして直接実行できる。追加パッケージは要らない。ただし 2 点:

1. Node の ESM は**拡張子必須**なので、テストからの import は `'./radial-burst.ts'` と書く。
   これを TypeScript が通すには `tsconfig.json` に `allowImportingTsExtensions: true` が要る
   （無いと `TS5097`。`noEmit: true` が前提だが、このプロジェクトは既にそうなっている）。
2. 型剥がしは**消せる構文だけ**を扱う。`enum` / `namespace` / パラメータプロパティは書かないこと。
   型の import は必ず `import { type Foo }` か `import type` にする。

**検証コマンドの生出力は `rtk proxy` を通して見ること。** rtk の要約は失敗を成功のように見せることがある
（`npx tsc --noEmit` が起動すらしていないのに `No errors found` と出た前例がある）。

---

### Task 1: 写像と乱数 — `lib/radial-burst.ts` の土台

**Files:**

- Create: `lib/radial-burst.ts`
- Create: `lib/radial-burst.test.ts`
- Modify: `tsconfig.json`（`compilerOptions` に 1 行）
- Modify: `package.json`（`scripts` に 1 行）

**Interfaces:**

- Consumes: なし
- Produces:
  - `GOLDEN_ANGLE_DEG: number`、`FADE_IN_END: number`、`FADE_OUT_START: number`
  - `DEFAULTS`（下の実装どおりのオブジェクト）
  - `type Card`（下の実装どおり。以降の全タスクがこの形に依存する）
  - `makeRandom(seed: number): () => number`
  - `easeOut(u: number): number`
  - `progressAt(c: Card, t: number): number`
  - `radiusAt(c: Card, t: number): number`
  - `opacityAt(c: Card, t: number): number`
  - `positionAt(c: Card, t: number): { x: number; y: number }`
  - `maxAngularGap(cards: Card[]): number`

- [ ] **Step 1: `tsconfig.json` に `allowImportingTsExtensions` を足す**

`"noEmit": true,` の直後に 1 行足す。他は触らない。

```json
    "noEmit": true,
    "allowImportingTsExtensions": true,
```

- [ ] **Step 2: `package.json` に `test` スクリプトを足す**

`scripts` を丸ごとこれに置き換える。glob は Node 自身が展開するので、PowerShell でも Bash でも同じに動く。

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "node --test \"lib/*.test.ts\""
  },
```

- [ ] **Step 3: 失敗するテストを書く**

`lib/radial-burst.test.ts` を新規作成。この時点では写像の単体テストだけ。

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  FADE_IN_END,
  FADE_OUT_START,
  GOLDEN_ANGLE_DEG,
  easeOut,
  makeRandom,
  maxAngularGap,
  opacityAt,
  positionAt,
  progressAt,
  radiusAt,
  type Card,
} from './radial-burst.ts';

/** テスト用の 1 枚。個別のテストで必要なところだけ上書きする。 */
const card = (over: Partial<Card> = {}): Card => ({
  id: 0,
  angle: 0,
  r0: 0.1,
  r1: 0.8,
  size: 0.13,
  rho: 0.092,
  speed: 0.26,
  born: 0,
  life: 2,
  variant: 0,
  persist: false,
  ...over,
});

test('確定値が設計書どおり', () => {
  assert.equal(DEFAULTS.speed, 0.26);
  assert.equal(DEFAULTS.speedJitter, 0.4);
  assert.equal(DEFAULTS.spawnInterval, 0.18);
  assert.equal(DEFAULTS.cardSize, 0.13);
  assert.equal(DEFAULTS.cardJitter, 0.2);
  assert.equal(DEFAULTS.reachMin, 0.5);
  assert.equal(DEFAULTS.reachMax, 1);
  assert.equal(DEFAULTS.margin, 1.18);
  assert.equal(DEFAULTS.angleJitterDeg, 8.6);
  assert.equal(DEFAULTS.maxCandidates, 14);
  assert.equal(FADE_IN_END, 0.16);
  assert.equal(FADE_OUT_START, 0.55);
  // Orrery の初期位相・Paper Sphere のフィボナッチ球と同じ値であること
  assert.equal(GOLDEN_ANGLE_DEG, 137.50776405003785);
});

test('減速カーブの初速は平均の 2 倍（予測の刻み数がこの 2 を使う）', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  // easeOut(0.5) = 0.75。半分の時間で 3/4 まで進む
  assert.equal(easeOut(0.5), 0.75);
  // 0 近傍の傾き ≒ 2
  assert.ok(Math.abs(easeOut(1e-6) / 1e-6 - 2) < 1e-4);
});

test('行程と半径の写像', () => {
  const c = card();
  assert.equal(progressAt(c, 0), 0);
  assert.equal(progressAt(c, 1), 0.5);
  assert.equal(progressAt(c, 2), 1);

  assert.ok(Math.abs(radiusAt(c, 0) - 0.1) < 1e-12);
  assert.ok(Math.abs(radiusAt(c, 2) - 0.8) < 1e-12);
  // 減速なので、半分の時間で距離の 3/4
  assert.ok(Math.abs(radiusAt(c, 1) - (0.1 + 0.7 * 0.75)) < 1e-12);
  // 行程の外へはみ出しても外周を越えないし、内へも戻らない
  assert.ok(Math.abs(radiusAt(c, 99) - 0.8) < 1e-12);
  assert.ok(Math.abs(radiusAt(c, -99) - 0.1) < 1e-12);
});

test('不透明度は 0→16% で立ち上がり 55%→100% で落ちる', () => {
  const c = card();
  assert.equal(opacityAt(c, 0), 0);
  assert.ok(Math.abs(opacityAt(c, 2 * 0.08) - 0.5) < 1e-12);
  assert.ok(Math.abs(opacityAt(c, 2 * 0.16) - 1) < 1e-12);
  assert.equal(opacityAt(c, 2 * 0.35), 1);
  assert.equal(opacityAt(c, 2 * 0.55), 1);
  // (1 - 0.775) / (1 - 0.55) = 0.5
  assert.ok(Math.abs(opacityAt(c, 2 * 0.775) - 0.5) < 1e-9);
  assert.equal(opacityAt(c, 2), 0);
});

test('persist の札は消えず、不透明度が 1 のまま留まる', () => {
  const c = card({ persist: true });
  assert.equal(opacityAt(c, 0), 0);
  assert.ok(Math.abs(opacityAt(c, 2 * 0.16) - 1) < 1e-12);
  assert.equal(opacityAt(c, 2 * 0.9), 1);
  assert.equal(opacityAt(c, 99), 1);
});

test('座標は自分の角度の方向へ真っすぐ', () => {
  const right = positionAt(card({ angle: 0 }), 2);
  assert.ok(Math.abs(right.x - 0.8) < 1e-12);
  assert.ok(Math.abs(right.y) < 1e-12);

  const down = positionAt(card({ angle: Math.PI / 2 }), 2);
  assert.ok(Math.abs(down.x) < 1e-12);
  assert.ok(Math.abs(down.y - 0.8) < 1e-12);
});

test('角度の空きの測り方', () => {
  const at = (deg: number) => card({ angle: (deg * Math.PI) / 180 });
  assert.ok(Math.abs(maxAngularGap([at(0), at(90), at(180), at(270)]) - 90) < 1e-9);
  // 折り返しをまたぐ隙間も見る
  assert.ok(Math.abs(maxAngularGap([at(10), at(20)]) - 350) < 1e-9);
  // 1 枚しか居ない／居ないときは「全部空いている」
  assert.equal(maxAngularGap([at(42)]), 360);
  assert.equal(maxAngularGap([]), 360);
  // 負の角度・1 周を超える角度も畳む
  assert.ok(Math.abs(maxAngularGap([at(-90), at(90), at(450)]) - 180) < 1e-9);
});

test('同じシードは同じ列を返し、違うシードは違う列を返す', () => {
  const a = makeRandom(7);
  const b = makeRandom(7);
  const c = makeRandom(8);
  const xs = Array.from({ length: 200 }, () => a());
  const ys = Array.from({ length: 200 }, () => b());
  const zs = Array.from({ length: 200 }, () => c());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  // 0 以上 1 未満に収まる
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  // 平均が 0.5 の近く（極端に偏った PRNG を弾く）
  assert.ok(Math.abs(xs.reduce((s, v) => s + v, 0) / xs.length - 0.5) < 0.06);
});
```

- [ ] **Step 4: テストを走らせて、落ちることを確かめる**

```bash
npm test
```

Expected: FAIL。`ERR_MODULE_NOT_FOUND` で `lib/radial-burst.ts` が無いと言われる。
これでランナーが `.ts` を読めていることも同時に確かめられる。
別のエラー（たとえば `Unknown file extension ".ts"`）が出たら Node のバージョンを確認する。24.18 以上が要る。

- [ ] **Step 5: `lib/radial-burst.ts` を作る**

```ts
/**
 * @file radial-burst.ts
 * @description 中心から放射して消えていく札の、幾何と発生の規則。
 *              純粋関数と 1 つの状態機械だけ（DOM も GSAP も持たない）。
 *
 * 長さは全て「盤の半径 R」に対する比で持つ。このモジュールは画面サイズを
 * 一切知らないので、リサイズは描画側の掛け算だけで済み、ここは測り直さなくてよい。
 */

/**
 * 黄金角(deg)。Orrery の初期位相、Paper Sphere のフィボナッチ球に続いて三度目。
 * 欲しいのは「滑らかに揺れる」ノイズではなく「均等にばらける」ほうなので、
 * パーリンノイズではなくこちらを使う。
 */
export const GOLDEN_ANGLE_DEG = 137.50776405003785;

/** フェードの境目（行程に対する比）。 */
export const FADE_IN_END = 0.16;
export const FADE_OUT_START = 0.55;

/**
 * 確定値。設計書 2026-08-28-radial-burst-design.md の「確定値」節と 1 対 1。
 * 特に margin は 1.12 だと 5 シード中 1 つで重なりが出た。下げないこと。
 */
export const DEFAULTS = {
  /** 平均速度(R/s)。 */
  speed: 0.26,
  /** 速度のばらつき（±この比）。 */
  speedJitter: 0.4,
  /** 発生間隔(s)。 */
  spawnInterval: 0.18,
  /** 札の一辺(R比)。 */
  cardSize: 0.13,
  /** 一辺のばらつき（±この比）。 */
  cardJitter: 0.2,
  /** 到達半径の下限・上限(R比)。上限 1.0 ＝ 札の中心が外周に達する。 */
  reachMin: 0.5,
  reachMax: 1,
  /** 予測側の判定円を実際より大きく取る倍率。 */
  margin: 1.18,
  /** 候補角に足すジッタ（±この deg）。 */
  angleJitterDeg: 8.6,
  /** 1 回の発生で試す候補の数。 */
  maxCandidates: 14,
  /** 図版の種類数。描画側が解釈する。 */
  variants: 6,
  /** true にすると札が消えない（作品版）。 */
  persist: false,
};

export type Card = {
  id: number;
  /** 進行方向(rad)。 */
  angle: number;
  /**
   * 出発半径(R比)＝自分の外接円の半径。
   * 中心付近には原理的に 1 枚しか置けない（半径 r で角度差 Δθ の 2 枚の距離は r·Δθ
   * なので、必要な角度差が r→0 で無限に開く）。だから見えない「産まれる輪」から出す。
   */
  r0: number;
  /** 到達半径(R比)。札の「中心」がここに達したら行程が尽きる。 */
  r1: number;
  /** 一辺(R比)。 */
  size: number;
  /**
   * 外接円の半径(R比)＝ size × √2 ÷ 2。当たり判定はこれだけで持つ。
   * 向きごとに判定の形を変えると、orientation を切り替えるたびに重なり保証が壊れる。
   * 実際の矩形より少し大きいぶんの空気は、その代償として安い。
   */
  rho: number;
  /** 平均速度(R/s)。イージング前の値。 */
  speed: number;
  /** 誕生時刻(s)。 */
  born: number;
  /** 行程にかかる時間(s)＝(r1 − r0)/speed。 */
  life: number;
  /** 図版の種類。描画側が解釈する。 */
  variant: number;
  /** true なら行程の終わりで消えず、その場に留まる。 */
  persist: boolean;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * mulberry32。テストで同じ列を再現するために自前で持つ。
 * Math.random では「5 シード × 120 秒」の回帰テストが書けない。
 */
export const makeRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * 減速(ease-out)。u∈[0,1] を行程 0..1 に写す。
 * 0 近傍の傾きが 2 ── 瞬間速度は平均の最大 2 倍になる。
 * 衝突予測の刻み数はこの 2 を使って逆算する。
 */
export const easeOut = (u: number) => u * (2 - u);

/** 行程。0 で誕生、1 で行程の終わり。範囲外にも素直に伸びる（生死の判定に使う）。 */
export const progressAt = (c: Card, t: number) =>
  c.life <= 0 ? 1 : (t - c.born) / c.life;

/** 中心からの距離(R比)。 */
export const radiusAt = (c: Card, t: number) =>
  c.r0 + (c.r1 - c.r0) * easeOut(clamp01(progressAt(c, t)));

/** 中心を原点とした座標(R比)。 */
export const positionAt = (c: Card, t: number) => {
  const r = radiusAt(c, t);
  return { x: Math.cos(c.angle) * r, y: Math.sin(c.angle) * r };
};

/**
 * 不透明度。0→16% で現れ、55%→100% で消える。
 * persist の札はフェードインしたあと 1 のまま留まる。
 */
export const opacityAt = (c: Card, t: number) => {
  const u = progressAt(c, t);
  if (u <= 0) return 0;
  if (u < FADE_IN_END) return u / FADE_IN_END;
  if (c.persist) return 1;
  if (u >= 1) return 0;
  if (u > FADE_OUT_START) return (1 - u) / (1 - FADE_OUT_START);
  return 1;
};

/**
 * 生きている札の角度に空いた、最大の隙間(deg)。
 *
 * 要件「出現角度に偏りを持たせない」の本質は長期のヒストグラムではなく、
 * **その瞬間、片側がガラ空きに見えないか**。測る量をこれに変えて方式を選んだ。
 * 参考値: 完全等配置 27.9°、棄却なしの一様乱数 83.8°。
 */
export const maxAngularGap = (cards: Card[]): number => {
  if (cards.length < 2) return 360;
  const degs = cards
    .map((c) => ((((c.angle * 180) / Math.PI) % 360) + 360) % 360)
    .sort((a, b) => a - b);

  // 折り返しをまたぐ隙間から始める
  let gap = degs[0] + 360 - degs[degs.length - 1];
  for (let i = 1; i < degs.length; i++) {
    const d = degs[i] - degs[i - 1];
    if (d > gap) gap = d;
  }
  return gap;
};
```

- [ ] **Step 6: テストを走らせて、通ることを確かめる**

```bash
npm test
```

Expected: PASS（8 tests）。`fail 0` を目で確認する。

- [ ] **Step 7: 型チェックが通ることを確かめる**

```bash
rtk proxy npx tsc --noEmit
```

Expected: 出力なし・exit 0。`TS5097`（`.ts` 拡張子）が出たら Step 1 が入っていない。

- [ ] **Step 8: Commit**

```bash
git add lib/radial-burst.ts lib/radial-burst.test.ts tsconfig.json package.json && git commit -m "feat(radial-burst): 半径・不透明度・座標の写像と、再現可能な乱数"
```

---

### Task 2: 衝突予測 — 刻み数を相対速度から逆算する

設計中の測定で見つかった 2 つの穴を、両方ともここで塞ぐ。

1. **刻み数を固定にすると、速い札が遅い札をサンプルとサンプルの間で通り抜ける**
   （14 点固定・速度をばらした条件で、90 秒あたり 30 回の重なり、最大めり込み 7.7%）。
   → 刻み数を相対速度と外接円から逆算する。
2. **刻みを細かくしても「かすり」は取り切れない。**
   距離がしきい値をわずかに下回ってすぐ戻る場合、1 ステップ内の距離変化量そのものが
   小さいので、どれだけ刻んでも網に掛からない。漸近的にしか消えない。
   → **予測側の判定円を実際より大きく取る**（margin 1.18）。

**Files:**

- Modify: `lib/radial-burst.ts`（末尾に追記）
- Modify: `lib/radial-burst.test.ts`（末尾に追記）

**Interfaces:**

- Consumes: Task 1 の `Card` / `positionAt` / `DEFAULTS`
- Produces:
  - `predictSteps(a: Card, b: Card, horizon: number, margin: number): number`
  - `willCollide(a: Card, b: Card, t: number, horizon: number, margin: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`lib/radial-burst.test.ts` の末尾に追記する。冒頭の import 文にも
`predictSteps,` と `willCollide,` を足すこと（アルファベット順の位置に差し込む）。

```ts
test('刻み数は相対速度から逆算され、固定値ではない', () => {
  const slow = card({ speed: 0.156, size: 0.13, rho: 0.092 });
  const fast = card({ speed: 0.364, size: 0.13, rho: 0.092 });

  // 速い組み合わせのほうが細かく刻む
  const a = predictSteps(slow, slow, 5, DEFAULTS.margin);
  const b = predictSteps(fast, fast, 5, DEFAULTS.margin);
  assert.ok(b > a, `速いほうが粗い: slow=${a} fast=${b}`);

  // 見る時間が長いほど細かく刻む
  assert.ok(
    predictSteps(fast, fast, 10, DEFAULTS.margin) >
      predictSteps(fast, fast, 5, DEFAULTS.margin),
  );

  // 小さい札（判定距離が短い）ほど細かく刻む
  const small = card({ speed: 0.26, size: 0.104, rho: (0.104 * Math.SQRT2) / 2 });
  const big = card({ speed: 0.26, size: 0.156, rho: (0.156 * Math.SQRT2) / 2 });
  assert.ok(
    predictSteps(small, small, 5, DEFAULTS.margin) >
      predictSteps(big, big, 5, DEFAULTS.margin),
  );

  // 下限 8 は必ず守る
  assert.equal(predictSteps(slow, slow, 0.001, DEFAULTS.margin), 8);
});

test('1 ステップの相対移動量が、判定距離の 40% を超えない', () => {
  // 実際に取りうる範囲を総当たりする。速度 ±40%、一辺 ±20%、行程はほぼ最長まで。
  const speeds = [0.156, 0.26, 0.364];
  const sizes = [0.104, 0.13, 0.156];
  const horizons = [0.5, 2, 5, 12];

  for (const sa of speeds) {
    for (const sb of speeds) {
      for (const za of sizes) {
        for (const zb of sizes) {
          for (const horizon of horizons) {
            const a = card({ speed: sa, size: za, rho: (za * Math.SQRT2) / 2 });
            const b = card({ speed: sb, size: zb, rho: (zb * Math.SQRT2) / 2 });
            const steps = predictSteps(a, b, horizon, DEFAULTS.margin);
            // 上限 600 に張り付いたら保証できない。実運用の範囲では張り付かないはず。
            assert.ok(steps < 600, `刻み数が上限に張り付いた: ${steps}`);

            const lim = (a.rho + b.rho) * DEFAULTS.margin;
            const vRel = 2 * (a.speed + b.speed);
            const perStep = (horizon / steps) * vRel;
            assert.ok(
              perStep <= 0.4 * lim + 1e-12,
              `1 ステップ ${perStep.toFixed(5)} > 判定距離の 40% ${(0.4 * lim).toFixed(5)}`,
            );
          }
        }
      }
    }
  }
});

test('同じ角度で追いかける 2 枚は重なると判定される', () => {
  // 先に出た遅い札を、あとから出た速い札が追う。追い越しはサンプル間で起きやすい。
  const slow = card({ angle: 0, r0: 0.09, r1: 1, speed: 0.16, born: 0, life: (1 - 0.09) / 0.16 });
  const fast = card({ id: 1, angle: 0, r0: 0.09, r1: 1, speed: 0.36, born: 1, life: (1 - 0.09) / 0.36 });
  const horizon = Math.min(slow.born + slow.life, fast.born + fast.life) - 1;
  assert.equal(willCollide(fast, slow, 1, horizon, DEFAULTS.margin), true);
});

test('真反対へ飛ぶ 2 枚は重ならない', () => {
  // 誕生時刻を発生間隔ぶんずらすこと。**同時に産まれた 2 枚は必ず衝突と判定される** ──
  // 出発半径が外接円の半径なので、同時誕生の 2 枚の中心間距離は真反対でも 2·rho
  // にしかならず、判定距離 2·rho·1.18 を必ず下回る。
  // これは実装のバグではなく「中心付近には原理的に 1 枚しか置けない」ことの現れ。
  const life = (1 - 0.092) / 0.26;
  const east = card({ angle: 0, r0: 0.092, r1: 1, born: 0, life });
  const west = card({ id: 1, angle: Math.PI, r0: 0.092, r1: 1, born: 0.18, life });

  const t = 0.18;
  const horizon = Math.min(east.born + east.life, west.born + west.life) - t;
  assert.ok(horizon > 0);
  assert.equal(willCollide(east, west, t, horizon, DEFAULTS.margin), false);
});

test('horizon が 0 以下なら、もう交わりようがないので false', () => {
  const a = card({ angle: 0 });
  const b = card({ id: 1, angle: 0 });
  assert.equal(willCollide(a, b, 0, 0, DEFAULTS.margin), false);
  assert.equal(willCollide(a, b, 0, -1, DEFAULTS.margin), false);
});

test('margin は、判定円を実際より大きく取る倍率として効く', () => {
  // 先に出た札が外周近くまで進んだところへ、30° 離して次の札を出す。
  // 距離は最接近が horizon の端に来る組み合わせなので、粗い刻みでも取りこぼさない。
  const life = (1 - 0.092) / 0.26;
  const a = card({ angle: 0, r0: 0.092, r1: 1, born: 0, life });
  const b = card({ id: 1, angle: (30 * Math.PI) / 180, r0: 0.092, r1: 1, born: 3, life });

  const t = 3;
  const horizon = Math.min(a.born + a.life, b.born + b.life) - t;
  assert.ok(horizon > 0);

  // この 2 枚が実際どこまで近づくかを、予測器を使わずに細かく測る。
  // 予測器で予測器を検算しないため。
  let minD = Infinity;
  for (let i = 0; i <= 20000; i++) {
    const tt = t + (horizon * i) / 20000;
    const pa = positionAt(a, tt);
    const pb = positionAt(b, tt);
    minD = Math.min(minD, Math.hypot(pa.x - pb.x, pa.y - pb.y));
  }
  const touch = a.rho + b.rho;

  // 判定円が最接近より小さければ通り、大きければ弾かれる
  assert.equal(willCollide(a, b, t, horizon, (minD / touch) * 0.9), false);
  assert.equal(willCollide(a, b, t, horizon, (minD / touch) * 1.5), true);
});
```

- [ ] **Step 2: テストを走らせて、落ちることを確かめる**

```bash
npm test
```

Expected: FAIL。`predictSteps is not defined` 系のエラー、または import 解決の失敗。

- [ ] **Step 3: `lib/radial-burst.ts` の末尾に実装を足す**

```ts
/**
 * 将来の重なりを予測する刻み数。
 *
 * **固定数にしてはいけない。** 速度をばらすと、速い札が遅い札を
 * サンプルとサンプルの間で通り抜ける（14 点固定・最も密な条件で、
 * 90 秒あたり 30 回の重なり、最大めり込み 7.7%）。
 * 1 ステップの相対移動量が判定距離の 40% を超えないところまで刻む。
 *
 * vRel の 2 は ease-out の瞬間速度が平均の最大 2 倍になることから来ている。
 */
export const predictSteps = (a: Card, b: Card, horizon: number, margin: number) => {
  const vRel = 2 * (a.speed + b.speed);
  const lim = (a.rho + b.rho) * margin;
  const n = Math.ceil((horizon * vRel) / (0.4 * lim));
  return n < 8 ? 8 : n > 600 ? 600 : n;
};

/**
 * a と b が、これから horizon 秒のあいだに判定距離まで近づくか。
 *
 * 判定は外接円だけで行う。札の向き(orientation)を切り替えても
 * 当たり判定の形が変わらない ── 向きごとに形を変えると、切り替えるたびに
 * 重なり保証が壊れる。
 *
 * margin は「予測側の判定円を実際より大きく取る」ための倍率。
 * 距離がしきい値をわずかに下回ってすぐ戻る「かすり」は、1 ステップ内の
 * 距離変化量そのものが小さいので、どれだけ刻んでも網に掛からない。
 * 刻みでは漸近的にしか消えず、正しい直し方はこちら。
 */
export const willCollide = (
  a: Card,
  b: Card,
  t: number,
  horizon: number,
  margin: number,
) => {
  if (horizon <= 0) return false;
  const lim = (a.rho + b.rho) * margin;
  const steps = predictSteps(a, b, horizon, margin);

  for (let i = 0; i <= steps; i++) {
    const tt = t + (horizon * i) / steps;
    const pa = positionAt(a, tt);
    const pb = positionAt(b, tt);
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < lim) return true;
  }
  return false;
};
```

- [ ] **Step 4: テストを走らせて、通ることを確かめる**

```bash
npm test
```

Expected: PASS（14 tests）。`fail 0` を目で確認する。

- [ ] **Step 5: Commit**

```bash
git add lib/radial-burst.ts lib/radial-burst.test.ts && git commit -m "feat(radial-burst): 外接円による衝突予測。刻み数は相対速度から逆算する"
```

---

### Task 3: 発生の状態機械と、5 シード × 120 秒の回帰テスト

要件 6（角度に偏りを持たせない）と要件 7（重ならない）は、**同じループで片づく**。
候補角を黄金角の通し番号で出し、将来重なるなら棄却して次の候補（137.5° 先）へ進む。
棄却しても次は黄金角ぶん先なので、棄却が分布を歪めない。むしろ棄却自体が角度を均す
（棄却なしの一様乱数 83.8° → 棄却あり 68.4° → 黄金角 59.8°）。

**Files:**

- Modify: `lib/radial-burst.ts`（末尾に追記）
- Modify: `lib/radial-burst.test.ts`（末尾に追記）

**Interfaces:**

- Consumes: Task 1・2 の全て
- Produces:
  - `type BurstOptions`（下の実装どおり。全て省略可）
  - `type Emitter = { cards: Card[]; time: number; stats: { spawned: number; rejected: number; skipped: number }; step(dt: number): void }`
  - `createBurst(opts?: BurstOptions): Emitter`

- [ ] **Step 1: 失敗するテストを書く**

`lib/radial-burst.test.ts` の末尾に追記。冒頭の import に `createBurst,` を足す。

測定は 5 シード × 120 秒 × 60fps = 36,000 フレーム。モジュール読み込み時に 1 度だけ回して、
以降のテストで使い回す（各テストで回すと 5 倍かかる）。

```ts
// --- 5 シード × 120 秒の実測。設計中に使った測定をそのまま回帰テストにする ---

const DT = 1 / 60;
const DURATION = 120;
const SEEDS = [1, 2, 3, 4, 5];
/**
 * 立ち上がりを統計から外す秒数。
 * 最初の数秒は札が 0〜1 枚しか居らず、maxAngularGap が 360° を返す（正しい答えだが、
 * 定常状態の偏りを測る目的には合わない）。同時枚数も立ち上がりのぶん低く出る。
 */
const WARMUP = 10;

type Survey = {
  live: number;
  overlaps: number;
  worstOverlap: number;
  gapMean: number;
  gapWorst: number;
  rate: number;
};

/**
 * 1 シードぶん回して実測を集める。
 * 重なりは予測ではなく**外接円の実距離**で見る（margin を掛けない）。
 * 予測器で予測器を検算しても意味がないため。
 */
const survey = (seed: number): Survey => {
  const burst = createBurst({ seed });
  const steps = Math.round(DURATION / DT);
  const warm = Math.round(WARMUP / DT);
  let frames = 0;
  let sumLive = 0;
  let overlaps = 0;
  let worstOverlap = 0;
  let sumGap = 0;
  let gapWorst = 0;

  for (let i = 0; i < steps; i++) {
    burst.step(DT);
    const t = burst.time;
    const cards = burst.cards;
    if (i < warm) continue;
    frames++;
    sumLive += cards.length;

    for (let a = 0; a < cards.length; a++) {
      for (let b = a + 1; b < cards.length; b++) {
        const pa = positionAt(cards[a], t);
        const pb = positionAt(cards[b], t);
        const lim = cards[a].rho + cards[b].rho;
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < lim) {
          overlaps++;
          const bite = (lim - d) / lim;
          if (bite > worstOverlap) worstOverlap = bite;
        }
      }
    }

    const gap = maxAngularGap(cards);
    sumGap += gap;
    if (gap > gapWorst) gapWorst = gap;
  }

  return {
    live: sumLive / frames,
    overlaps,
    worstOverlap,
    gapMean: sumGap / frames,
    gapWorst,
    // 発生率だけは立ち上がりも含めた全区間で見る（発生は最初から一定間隔で走るため）
    rate: burst.stats.spawned / DURATION,
  };
};

const results = SEEDS.map(survey);
const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

test('5 シード × 120 秒で、札どうしの重なりは 1 度も起きない', () => {
  const total = results.reduce((n, r) => n + r.overlaps, 0);
  const worst = Math.max(...results.map((r) => r.worstOverlap));
  assert.equal(
    total,
    0,
    `重なり ${total} 回、最大めり込み ${(worst * 100).toFixed(2)}%。` +
      ' margin を下げたか、予測の刻み数を固定にしていないか確認する',
  );
});

test('角度の最大の空きが、棄却なしの一様乱数より明確に小さい', () => {
  const mean = avg(results.map((r) => r.gapMean));
  const worst = Math.max(...results.map((r) => r.gapWorst));
  // 設計時の実測は 平均 59.8° / 最悪 144.6°。この計画を書いた時点で
  // 同じアルゴリズムを回すと 平均 60.2° / 最悪 140.7° になる。
  // 参考: 完全等配置 27.9°、棄却なしの一様乱数 83.8° / 189.2°。
  assert.ok(mean < 70, `平均の空き ${mean.toFixed(1)}° が 70° を超えた`);
  assert.ok(worst < 170, `最悪の空き ${worst.toFixed(1)}° が 170° を超えた`);
});

test('発生率と同時枚数が設計値どおり', () => {
  const rate = avg(results.map((r) => r.rate));
  const live = avg(results.map((r) => r.live));
  // 設計時の実測は 5.0 枚/秒・同時 12.9 枚。この計画を書いた時点で
  // 同じアルゴリズムを回すと 4.77 枚/秒・同時 12.83 枚になる。
  // 帯から外れたら帯を広げず、原因を調べること（設計書の数値が契約）。
  assert.ok(rate > 4.5 && rate < 5.6, `発生率 ${rate.toFixed(2)} 枚/秒`);
  assert.ok(live > 11.5 && live < 14.5, `同時 ${live.toFixed(2)} 枚`);
});

test('同じシードなら、いつ回しても同じ結果になる', () => {
  const once = survey(3);
  const twice = survey(3);
  assert.deepEqual(once, twice);
});

test('棄却は起きるが、全滅して発生が止まることはない', () => {
  const burst = createBurst({ seed: 1 });
  for (let i = 0; i < Math.round(30 / DT); i++) burst.step(DT);
  // 棄却が 1 度も起きないなら、予測が働いていない
  assert.ok(burst.stats.rejected > 0, '棄却が 1 度も起きていない');
  // 全部の候補が弾かれて 1 枚も出ない、という状態にはならない
  assert.ok(burst.stats.spawned > 100, `30 秒で ${burst.stats.spawned} 枚しか出ていない`);
  assert.ok(
    burst.stats.skipped < burst.stats.spawned * 0.35,
    `見送りが多すぎる: 発生 ${burst.stats.spawned} / 見送り ${burst.stats.skipped}`,
  );
});

test('出発半径は自分の外接円の半径で、到達半径は 0.5〜1.0 に収まる', () => {
  const burst = createBurst({ seed: 2 });
  const seen: Card[] = [];
  for (let i = 0; i < Math.round(20 / DT); i++) {
    burst.step(DT);
    for (const c of burst.cards) if (!seen.some((s) => s.id === c.id)) seen.push(c);
  }
  assert.ok(seen.length > 60);
  for (const c of seen) {
    assert.ok(Math.abs(c.rho - (c.size * Math.SQRT2) / 2) < 1e-12, 'rho が外接円ではない');
    assert.ok(Math.abs(c.r0 - c.rho) < 1e-12, '出発半径が外接円の半径ではない');
    assert.ok(c.r1 >= 0.5 && c.r1 <= 1, `到達半径が範囲外: ${c.r1}`);
    assert.ok(c.size >= 0.13 * 0.8 - 1e-12 && c.size <= 0.13 * 1.2 + 1e-12);
    assert.ok(c.speed >= 0.26 * 0.6 - 1e-12 && c.speed <= 0.26 * 1.4 + 1e-12);
    assert.ok(c.variant >= 0 && c.variant < DEFAULTS.variants);
    assert.equal(c.persist, false);
  }
});

test('大きな dt が来ても、溜めを一気に吐き出さない', () => {
  // タブが止まって戻ってきた状況。1 フレームで何十枚も湧いたら見た目が壊れる。
  const burst = createBurst({ seed: 4 });
  burst.step(DT);
  const before = burst.cards.length;
  burst.step(5);
  assert.ok(
    burst.cards.length - before <= 1,
    `5 秒ぶんの dt で ${burst.cards.length - before} 枚湧いた`,
  );
});

test('persist: true の札は消えず、外周に溜まり続ける', () => {
  const burst = createBurst({ seed: 1, persist: true });
  for (let i = 0; i < Math.round(10 / DT); i++) burst.step(DT);
  assert.ok(burst.cards.length > 10, `${burst.cards.length} 枚しか残っていない`);
  // 1 枚も死んでいない
  assert.equal(burst.cards.length, burst.stats.spawned);
  assert.ok(burst.cards.every((c) => c.persist === true));
});
```

- [ ] **Step 2: テストを走らせて、落ちることを確かめる**

```bash
npm test
```

Expected: FAIL。`createBurst is not defined` 系。

- [ ] **Step 3: `lib/radial-burst.ts` の末尾に状態機械を足す**

```ts
export type BurstOptions = {
  /** 省略すると 1。テストで列を再現するために使う。 */
  seed?: number;
  speed?: number;
  speedJitter?: number;
  spawnInterval?: number;
  cardSize?: number;
  cardJitter?: number;
  reachMin?: number;
  reachMax?: number;
  margin?: number;
  angleJitterDeg?: number;
  maxCandidates?: number;
  variants?: number;
  /**
   * true にすると札が消えない（作品版）。
   * 札が溜まり続けるので「時間とともに空く」前提が崩れる。
   * **重なり保証は未検証。** 作品版を作るときに別途設計が要る。
   */
  persist?: boolean;
};

export type Emitter = {
  /** 生きている札。step() が破壊的に更新する、同じ配列。 */
  cards: Card[];
  /** 経過時刻(s)。 */
  time: number;
  stats: { spawned: number; rejected: number; skipped: number };
  /** dt 秒進める。呼び出し側で dt を丸めておくこと（タブ復帰の巨大な delta 対策）。 */
  step(dt: number): void;
};

/**
 * 札を産み続けるエミッタ。
 *
 * 角度は黄金角 137.5° の通し番号で出す。将来重なるなら棄却して次の候補へ進むが、
 * **棄却しても通し番号は進める** ── 次の候補は黄金角ぶん先なので、棄却が分布を歪めない。
 *
 * 「いま最大の隙間の真ん中を狙う」方式も測ったが、平均で 7% しか良くならず
 * 最悪値ではむしろ負けた（最大の隙間を埋めに行くと 2 番目が放置される）。
 * 状態を持たない黄金角のほうが単純で、既存コードとも同じ語彙。
 */
export const createBurst = (opts: BurstOptions = {}): Emitter => {
  const o = { ...DEFAULTS, ...opts };
  const rand = makeRandom(opts.seed ?? 1);

  const cards: Card[] = [];
  const stats = { spawned: 0, rejected: 0, skipped: 0 };

  /** 黄金角の通し番号。棄却しても進める。 */
  let seq = 0;
  let nextId = 0;
  let nextSpawn = 0;

  /** 行程が終わる時刻。persist でも「動きが止まる」時刻としては同じ。 */
  const travelEnd = (c: Card) => c.born + c.life;

  const emitter: Emitter = {
    cards,
    time: 0,
    stats,
    step(dt: number) {
      emitter.time += dt;
      const t = emitter.time;

      // 死ぬ札を先に外す。空いた場所を同じフレームの新入りが使えるようにする。
      for (let i = cards.length - 1; i >= 0; i--) {
        if (!cards[i].persist && progressAt(cards[i], t) >= 1) cards.splice(i, 1);
      }

      if (t < nextSpawn) return;

      // --- 候補を 1 枚こしらえる ---
      // 角度以外は候補ごとに引き直さない。棄却の理由を角度だけに絞るため。
      const size = o.cardSize * (1 + (rand() * 2 - 1) * o.cardJitter);
      const rho = (size * Math.SQRT2) / 2;
      const r1 = o.reachMin + rand() * (o.reachMax - o.reachMin);
      const speed = o.speed * (1 + (rand() * 2 - 1) * o.speedJitter);
      const variant = Math.floor(rand() * o.variants);
      const life = Math.max(0, r1 - rho) / speed;

      let placed: Card | null = null;

      for (let i = 0; i < o.maxCandidates; i++) {
        const deg = (seq + i) * GOLDEN_ANGLE_DEG + (rand() * 2 - 1) * o.angleJitterDeg;
        const cand: Card = {
          id: nextId,
          angle: (deg * Math.PI) / 180,
          r0: rho,
          r1,
          size,
          rho,
          speed,
          born: t,
          life,
          variant,
          persist: o.persist,
        };

        let hit = false;
        for (const other of cards) {
          // どちらかが消えたら、もう重なりようがない。
          // persist なら消えないので、両方が止まるまで見る（止まれば位置は変わらない）。
          const end = o.persist
            ? Math.max(travelEnd(cand), travelEnd(other))
            : Math.min(travelEnd(cand), travelEnd(other));
          if (willCollide(cand, other, t, end - t, o.margin)) {
            hit = true;
            break;
          }
        }

        if (!hit) {
          seq += i + 1; // 採用した候補の次から続ける
          placed = cand;
          break;
        }
        stats.rejected++;
      }

      if (placed) {
        cards.push(placed);
        nextId++;
        stats.spawned++;
      } else {
        seq += o.maxCandidates;
        stats.skipped++;
      }

      nextSpawn += o.spawnInterval;
      // タブが止まっていた等で大きく遅れたら、溜めを吐き出さずに現在へ合わせる。
      // 1 フレームで何十枚も湧くと見た目が壊れる。
      if (nextSpawn < t) nextSpawn = t + o.spawnInterval;
    },
  };

  return emitter;
};
```

- [ ] **Step 4: テストを走らせて、通ることを確かめる**

```bash
npm test
```

Expected: PASS（22 tests）。数秒かかる。`fail 0` を目で確認する。

**期待される実測値.** この計画を書く前に、上のアルゴリズムをそのまま JS に写して
5 シード × 120 秒を回してある。次の値が出るはず（設計書の測定ともよく一致している）:

| | この計画の実測 | 設計書 |
|---|---|---|
| 同時枚数 | 12.83 | 12.9 |
| 発生率 | 4.77 枚/秒 | 5.0 枚/秒 |
| 角度の空き 平均 | 60.2° | 59.8° |
| 角度の空き 最悪 | 140.7° | 144.6° |
| 重なり | 0 | 0 |
| 見送り比 | 16.5% | — |
| 衝突予測の刻み 最大 | 48（上限 600 に遠い） | — |

**帯から外れた場合:** 帯を広げないこと。設計書の実測値（同時 12.9 枚・発生 5.0 枚/秒・
角度の空き 平均 59.8°／最悪 144.6°・重なり 0）が契約で、テストの帯はその周りに置いた
余裕でしかない。外れたら実装のどこが設計と違うかを探す。よくある原因:

- `margin` を `DEFAULTS` 以外から渡している
- 棄却時に `seq` を進めていない（分布が歪む）
- `nextSpawn += o.spawnInterval` を `nextSpawn = t + o.spawnInterval` にしている（発生率が落ちる）
- 候補ごとに size / r1 / speed を引き直している（乱数の消費が変わる）
- `survey` の立ち上がり除外（`WARMUP`）が入っていない
  ── 最初の数秒は札が 0〜1 枚なので `maxAngularGap` が 360° を返し、最悪値の判定が必ず落ちる

- [ ] **Step 5: 型チェック**

```bash
rtk proxy npx tsc --noEmit
```

Expected: 出力なし・exit 0。

- [ ] **Step 6: Commit**

```bash
git add lib/radial-burst.ts lib/radial-burst.test.ts && git commit -m "feat(radial-burst): 黄金角＋棄却の発生機。5 シード × 120 秒の回帰テスト付き"
```

---

### Task 4: 機械 — DOM + SVG の描画と、ラボへの接続

Canvas ではなく DOM を選んでいる。Paper Sphere は 260 枚なので Canvas だったが、
ここは同時 13 枚で DOM が困る数ではない。DOM なら要件 9（実画像への差し替え、クリック、
`alt`、フォーカス）が丸ごとタダになる。Canvas でやると全部あとから作り直しになる。

**Files:**

- Create: `components/lab/experiments/radial-burst.tsx`
- Modify: `components/lab/registry.ts`

**Interfaces:**

- Consumes: `createBurst` / `positionAt` / `opacityAt`（`lib/radial-burst`。`Card` の型は
  `burst.cards` から推論されるので import しない）、
  `rosePath` / `lissajousPath` / `polygonPath`（`lib/curves`）、`ticks`（`lib/orbital`）、
  `gsap`（`lib/gsap-config`）、`type Experiment`（`lib/lab`）
- Produces:
  - `RadialBurstStage: (props: { orientation?: 'radial' | 'upright'; persist?: boolean }) => JSX.Element`（named export。作品版の入口）
  - `radialBurst: Experiment`（registry が読む）

- [ ] **Step 1: `components/lab/experiments/radial-burst.tsx` を作る**

```tsx
"use client";
import React, { useEffect, useRef } from 'react';
import { gsap } from '../../../lib/gsap-config';
import { createBurst, opacityAt, positionAt } from '../../../lib/radial-burst';
import { lissajousPath, polygonPath, rosePath } from '../../../lib/curves';
import { ticks } from '../../../lib/orbital';
import type { Experiment } from '../../../lib/lab';

/** viewBox 100 の中での盤の半径。R = min(幅, 高さ) × 0.40 に対応する。 */
const R_UNIT = 40;
/** 札の図版 SVG の内部座標と、図版の半径。 */
const FACE = 120;
const FIG = 46;
/** 動きを減らす設定のとき、ここまで進めた 1 コマを静止画として置く(s)。 */
const STILL_AT = 7;

const NS = 'http://www.w3.org/2000/svg';

/**
 * 札の図版。lib/curves.ts の手続き的な曲線をそのまま SVG に流す。
 *
 * 奇数 k のバラ曲線は θ∈[0,π] で閉じるので turns は 0.5。
 * 1 にすると同じ線を 2 重に描くことになり、小さく描いたときに線間が潰れて図形が読めなくなる
 * （既存 spec「小さく描く SVG は線幅と重ね描きで消える」の教訓）。
 *
 * 種類数は lib 側の DEFAULTS.variants (= 6) と揃えること。
 */
const FIGURES: Array<() => string> = [
  () => rosePath(3, FIG, 480, 0.5),
  () => rosePath(5, FIG, 480, 0.5),
  () => rosePath(2, FIG, 480, 1),
  () => lissajousPath(3, 2, Math.PI / 2, FIG, 480),
  () => lissajousPath(5, 4, Math.PI / 4, FIG, 480),
  () => polygonPath(6, FIG, 120),
];

/**
 * 札の中身。**ここが要件 9 の差し替え口。**
 * 作品版ではこの関数が `<img>` を返すようになる。
 * DOM を選んだ理由がここに効く（Canvas なら全部あとから作り直しになる）。
 */
const makeFace = (variant: number): SVGSVGElement => {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${-FACE / 2} ${-FACE / 2} ${FACE} ${FACE}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', FIGURES[variant % FIGURES.length]());
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.1');
  // 札は 40px 前後まで小さくなる。viewBox 単位のままだとサブピクセルになって消える。
  path.setAttribute('vector-effect', 'non-scaling-stroke');

  svg.appendChild(path);
  return svg;
};

/**
 * 外周の目盛り。Orrery と同じ `ticks(72, 6)` ── 5° 刻み、30° ごとに長い罫。
 * 刻みは繋がっていないので「実線ではない」（要件 8）。
 * Orrery / IndexDial と同じ計器の言語なので、サイト全体と揃う。
 *
 * 座標は定数と四則だけで出る。sin/cos と違ってサーバーとブラウザでビットが一致するので、
 * ハイドレーションのための丸めは要らない。
 */
const RIM_TICKS = ticks(72, 6).map((tk) => (
  <line
    key={tk.angle}
    x1={0}
    y1={-(R_UNIT + 1.4)}
    x2={0}
    y2={-(R_UNIT + 1.4 + (tk.major ? 2.8 : 1.2))}
    transform={`rotate(${tk.angle})`}
    stroke="currentColor"
    strokeWidth={tk.major ? 1.1 : 0.6}
    vectorEffect="non-scaling-stroke"
    opacity={tk.major ? 0.45 : 0.18}
  />
));

export type RadialBurstStageProps = {
  /**
   * 札の向き。'radial' は進行方向へ整列（魅せる側）、'upright' は正立（作品を置く側）。
   * 当たり判定は外接円なので、切り替えても重なり保証は変わらない。
   */
  orientation?: 'radial' | 'upright';
  /**
   * true にすると札が外周に達しても消えない（作品版）。
   * 札が溜まり続けるので「時間とともに空く」前提が崩れる。**重なり保証は未検証。**
   */
  persist?: boolean;
};

/**
 * 中心から放射して消えていく札。
 *
 * 不可視の円がある。中心付近で札がふっと現れ、自分の角度の方向へ真っすぐ外へ滑る。
 * 外へ行くほど薄れ、あるものは途中で消え、あるものは外周まで届く。
 * **線は一本も引かれていない。中心も外周も、動きだけが図形を示す。**
 *
 * 幾何と発生の規則は lib/radial-burst.ts が全部持っている。ここは
 * 「R 比を px に掛けて DOM に書く」だけの機械。長さを R 比で持っているおかげで、
 * リサイズは掛ける数が変わるだけになり、状態を測り直さなくてよい。
 *
 * 連続的に湧き続けるエミッタはスクロールの scrub と相性が悪い
 * （scrub は「t を与えたら状態が一意に決まる」ことを要求する）ので、
 * Orrery / Paper Sphere と同じく pin: false ＋ Component にしている。
 */
export function RadialBurstStage({
  orientation = 'radial',
  persist = false,
}: RadialBurstStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const layer = layerRef.current;
    if (!host || !layer) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const burst = createBurst({ seed: Math.floor(Math.random() * 1e9), persist });
    const nodes = new Map<number, HTMLDivElement>();

    /** 盤の半径(px)。 */
    let R = 0;
    /** 札の寸法を書いたときの R。変わったときだけ書き直す（毎フレームのレイアウトを避ける）。 */
    let sizedAt = -1;

    const measure = () => {
      R = Math.min(host.clientWidth, host.clientHeight) * 0.4;
    };

    /** 生きている札に DOM を合わせる。 */
    const sync = () => {
      const resized = R !== sizedAt;
      const alive = new Set<number>();

      for (const c of burst.cards) {
        alive.add(c.id);
        let el = nodes.get(c.id);

        if (!el) {
          el = document.createElement('div');
          // Tailwind v4 はソースを文字列として走査する。この並びを 1 つの文字列リテラル
          // のまま置くこと。分割して連結するとクラスが生成されず、札が消える。
          el.className = 'absolute left-1/2 top-1/2 text-white/85';
          el.style.willChange = 'transform, opacity';
          el.style.opacity = '0';
          el.appendChild(makeFace(c.variant));
          layer.appendChild(el);
          nodes.set(c.id, el);
        } else if (!resized) {
          continue;
        }

        const px = c.size * R;
        el.style.width = `${px.toFixed(2)}px`;
        el.style.height = `${px.toFixed(2)}px`;
      }
      sizedAt = R;

      for (const [id, el] of nodes) {
        if (!alive.has(id)) {
          el.remove();
          nodes.delete(id);
        }
      }
    };

    /** 位置と濃さを書く。60fps で走るのはここだけ。state は一切触らない。 */
    const paint = () => {
      const t = burst.time;
      for (const c of burst.cards) {
        const el = nodes.get(c.id);
        if (!el) continue;

        const p = positionAt(c, t);
        // 画面は下が正だが、放射は回転対称なので符号を反転させる必要はない。
        // CSS の rotate も同じ向きに回るので、角度をそのまま渡せば進行方向に整列する。
        const deg = orientation === 'radial' ? (c.angle * 180) / Math.PI : 0;

        el.style.transform =
          `translate(-50%,-50%) translate(${(p.x * R).toFixed(2)}px,${(p.y * R).toFixed(2)}px)` +
          ` rotate(${deg.toFixed(2)}deg)`;
        el.style.opacity = opacityAt(c, t).toFixed(3);
      }
    };

    const ro = new ResizeObserver(() => {
      measure();
      sync();
      paint();
    });
    ro.observe(host);
    measure();

    const tick = (_time: number, delta: number) => {
      // タブ復帰の巨大な delta をそのまま渡すと一気に時間が飛ぶ。
      burst.step(Math.min(delta, 50) / 1000);
      sync();
      paint();
    };

    if (reduced) {
      // 動かさない。ただし何も無いと図が成立しないので、決まった時刻まで進めた 1 コマを置く。
      const dt = 1 / 60;
      for (let i = 0; i < Math.round(STILL_AT / dt); i++) burst.step(dt);
      sync();
      paint();
    } else {
      gsap.ticker.add(tick);
    }

    // 開発時のみ、コマ送りとエミッタの中身をコンソールから触れるようにする。
    // アニメーションは実際に動かさないと詰められないので。
    if (process.env.NODE_ENV !== 'production') {
      Object.assign(window as unknown as Record<string, unknown>, {
        radialBurst: {
          burst,
          step: (seconds: number) => {
            burst.step(seconds);
            sync();
            paint();
          },
        },
      });
    }

    return () => {
      ro.disconnect();
      gsap.ticker.remove(tick);
      for (const el of nodes.values()) el.remove();
      nodes.clear();
    };
  }, [orientation, persist]);

  return (
    <div
      ref={hostRef}
      // touch-none は付けない。ポインタ操作が無い上、画面いっぱいの要素に付けると
      // タッチでスクロールできなくなる（Paper Sphere と同じ判断）。
      className="relative aspect-square w-full max-w-[min(90vw,74vh)]"
    >
      {/* 濃度。中心がほのかに明るく外へ沈む。線を 1 本も引かないまま円が立つ（要件 8）。 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.075) 0%,' +
            ' rgba(255,255,255,0.032) 46%, rgba(255,255,255,0.008) 70%,' +
            ' rgba(255,255,255,0) 82%)',
        }}
      />

      {/* 外周の目盛り。 */}
      <svg
        viewBox="-50 -50 100 100"
        className="pointer-events-none absolute inset-0 h-full w-full text-white"
      >
        {RIM_TICKS}
      </svg>

      {/* 札はここに生える。client でしか生えないので初期 DOM は空 ──
          SSR 由来のハイドレーション不一致は起きない。
          data 属性は検証用の取っ手（クラス名の並びに依存せず掴めるように）。 */}
      <div ref={layerRef} data-burst-layer="" className="absolute inset-0" />
    </div>
  );
}

export const radialBurst: Experiment = {
  id: 'radial-burst',
  title: 'Radial Burst',
  tech: ['黄金角', '衝突予測', 'DOM + SVG'],
  note: '中心から放射して消えていく札。線は一本も引かれていない。中心も外周も動きだけが示す。',
  pin: false,
  Component: RadialBurstStage,
};
```

- [ ] **Step 2: `components/lab/registry.ts` に 1 行ずつ足す**

import の並びの末尾（`paperSphere` の次）に足す:

```ts
import { radialBurst } from './experiments/radial-burst';
```

配列の末尾（`paperSphere,` の次）に足す:

```ts
  paperSphere,
  radialBurst,
];
```

- [ ] **Step 3: 型チェックとビルドが通ることを確かめる**

```bash
rtk proxy npx tsc --noEmit
```

Expected: 出力なし・exit 0。

```bash
rtk proxy npx next build
```

Expected: `Compiled successfully`。**要約だけを見て「通った」と判断しないこと。**
`rtk proxy` で生の出力を取り、エラー件数ではなく内訳まで見る。

- [ ] **Step 4: 開発サーバーを立ち上げて、実際に見る**

Browser pane の `preview_start` に `{ name: "armillary-dev" }` を渡す（`.claude/launch.json` に定義済み）。
**`Bash` で `npm run dev` を起こさないこと。**

立ち上がったら `#radial-burst` へ移動する（`navigate` に `http://localhost:<port>/#radial-burst`）。

- [ ] **Step 5: コンソールとネットワークにエラーが出ていないことを確かめる**

`read_console_messages` を `onlyErrors: true` で読む。

Expected: 空。特に次が出ていないこと:

- ハイドレーション不一致（`Hydration failed` / `did not match`）── 目盛りの座標が原因なら
  `f()` 相当の丸めが要る。ただし定数と四則だけなので、出ないはず
- `ResizeObserver loop` 系の警告
- `createElementNS` 周りの `null` 参照

- [ ] **Step 6: 実際に動いているかを DOM から確かめる**

`javascript_tool` で次を評価する（`window.radialBurst` は開発ビルドでのみ生える）:

```js
(() => {
  const b = window.radialBurst.burst;
  const layer = document.querySelector('#radial-burst [data-burst-layer]');
  return {
    time: +b.time.toFixed(2),
    live: b.cards.length,
    spawned: b.stats.spawned,
    rejected: b.stats.rejected,
    skipped: b.stats.skipped,
    nodes: layer ? layer.children.length : -1,
    rate: +(b.stats.spawned / b.time).toFixed(2),
  };
})()
```

Expected: `live` が 8〜18 のあたり、`nodes === live`（DOM と状態が一致している）、
`rate` が 4.5〜5.6、`rejected > 0`。
`live` が 0 のままなら ticker が回っていない。`nodes !== live` なら `sync()` の取りこぼし。

- [ ] **Step 7: 見て判断する（自動確認では代わりにならない部分）**

`computer` の `screenshot` を撮る。設計書の「中心にある考え」と照らして次を見る:

- 中心付近でふっと現れ、外へ行くほど薄れているか
- 札が重なって見える瞬間が無いか（**目で見て 1 度でもあれば Task 3 の回帰テストが嘘をついている**）
- 片側がガラ空きに見える瞬間が無いか
- 線を引いていないのに円が立っているか（濃度＋外周の目盛り）
- 図版の線がサブピクセルで消えていないか

**速度カーブは仮決め（設計書の未着手）。** 減速で気持ち悪ければ、
`lib/radial-burst.ts` の `easeOut` を等速 `(u) => u` や加速 `(u) => u * u` に差し替えて
見比べる余地がある。差し替えた場合は `predictSteps` の係数 2（＝初速が平均の何倍か）も
合わせて見直すこと。等速なら 1、加速 `u²` なら 2。

- [ ] **Step 8: 画面幅を変えて崩れないことを確かめる**

`resize_window` で `mobile`（375×812）にしてから `desktop` に戻す。
`aspect-square w-full max-w-[min(90vw,74vh)]` なので、盤ごと縮むのが正しい挙動。
札の寸法も一緒に縮んでいるか（`sizedAt` の分岐が効いているか）を screenshot で見る。

**ついでに見ておくこと（今回は直さない）:** 実験がこれで 10 個になり、
IndexDial の弧が 1 本あたり細くなる。設計書の判断どおり**境界なので今回は触らず様子見**。
押しにくさが実際に出ているかどうかだけ観察して、Task 5 の未着手に書き残す。

- [ ] **Step 9: 開発サーバーを止める**

`preview_stop` に Step 4 で返った `serverId` を渡す。

- [ ] **Step 10: Commit**

```bash
git add components/lab/experiments/radial-burst.tsx components/lab/registry.ts && git commit -m "feat(radial-burst): DOM + SVG の描画とラボへの接続（実験 #10）"
```

---

### Task 5: 設計書の更新

設計書が正なので、実装で分かったことを設計書に返す。ここを飛ばすと次のセッションが
古い前提で動き出す。

**Files:**

- Modify: `docs/superpowers/specs/2026-08-28-radial-burst-design.md`

**Interfaces:**

- Consumes: Task 1〜4 の実測（`npm test` の出力、Task 4 Step 6 の読み取り、Step 7 の所見）
- Produces: なし（ドキュメントのみ）

- [ ] **Step 1: 状態を更新する**

4 行目を書き換える:

```markdown
状態: 実装済み（2026-08-28）
```

- [ ] **Step 2: 「確定値」節に、実装後の実測を追記する**

`実測（margin 1.18、5 シード × 120 秒）:` の段落の直後に、`npm test` で実際に出た値を
1 段落足す。設計時の測定は使い捨てスクリプトだったので、実装での再現値を並べて残す:

```markdown
実装後の再現（`lib/radial-burst.test.ts`、同条件）:
同時 **N.N 枚**、重なり **0**、発生 **N.N 枚/秒**、角度の最大の空き **平均 NN.N°**（最悪 NNN.N°）。
設計時の測定と N% 以内で一致した。
```

`N` は実際に測った値を入れること。値を取るには、Task 3 のテストの
`assert.ok(...)` のメッセージに出ている数字を使うか、テストを一時的に
`console.log(results)` して読む。**推測で書かないこと。**

- [ ] **Step 3: 「検証方法」節の最後の段落を書き換える**

現在こう書かれている:

```markdown
設計段階の測定は使い捨てのスクリプトで回した。実装時は `lib/radial-burst.ts` を
import する形で書き直し、リポジトリに残す。上の 4 項目がその内容。
```

これを実際の場所に置き換える:

```markdown
測定は `lib/radial-burst.test.ts` に残っている。`npm test` で回る
（Node 24 の組み込みランナー。テスト用の依存は足していない）。上の 4 項目がその内容。
```

- [ ] **Step 4: 「未着手」節を、実装で分かったことに合わせて更新する**

- **速度カーブ** — Task 4 Step 7 で実際に見た結果を書く。減速のままにしたのか、
  変えたのか。変えたなら `predictSteps` の係数も合わせたことを書く
- **タッチ環境** — Task 4 Step 8 で mobile 幅を見た結果を書く
- **`persist: true` の重なり保証** — 未検証のまま残す。ただし
  「`createBurst({ persist: true })` は実装済みで、札が消えないことのテストはある。
  重なり保証だけが未検証」と正確に書き直す

- [ ] **Step 5: 「積み残し」節の最後の 2 項目を更新する**

- 「実験が 10 個を超えると…**本実験でちょうど 10 個になる。**境界なので今回は触らず様子見」
  → Task 4 Step 8 で観察した結果を書き足す
- 「git 未初期化のため、この設計書はコミットしていない」
  → 既に git は初期化済み（`e3be095 初期インポート`）なので、この行を削除する

- [ ] **Step 6: `2026-08-27-lab-design.md` の積み残しも直す**

同じ「git 未初期化のため、この設計書はコミットしていない」の行が
`docs/superpowers/specs/2026-08-27-lab-design.md` の末尾にもある。こちらも削除する。
実験数の記述（`components/lab/experiments/*` の「現在 8 個」）も 10 個に直す。

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs && git commit -m "docs(radial-burst): 実装後の実測と、未着手の棚卸し"
```

---

## 完了の判定

全タスクが終わったら、次を**実際に走らせて出力を見てから**完了と言うこと。
要約だけを根拠にしないこと（`rtk proxy` で生の出力を取る）。

```bash
npm test
```

```bash
rtk proxy npx tsc --noEmit
```

```bash
rtk proxy npx next build
```

- [ ] `npm test` が 22 tests / `fail 0`
- [ ] `tsc --noEmit` が exit 0
- [ ] `next build` が `Compiled successfully`
- [ ] ブラウザで実際に見て、札が重なる瞬間が無い（Task 4 Step 7）
- [ ] `git status` がクリーン

そのうえで `superpowers:finishing-a-development-branch` で `main` への入れ方を決める。

## この計画が扱っていないこと

- **作品版（要件 9 / 「9 番への道筋」）** — `RadialBurstStage` に
  `orientation` / `persist` の口は開けるが、`orientation: 'upright'` と
  `persist: true` を使った作品版そのものは作らない。`persist` の重なり保証には
  別の設計が要る（設計書の未着手のとおり）
- **図版から実画像への差し替え** — 差し替え口（`makeFace`）は作るが、
  画像そのものは用意しない（生成環境が無い）
- **IndexDial の当たり判定の拡幅** — 10 個は境界なので今回は触らない（設計書の判断）
- **プロジェクト全体の積み残し**（`metadataBase`、OG 画像、未使用の
  `lib/motion-core.ts` と `components/ParticleBackground.tsx`、タッチで天体を掴む手段）
