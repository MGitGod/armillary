/**
 * @file content.ts
 * @description サイトの中身は全部ここ。ページ側は一切ハードコードしていない。
 *
 * ---------------------------------------------------------------------------
 * 使い方: 角括弧 [ ] で囲まれた文字列が未入力のプレースホルダ。
 *   画面上では点線＋琥珀色でハイライトされるので、埋め忘れが目で分かる。
 *   括弧を外して普通の文にすれば、ハイライトは自動的に消える。
 * ---------------------------------------------------------------------------
 */

export type Project = {
  /** URL になる。半角英数とハイフンのみ。 */
  slug: string;
  title: string;
  client: string;
  /** 表示用。'2026' や '2025 — 2026' のような自由文字列。 */
  year: string;
  /** 担当領域。3〜4 個までが読みやすい。 */
  roles: string[];
  /** 一覧カードに出る 1〜2 文。 */
  summary: string;
  /** public/ からの絶対パス。未指定なら幾何学プレースホルダが描画される。 */
  cover?: string;
  /** トップページの Selected Work に出す。2〜3 本まで。 */
  featured?: boolean;

  // --- ケーススタディ本文 ---
  /** 何が問題だったか。 */
  problem: string;
  /** どう解いたか。ここが一番読まれる。 */
  approach: string;
  /** 結果。数字が出せるなら数字で。 */
  outcome: string;
  stack?: string[];
  link?: { label: string; href: string };
};

export const site = {
  name: '[YOUR NAME]',
  /** ヒーローの大見出し。italic 部分はセリフ体で組まれる。 */
  headline: { lead: 'Crafting the', accent: 'Uncommon.' },
  tagline:
    'Designing at the intersection of logic and imagination.\nI build digital experiences that linger in the mind.',
  /** About ページ本文。空行で段落が分かれる。 */
  about:
    '[ここに自己紹介を 2〜3 段落。何をやってきた人で、いま何に興味があるのか。]\n\n[得意領域と、仕事の進め方。クライアントが「この人に頼むとどうなるか」を想像できる粒度で。]',
  email: '[you@example.com]',
  location: '[Tokyo, Japan]',
  /** ラボの終端に出すリンク。見た人がそのままコードを読みに行ける先。 */
  source: 'https://github.com/MGitGod/armillary',
  /** 空配列にすればフッターから消える。 */
  socials: [
    { label: 'GitHub', href: 'https://github.com/MGitGod' },
    { label: 'X', href: '[https://x.com/yourname]' },
  ],
} as const;

/**
 * Orrery（ラボの入口）に浮かべる天体。ラボの棚をテーマごとに 4 つに束ねたもの。
 * 内側の軌道から順に、ページの並び順と揃えてある。
 * title は選んだときに大見出しとして組まれるので短い英語、summary は左下の欄に出る。
 */
export type LabGroup = { id: string; title: string; summary: string };

export const labGroups: LabGroup[] = [
  {
    id: 'curves',
    title: 'Curves',
    summary: '#03–05 Rhodonea / Lissajous / Convergence。式の係数をスクロールで回し、図形が閉じる・止まる瞬間を見る。',
  },
  {
    id: 'type-and-veil',
    title: 'Type & Veil',
    summary: '#02, #06–08 Type Gravity / Shutter / Curtain / Masked Lines。文字と面の出し方。落とす・開く・拭う・立ち上げる。',
  },
  {
    id: 'particles',
    title: 'Particles',
    summary: '#09–10 Paper Sphere / Radial Burst。たくさんの粒に規則を与える。ばね、黄金角、衝突予測。',
  },
  {
    id: 'parallax',
    title: 'Parallax',
    summary: '#11–15 奥行きの手がかりを一つずつ分解し、最後に測距儀として組み上げる。',
  },
];

export const projects: Project[] = [
  {
    slug: 'project-one',
    title: '[プロジェクト名 1]',
    client: '[クライアント名]',
    year: '2026',
    roles: ['[Art Direction]', '[Frontend]'],
    summary: '[このプロジェクトが何だったのかを 1〜2 文で。一覧で最初に読まれる部分。]',
    featured: true,
    problem: '[着手前に何が問題だったか。依頼の背景。]',
    approach: '[どう解いたか。判断の理由まで書けると強い。ここが一番読まれる。]',
    outcome: '[結果。数字が出せるなら数字で。出せないなら定性的な変化で。]',
    stack: ['[Next.js]', '[GSAP]'],
  },
  {
    slug: 'project-two',
    title: '[プロジェクト名 2]',
    client: '[クライアント名]',
    year: '2025',
    roles: ['[Design System]', '[Frontend]'],
    summary: '[このプロジェクトが何だったのかを 1〜2 文で。]',
    featured: true,
    problem: '[着手前に何が問題だったか。]',
    approach: '[どう解いたか。]',
    outcome: '[結果。]',
    stack: ['[TypeScript]', '[Tailwind]'],
  },
  {
    slug: 'project-three',
    title: '[プロジェクト名 3]',
    client: '[クライアント名]',
    year: '2025',
    roles: ['[Interaction]'],
    summary: '[このプロジェクトが何だったのかを 1〜2 文で。]',
    problem: '[着手前に何が問題だったか。]',
    approach: '[どう解いたか。]',
    outcome: '[結果。]',
  },
  {
    slug: 'project-four',
    title: '[プロジェクト名 4]',
    client: '[クライアント名]',
    year: '2024',
    roles: ['[Frontend]'],
    summary: '[このプロジェクトが何だったのかを 1〜2 文で。]',
    problem: '[着手前に何が問題だったか。]',
    approach: '[どう解いたか。]',
    outcome: '[結果。]',
  },
];

/** トップページの幾何学セクションに出る、扱える領域。 */
export const capabilities = [
  { title: '[Direction]', desc: '[この領域で何ができるか。]' },
  { title: '[Interface]', desc: '[この領域で何ができるか。]' },
  { title: '[Motion]', desc: '[この領域で何ができるか。]' },
  { title: '[Systems]', desc: '[この領域で何ができるか。]' },
  { title: '[Frontend]', desc: '[この領域で何ができるか。]' },
  { title: '[Prototype]', desc: '[この領域で何ができるか。]' },
];

export const getProject = (slug: string) => projects.find((p) => p.slug === slug);

export const featuredProjects = () => projects.filter((p) => p.featured);

/** 文字列に未入力プレースホルダが残っているか。 */
export const hasPlaceholder = (text: string) => /\[[^\]]+\]/.test(text);
