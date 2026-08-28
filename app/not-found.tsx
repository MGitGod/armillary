import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-4xl flex-col justify-center px-6 text-center">
      <p className="font-mono text-xs tracking-[0.4em] text-white/30">404</p>

      <h1 className="mt-6 text-4xl font-bold leading-none tracking-tighter text-white md:text-6xl">
        Nothing <span className="font-serif italic">here</span>.
      </h1>

      <p className="mt-5 text-white/50">
        The page you are looking for does not exist.
      </p>

      <div className="mt-10">
        <Link
          href="/"
          className="inline-block rounded-full border border-white/30 px-8 py-3 font-medium text-white transition-colors hover:border-white/60"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
