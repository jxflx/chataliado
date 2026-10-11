import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AmbientCanvas } from '@/components/layout/ambient-canvas';

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ChatAliado — Dashboard Administrativo & KDS',
  description: 'Plataforma multi-tenant de automatizacion y gestion para restaurantes',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-[#FAF8F5] text-ink-primary font-sans antialiased selection:bg-jade-subtle selection:text-jade relative overflow-hidden">
        {/* Ambient Chromatic Canvas and Film Grain (Liquid Glass) */}
        <AmbientCanvas />

        {/* Children (Dashboard / Auth / etc.) */}
        <div className="relative z-10 h-full w-full">
          {children}
        </div>
      </body>
    </html>
  );
}
