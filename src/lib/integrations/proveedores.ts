import type { Enum } from '@/lib/db/types';

/**
 * El catálogo de proveedores.
 *
 * Puro y en un solo sitio porque la promesa es "de a poco desarrollamos más
 * integraciones": cada proveedor nuevo tiene que ser una entrada acá y un
 * adaptador, no una migración ni una pantalla nueva.
 *
 * `disponible` dice si el código YA puede conectar. Un proveedor listado pero no
 * disponible se muestra igual, con el motivo: enseñar a dónde va el producto es
 * útil, y un botón que no funciona no lo es.
 */

export type Proveedor = Enum<'integration_provider'>;
export type EstadoIntegracion = Enum<'integration_status'>;

export type FichaProveedor = {
  id: Proveedor;
  nombre: string;
  /** Qué gana la institución al conectarlo. En su idioma, no en el nuestro. */
  paraQue: string;
  /** Qué permisos se le piden a la cuenta, dicho en claro. */
  permisos: string[];
  disponible: boolean;
  /** Si no está disponible, por qué. Null cuando lo está. */
  porQueNo: string | null;
};

export const PROVEEDORES: FichaProveedor[] = [
  {
    id: 'zoom',
    nombre: 'Zoom',
    paraQue:
      'Las clases en vivo se crean solas en la cuenta de Zoom de tu institución, con el enlace ya puesto en la lección.',
    permisos: [
      'Crear y actualizar reuniones',
      'Leer el nombre y el correo de la cuenta',
      'Consultar las grabaciones de esas reuniones',
    ],
    disponible: false,
    porQueNo:
      'Falta registrar la app de Kuizme en el Marketplace de Zoom. La bóveda y el flujo ya están listos para recibirla.',
  },
  {
    id: 'mercado_pago',
    nombre: 'Mercado Pago',
    paraQue:
      'Los alumnos pagan su matrícula y el dinero entra directo a la cuenta de tu institución. Kuizme nunca lo retiene.',
    permisos: ['Crear preferencias de pago', 'Recibir avisos de pago aprobado'],
    disponible: false,
    porQueNo: 'Pendiente de diseño y validación antes de escribir código.',
  },
  {
    id: 'hubspot',
    nombre: 'HubSpot',
    paraQue:
      'Los contactos y las matrículas se sincronizan con tu CRM, sin exportar planillas a mano.',
    permisos: ['Crear y actualizar contactos'],
    disponible: false,
    porQueNo: 'Pendiente. Va después de Zoom y Mercado Pago.',
  },
];

export function fichaDe(id: Proveedor): FichaProveedor {
  const ficha = PROVEEDORES.find((p) => p.id === id);
  // No se lanza: un proveedor en la base que no está en el catálogo es un
  // despliegue a medias, y dejar la pantalla en blanco sería peor que mostrarlo
  // con su identificador.
  return (
    ficha ?? {
      id,
      nombre: id,
      paraQue: 'Integración no reconocida por esta versión de la aplicación.',
      permisos: [],
      disponible: false,
      porQueNo: 'Esta versión no conoce este proveedor. Recarga o avisa a soporte.',
    }
  );
}

/**
 * Qué se le dice al administrador sobre el estado de una conexión.
 *
 * `expired` y `error` se separan porque piden cosas distintas: lo primero se
 * arregla solo al renovar el token, lo segundo necesita que alguien mire.
 */
export function explicarEstado(
  estado: EstadoIntegracion,
  expiraEn: Date | null,
  ahora: Date = new Date(),
): { titulo: string; detalle: string | null; tono: 'ok' | 'aviso' | 'error' | 'neutro' } {
  switch (estado) {
    case 'connected': {
      // Un token que vence en menos de una hora es lo normal en Zoom y se renueva
      // solo. No se avisa: sería alarmar por el funcionamiento correcto.
      if (expiraEn && expiraEn.getTime() <= ahora.getTime()) {
        return {
          titulo: 'Conectada',
          detalle: 'El permiso está por renovarse. No hace falta que hagas nada.',
          tono: 'ok',
        };
      }
      return { titulo: 'Conectada', detalle: null, tono: 'ok' };
    }
    case 'expired':
      return {
        titulo: 'Hay que volver a conectarla',
        detalle: 'El permiso caducó y no se pudo renovar. Vuelve a conectar la cuenta.',
        tono: 'aviso',
      };
    case 'revoked':
      return {
        titulo: 'Desconectada desde el proveedor',
        detalle:
          'Alguien retiró el permiso desde la cuenta del proveedor. Vuelve a conectarla cuando quieras.',
        tono: 'aviso',
      };
    case 'error':
      return {
        titulo: 'Algo falló',
        detalle: 'La última operación con el proveedor dio error. Revisa el detalle y reintenta.',
        tono: 'error',
      };
    case 'disconnected':
      return { titulo: 'Sin conectar', detalle: null, tono: 'neutro' };
  }
}

/**
 * Valida a dónde volver después del OAuth.
 *
 * Solo rutas internas. Un `redirect_to` que acepte una URL absoluta es un
 * redirect abierto, y en medio de un flujo de OAuth eso es cómo se roba un
 * código de autorización: el proveedor redirige al atacante con el código en la
 * URL. Se aceptan rutas que empiezan por una sola barra y no por dos —`//otro.cl`
 * es una URL absoluta con esquema implícito, y es el caso que se olvida.
 */
export function rutaInternaSegura(destino: string | null | undefined, porDefecto: string): string {
  if (!destino) return porDefecto;
  if (!destino.startsWith('/')) return porDefecto;
  if (destino.startsWith('//')) return porDefecto;
  // `/\` lo normalizan algunos navegadores a `//`, así que se descarta también.
  if (destino.startsWith('/\\')) return porDefecto;
  if (destino.includes('://')) return porDefecto;
  return destino;
}
