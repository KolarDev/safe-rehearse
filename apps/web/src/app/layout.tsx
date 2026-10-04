import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'SafeRehearse',
  description: 'AI learning and practice for frontline social-care training.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-contrast">
                SR
              </span>
              <span className="text-[15px] font-semibold tracking-tight">SafeRehearse</span>
            </Link>
            <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted">
              Development build
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
