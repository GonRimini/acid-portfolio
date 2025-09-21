import type { Metadata, Viewport } from 'next'
import './fonts.css'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'ACID',
  description: 'Created with v0',
  generator: 'v0.dev',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style>{`
html {
  font-family: "Helvetica Light", "Helvetica", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", Arial, sans-serif;
  font-weight: 300;
  --font-sans: "Helvetica Light", "Helvetica", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", Arial, sans-serif;
  --font-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
}
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
