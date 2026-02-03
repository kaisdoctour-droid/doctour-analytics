import './globals.css';

export const metadata = {
  title: 'DOCTOUR Analytics PRO v9',
  description: 'Application de pilotage commercial temps réel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="bg-slate-900 text-white antialiased">{children}</body>
    </html>
  );
}
