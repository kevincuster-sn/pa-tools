import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PA Tools',
  description: 'Workbench for ServiceNow Platform Architects',
};

// Runs before paint. Dark is the default; light or system are only applied
// when the user has explicitly chosen them.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('pa-tools.theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}else if(t==='system'){/* let prefers-color-scheme decide */}else{document.documentElement.setAttribute('data-theme','dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="h-full bg-bg text-fg">{children}</body>
    </html>
  );
}
