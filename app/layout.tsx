import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Warm List: Pulse Monitor',
  description: 'Account signals for Arjun, checked every Monday and Thursday',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
