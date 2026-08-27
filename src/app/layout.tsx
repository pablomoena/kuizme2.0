import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Kuizme', template: '%s · Kuizme' },
  description: 'Plataforma de cursos y evaluaciones en línea para instituciones de LATAM.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang="es": en v1 el HTML declaraba inglés, así que el navegador mostraba los
  // errores de validación de formularios en inglés a usuarios hispanohablantes.
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
