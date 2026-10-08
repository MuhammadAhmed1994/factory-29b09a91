import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

// Written by the factory. The web foundation task may change the metadata, fonts and shell.
export const metadata: Metadata = {
  title: 'App',
  description: 'Built by the AI factory.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
