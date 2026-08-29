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
