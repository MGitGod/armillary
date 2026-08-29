import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIDGE_FOOT,
  approach,
  rateFromPerFrame,
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

test('approach は 60fps では従来の per-frame 係数と一致する', () => {
  // 既存の見た目を変えずに dt 対応へ移せることの確認。
  for (const f of [0.1, 0.16, 0.14]) {
    const rate = rateFromPerFrame(f);
    const stepped = approach(0, 1, rate, 1 / 60);
    assert.ok(near(stepped, f, 1e-12), `f=${f} で ${stepped}`);
  }
});

test('approach はフレームレートを変えても同じ時間で同じところへ行く', () => {
  // これが per-frame 係数との本質的な違い。
  // 差が出るのは収束の途中なので、1 秒ではなく 0.1 秒で見る
  // （1 秒後は per-frame でも両方ほぼ収束していて差が 0.005 しかない）。
  const SECS = 0.1;
  const rate = rateFromPerFrame(0.16);
  // 刻み数から dt を出す。フレーム数を丸めると経過時間そのものがずれて、
  // approach ではなくテストの端数を測ることになる（実際に一度そうなった）。
  const run = (steps: number) => {
    let x = 0;
    for (let i = 0; i < steps; i++) x = approach(x, 1, rate, SECS / steps);
    return x;
  };
  const a = run(3), b = run(6), c = run(15);   // 30 / 60 / 144fps 相当
  assert.ok(Math.abs(a - c) < 1e-12, `fps で結果が変わってはいけない: ${a} / ${b} / ${c}`);

  // 対照: per-frame 固定だと同じ 0.1 秒で 0.41 と 0.91 に割れる
  const perFrame = (steps: number) => {
    let x = 0;
    for (let i = 0; i < steps; i++) x += (1 - x) * 0.16;
    return x;
  };
  assert.ok(Math.abs(perFrame(3) - perFrame(15)) > 0.4,
    `per-frame は割れるはず: ${perFrame(3)} / ${perFrame(15)}`);
});

test('approach は目標を通り過ぎない', () => {
  const rate = rateFromPerFrame(0.16);
  // 極端に大きい dt でも行き過ぎない（1 − exp(−rate·dt) は 1 を超えない）
  for (const dt of [1 / 144, 1 / 60, 0.05, 1, 10]) {
    const x = approach(0, 1, rate, dt);
    assert.ok(x <= 1 + 1e-12 && x >= 0, `dt=${dt} で ${x}`);
  }
  assert.ok(near(approach(5, 5, rate, 1 / 60), 5), '目標に居るなら動かない');
});
