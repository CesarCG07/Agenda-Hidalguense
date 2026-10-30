import './globals.css';
import Shell from './Shell';

export const metadata = {
  title: 'Agenda Hidalguense',
  description: 'Citas de mastografía y servicios de atención de la Fundación Hidalguense',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600&display=swap" />
      </head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
