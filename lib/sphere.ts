/**
 * @file sphere.ts
 * @description 球面上の配置・回転・透視投影・面の向き。純粋関数だけ。
 *
 * Canvas に自前で 3D を描くための最小限。ライブラリを足さずに済ませる。
 */

export type Vec3 = { x: number; y: number; z: number };

export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const length = (v: Vec3) => Math.sqrt(dot(v, v));

export const normalize = (v: Vec3): Vec3 => {
  const len = length(v) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

export const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/**
 * フィボナッチ球（黄金角スパイラル）。
 *
 * 緯度経度で等分割すると極に点が密集するが、この方法なら
 * 何個でも球面にほぼ均一に散る。Orrery の位相分散と同じ黄金角の理屈。
 */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const fibonacciSphere = (count: number): Vec3[] =>
  Array.from({ length: count }, (_, i) => {
    // y を -1..1 に等間隔で刻むと、球面上では面積が均一になる
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  });

export const rotateX = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
};

export const rotateY = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
};

/**
 * 法線に垂直な正規直交基底。四角い紙の 2 辺になる。
 * 法線と平行になりにくい基準ベクトルを選んでから外積を 2 回。
 */
export const tangentBasis = (n: Vec3): { u: Vec3; v: Vec3 } => {
  const ref: Vec3 = Math.abs(n.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(ref, n));
  return { u, v: cross(n, u) };
};

/**
 * 透視投影。focal が小さいほど遠近が強い。
 * カメラは +z 側にあり、-z が奥。
 */
export const project = (v: Vec3, focal: number) => {
  const k = focal / (focal + v.z);
  return { x: v.x * k, y: v.y * k, k };
};

/** カメラ方向（0,0,1）との内積。正なら表を向いている。 */
export const facing = (n: Vec3) => n.z;

/** ランバート反射。負の側は 0 に潰す。 */
export const lambert = (n: Vec3, lightDir: Vec3) => Math.max(0, dot(n, lightDir));
