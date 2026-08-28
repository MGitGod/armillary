import React from 'react';

/**
 * lib/content.ts の [角括弧] を未入力プレースホルダとして可視化する。
 *
 * 括弧付きのまま → 点線＋琥珀色でハイライト（埋め忘れが目で分かる）
 * 括弧を外す     → ただの本文になり、ハイライトは自動的に消える
 *
 * Server Component。フックを使っていないのでどのページからでも呼べる。
 */

const PLACEHOLDER = /(\[[^\]]+\])/g;

const mark = (text: string, keyPrefix: string) =>
  text.split(PLACEHOLDER).map((part, i) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <span
        key={`${keyPrefix}-${i}`}
        // 未入力であることが一目で分かる最小限の装飾。本文の組版は崩さない。
        className="text-amber-300/80 underline decoration-dotted decoration-amber-300/40 underline-offset-4"
        title="lib/content.ts の未入力箇所"
      >
        {part}
      </span>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
    ),
  );

/** インライン用。1 行のテキストをそのまま置き換える。 */
export function Fill({ children }: { children: string }) {
  return <>{mark(children, 'f')}</>;
}

/** 複数段落用。空行で <p> に分割し、単独の改行は <br> にする。 */
export function FillBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const paragraphs = children.split(/\n{2,}/);

  return (
    <>
      {paragraphs.map((para, pi) => (
        <p key={pi} className={className}>
          {para.split('\n').map((line, li) => (
            <React.Fragment key={li}>
              {li > 0 && <br />}
              {mark(line, `b-${pi}-${li}`)}
            </React.Fragment>
          ))}
        </p>
      ))}
    </>
  );
}
