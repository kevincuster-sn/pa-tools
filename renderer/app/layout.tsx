import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PA Tools',
  description: 'Workbench for ServiceNow Platform Architects',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
