import React from 'react';

/** 計器の四隅に置く小さな読み取り値。ラボ全体で同じ組み方にする。 */
export function Corner({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`pointer-events-none absolute max-w-[14rem] font-mono text-[10px] leading-relaxed ${className}`}
    >
      <div className="mb-1 tracking-[0.3em] text-white/25">{label}</div>
      <div className="tracking-wider text-white/60">{children}</div>
    </div>
  );
}
