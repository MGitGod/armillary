import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINE,
  EYE_Z,
  MIN_SHIFT,
  STAGE_W,
  TARGET_Z,
  baselineAt,
  eyeXAt,
  layerDepth,
  readingAt,
  recoveredDepth,
  ridgeXAt,
  shiftAt,
  targetXAt,
} from './rangefinder.ts';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const PS = [0, 0.05, 0.25, 0.4, 0.5, 0.6, 0.75, 1];

test('機械は標的の深度を厳密に復元する', () => {
  // これがこの実験の主張そのもの。定数に潰れていたら失敗する。
  for (const p of PS) {
    const { depth } = readingAt(p);
    if (baselineAt(p) === 0) {
      assert.equal(depth, null, `p=${p} では基線が開いていないので未定義`);
      continue;
    }
    assert.ok(depth !== null, `p=${p} で読みが立たない`);
    assert.ok(near(depth as number, Math.abs(TARGET_Z), 1e-9),
      `p=${p} で ${depth}（期待 ${Math.abs(TARGET_Z)}）`);
  }
});

test('復元が定数の当てはめではなく、標的の深度に追従する', () => {
  // 「たまたま 430 が出ている」だけなら、TARGET_Z を変えても 430 のままになる。
  // recoveredDepth は純粋なので、別の深度の幾何を手で組んで確かめる。
  const t = (z: number) => EYE_Z / (EYE_Z - z);
  for (const z of [-120, -430, -900, -2000]) {
    const B = 300;
    // 消失点基準のずれ: Δθ = t'·B、t' = f/(f+|z|)
    const shift = B * (EYE_Z / (EYE_Z + Math.abs(z)));
    assert.ok(near(recoveredDepth(B, shift) as number, Math.abs(z), 1e-9),
      `z=${z} を復元できない`);
    // t = f/(f+|z|) < 1。奥の点は必ず視点のスクリーン座標へ向かって縮む
    assert.ok(t(z) < 1 && t(z) > 0, `t=${t(z)}`);
  }
});

test('基線は行程に比例して単調に伸びる', () => {
  // 初版は「中央からの距離×2」で 600→0→600 の V 字になり、
  // 死角が区間の中央に来ていた。単調性がその再発を止める。
  let prev = -Infinity;
  for (const p of PS) {
    const B = baselineAt(p);
    assert.ok(B > prev || p === 0, `p=${p} で基線が増えていない`);
    prev = B;
  }
  assert.equal(baselineAt(0), 0);
  assert.equal(baselineAt(1), BASELINE);
});

test('ずれ角も単調で、基線に比例する', () => {
  // Δθ = t·B なので、Δθ/B は行程によらず一定になるはず。
  const ratios = PS.filter((p) => p > 0).map((p) => shiftAt(p) / baselineAt(p));
  for (const r of ratios) assert.ok(near(r, ratios[0], 1e-12));
  // その比は t = f/(f+|Z|)
  assert.ok(near(ratios[0], EYE_Z / (EYE_Z + Math.abs(TARGET_Z)), 1e-12));
  assert.equal(shiftAt(0), 0);
});

test('ずれが大きいほど近い（d = B/θ と同じ向き）', () => {
  // 初版は逆だった。単調性の向きがこの実験の式そのもの。
  const B = 300;
  const a = recoveredDepth(B, 40) as number;
  const b = recoveredDepth(B, 80) as number;
  assert.ok(b < a, `ずれが倍なら近くなるはず: ${a} → ${b}`);
});

test('基線が開くまでは本当に未定義', () => {
  assert.equal(recoveredDepth(0, 0), null);
  assert.equal(recoveredDepth(0.4, MIN_SHIFT), null, '境界は開かない');
  assert.ok(recoveredDepth(1, MIN_SHIFT + 1e-9) !== null, '境界を超えたら開く');
  const { depth } = readingAt(0);
  assert.equal(depth, null);
});

test('静止画（行程 0）の読み値が実験の初期表示と一致する', () => {
  // render() が焼き込む "0" / "0.000" / "—" と同じであること。
  const { B, shift, depth } = readingAt(0);
  assert.equal(B.toFixed(0), '0');
  assert.equal(shift.toFixed(3), '0.000');
  assert.equal(depth, null);
});

test('稜線の行程 0 の位置が、ばねの初期値として使える形で出る', () => {
  // render() と build() が同じ式を二度評価する形を保証する。
  // 4 層とも負の x（視点が基線の左端に居るので左へ寄る）で、奥ほど大きくずれる。
  const zs = [0, 1 / 3, 2 / 3, 1];
  const xs = zs.map((z) => ridgeXAt(0, z));
  for (const x of xs) assert.ok(x < 0);
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] < xs[i - 1], `z=${zs[i]} が手前より奥へずれていない`);
  }
  // 中央（p=0.5）では視点が正面なのでずれない
  for (const z of zs) assert.ok(near(ridgeXAt(0.5, z), 0));
});

test('投影に渡す深度はすべて負。除算が発散しない', () => {
  // projectOffAxis は pz = eye.z で発散する。呼び出し元の責任として固定しておく。
  for (const z of [0, 1 / 3, 2 / 3, 1]) assert.ok(layerDepth(z) < 0);
  assert.ok(TARGET_Z < 0);
  assert.ok(EYE_Z > 0);
  for (const z of [layerDepth(0), layerDepth(1), TARGET_Z]) {
    assert.ok(EYE_Z - z > EYE_Z, '分母が視点距離を下回らない');
  }
});

test('観測者は基線の左端から右端へ移動する', () => {
  assert.ok(near(eyeXAt(0), -BASELINE / 2));
  assert.ok(near(eyeXAt(0.5), 0));
  assert.ok(near(eyeXAt(1), BASELINE / 2));
  assert.equal(EYE_Z, STAGE_W * 1.3);
});

test('標的はレチクル中心を横切る', () => {
  // 行程の前半は左、中央で 0、後半は右。横切らないと測距の絵にならない。
  assert.ok(targetXAt(0) < 0);
  assert.ok(near(targetXAt(0.5), 0));
  assert.ok(targetXAt(1) > 0);
});
