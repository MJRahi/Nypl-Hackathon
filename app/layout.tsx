import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeaseLens NYC',
  description: 'Building risk reports for NYC renters, built from NYC Open Data.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
