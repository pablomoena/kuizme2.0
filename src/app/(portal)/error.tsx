'use client';

/**
 * Estado de error con reintento, para todo el portal.
 *
 * En la v1 había `isLoading` en 121 archivos y `isError` en cero: un fallo de red
 * se veía exactamente igual que "no hay datos", así que el usuario concluía que
 * su curso había desaparecido. Acá un fallo dice que falló y ofrece reintentar.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">No pudimos cargar esta página</h1>
        <p className="text-ink-muted">
          Puede ser un problema de conexión. Si vuelve a pasar, avísanos con el código de abajo.
        </p>
        {error.digest ? (
          <p className="text-sm text-ink-muted">
            Código: <code className="rounded bg-surface-muted px-1.5 py-0.5">{error.digest}</code>
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-brand px-4 py-2 font-medium text-brand-fg hover:bg-brand-hover"
      >
        Reintentar
      </button>
    </div>
  );
}
