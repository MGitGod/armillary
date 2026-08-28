import type { Metadata } from 'next'
import './globals.css'
import { sans, serif, mono } from '../lib/fonts'
import ParticleBackground from '../components/ParticleBackground'

export const metadata: Metadata = {
  // 本番ドメインが決まったら差し替える。OG 画像の絶対 URL 生成に使われる。
  metadataBase: new URL('https://example.com'),
  title: 'Orrery — Portfolio',
  description: 'A portfolio you operate, not scroll.',
  openGraph: {
    type: 'website',
    title: 'Orrery — Portfolio',
    description: 'A portfolio you operate, not scroll.',
  },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body className="bg-black text-white antialiased">
        {/* 星野。fixed inset-0 / z-0 で全面の地になる。 */}
        <ParticleBackground />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  )
}
