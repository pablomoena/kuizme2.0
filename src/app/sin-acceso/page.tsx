import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/login/actions';

export const metadata: Metadata = { title: 'Sin acceso' };

/**
 * Un solo mensaje para "la organización no existe" y "no eres miembro". No es
 * pereza: distinguirlos convertiría los subdominios en un directorio de
 * instituciones que cualquiera podría recorrer.
 */
const MOTIVOS: Record<string, { titulo: string; detalle: string }> = {
  'no-membership': {
    titulo: 'No tienes acceso a este portal',
    detalle:
      'Tu cuenta existe, pero no pertenece a esta institución. Si crees que debería, pídele a quien administra la institución que te invite.',
  },
  'organization-suspended': {
    titulo: 'Este portal está temporalmente cerrado',
    detalle:
      'La institución tiene su cuenta suspendida. Quien la administra puede reactivarla; mientras tanto nadie puede entrar.',
  },
  'solo-staff': {
    titulo: 'Esta sección es para el equipo docente',
    detalle: 'Tu cuenta es de alumno. Desde el panel puedes ver tus cursos y tus evaluaciones.',
  },
};

const POR_DEFECTO = {
  titulo: 'No tienes acceso',
  detalle: 'No pudimos verificar tu acceso a esta sección.',
};

export default async function SinAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const { titulo, detalle } = (motivo && MOTIVOS[motivo]) || POR_DEFECTO;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{titulo}</h1>
        <p className="text-ink-muted">{detalle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/panel"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-surface-muted"
        >
          Ir al panel
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Salir de la cuenta
          </button>
        </form>
      </div>
    </main>
  );
}
