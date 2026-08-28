import type { Metadata } from 'next';
import { requireOrgAdmin } from '@/lib/auth/guard';
import { listarIntegraciones } from '@/lib/integrations/queries';
import { explicarEstado } from '@/lib/integrations/proveedores';

export const metadata: Metadata = { title: 'Integraciones' };

const FECHA = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

const TONO: Record<'ok' | 'aviso' | 'error' | 'neutro', string> = {
  ok: 'border-success/40 text-success',
  aviso: 'border-warning/40 text-warning',
  error: 'border-danger/40 text-danger',
  neutro: 'border-line text-ink-muted',
};

/**
 * La zona de integraciones del tenant.
 *
 * requireOrgAdmin, no requireStaff: un instructor edita contenido pero no conecta
 * la cuenta de la institución ni ve con qué correo quedó conectada. Y la
 * comprobación es conveniencia, no la garantía: la política de `integrations`
 * también la limita al org_admin, así que si esta página se olvidara la regla, la
 * base seguiría devolviendo cero filas.
 */
export default async function IntegracionesPage() {
  const session = await requireOrgAdmin();
  const result = await listarIntegraciones(session.organization.id);

  if (result.error !== null) {
    return (
      <div role="alert" className="flex flex-col gap-3 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-danger">No pudimos cargar las integraciones.</p>
        <p className="text-sm text-ink-muted">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-ink-muted">
          Conecta las cuentas de {session.organization.name} con los servicios que ya usa. Cada
          institución conecta las suyas: Kuizme no comparte cuentas entre instituciones.
        </p>
      </header>

      <ul className="flex flex-col gap-4">
        {result.data.map(({ ficha, estado, cuenta, conectadaEl, expiraEn, ultimoError }) => {
          const explicacion = explicarEstado(estado, expiraEn ? new Date(expiraEn) : null);

          return (
            <li key={ficha.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-medium">{ficha.nombre}</h2>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${TONO[explicacion.tono]}`}
                >
                  {explicacion.titulo}
                </span>
                {cuenta ? <span className="text-sm text-ink-muted">{cuenta}</span> : null}
                {conectadaEl ? (
                  <span className="ml-auto text-xs text-ink-muted">
                    desde el {FECHA.format(new Date(conectadaEl))}
                  </span>
                ) : null}
              </div>

              <p className="text-sm">{ficha.paraQue}</p>

              {explicacion.detalle ? (
                <p className="text-sm text-ink-muted">{explicacion.detalle}</p>
              ) : null}

              {/* El error del proveedor se muestra tal cual: un "algo falló" sin
                  el detalle obliga a escribir a soporte para saber qué pasó. */}
              {ultimoError ? (
                <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm">
                  {ultimoError}
                </p>
              ) : null}

              {ficha.permisos.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-muted">
                    Qué permisos se le piden a tu cuenta
                  </summary>
                  {/* Enumerados en claro. Pedir permisos sin decir cuáles es lo
                      que hace que nadie los lea. */}
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink-muted">
                    {ficha.permisos.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {ficha.disponible ? (
                <p className="text-sm text-ink-muted">
                  {/* El botón de conectar entra con el adaptador del proveedor. */}
                  Listo para conectar.
                </p>
              ) : (
                <p className="rounded-md border border-dashed border-line px-3 py-2 text-sm text-ink-muted">
                  Todavía no se puede conectar. {ficha.porQueNo}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-ink-muted">
        Los permisos que concedas quedan guardados cifrados y no son legibles desde el navegador,
        ni por ti ni por nadie de Kuizme sin acceso al servidor. Puedes retirarlos cuando quieras,
        desde aquí o desde la cuenta del proveedor.
      </p>
    </div>
  );
}
