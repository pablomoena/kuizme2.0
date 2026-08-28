import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cifrar y descifrar los tokens de las integraciones.
 *
 * Vive en la aplicación y no en la base a propósito. La base **nunca ve la
 * llave**: si alguien obtiene un respaldo de Postgres, obtiene bytes y nada más.
 * Con `pgp_sym_encrypt` la llave viajaría dentro de cada sentencia SQL, y una
 * sentencia se registra, se muestra en `pg_stat_activity` y aparece en el log de
 * errores lento.
 *
 * AES-256-GCM y no CBC: GCM autentica. Un token alterado falla al descifrar en
 * vez de devolver basura que después se manda al proveedor.
 *
 * Formato: `v1.<nonce base64url>.<ciphertext+tag base64url>`. La versión va
 * delante para poder rotar de algoritmo sin adivinar qué es cada fila.
 */

const VERSION = 'v1';
const NONCE_BYTES = 12; // 96 bits, el tamaño que GCM espera
const KEY_BYTES = 32; // AES-256

export class ErrorDeCifrado extends Error {}

/**
 * Convierte la llave del entorno en bytes.
 *
 * Se exige base64 de 32 bytes exactos, no una frase: una contraseña corta usada
 * como llave da 256 bits de los cuales la mitad son predecibles. Que falle acá,
 * al arrancar, es mucho mejor que cifrar un año con una llave débil.
 */
export function llaveDesde(valor: string | undefined): Buffer {
  if (!valor || valor.length === 0) {
    throw new ErrorDeCifrado(
      'Falta INTEGRATIONS_ENCRYPTION_KEY. Genérala con: openssl rand -base64 32',
    );
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(valor, 'base64');
  } catch {
    throw new ErrorDeCifrado('INTEGRATIONS_ENCRYPTION_KEY no es base64 válido.');
  }

  if (bytes.length !== KEY_BYTES) {
    throw new ErrorDeCifrado(
      `INTEGRATIONS_ENCRYPTION_KEY tiene ${bytes.length} bytes y necesita ${KEY_BYTES}. ` +
        'Genérala con: openssl rand -base64 32',
    );
  }

  return bytes;
}

export function cifrar(textoPlano: string, llave: Buffer): string {
  if (llave.length !== KEY_BYTES) {
    throw new ErrorDeCifrado(`La llave tiene ${llave.length} bytes y necesita ${KEY_BYTES}.`);
  }

  // Un nonce nuevo por cada cifrado. Reutilizarlo con la misma llave rompe GCM
  // por completo: dos mensajes con el mismo nonce revelan su XOR.
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', llave, nonce);
  const cuerpo = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    nonce.toString('base64url'),
    Buffer.concat([cuerpo, tag]).toString('base64url'),
  ].join('.');
}

export function descifrar(cifrado: string, llave: Buffer): string {
  const partes = cifrado.split('.');
  if (partes.length !== 3) {
    throw new ErrorDeCifrado('El token cifrado no tiene el formato esperado.');
  }

  const [version, nonceB64, cuerpoB64] = partes as [string, string, string];
  if (version !== VERSION) {
    throw new ErrorDeCifrado(`Versión de cifrado desconocida: ${version}.`);
  }

  const nonce = Buffer.from(nonceB64, 'base64url');
  const conTag = Buffer.from(cuerpoB64, 'base64url');
  // `< 16`, no `<= 16`: un texto vacío cifra a exactamente el tag y nada más.
  // Con `<=` un token vacío legítimo se rechazaba como truncado.
  if (nonce.length !== NONCE_BYTES || conTag.length < 16) {
    throw new ErrorDeCifrado('El token cifrado está truncado.');
  }

  const tag = conTag.subarray(conTag.length - 16);
  const cuerpo = conTag.subarray(0, conTag.length - 16);

  try {
    const decipher = createDecipheriv('aes-256-gcm', llave, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cuerpo), decipher.final()]).toString('utf8');
  } catch {
    // No se distingue "llave equivocada" de "mensaje alterado" a propósito: la
    // diferencia solo le sirve a quien está probando llaves.
    throw new ErrorDeCifrado('No se pudo descifrar el token: llave incorrecta o dato alterado.');
  }
}

/**
 * El hash de un state de OAuth, para guardarlo en la base sin guardar el valor.
 *
 * Se usa SHA-256 sin sal: el state es un valor aleatorio de 256 bits generado por
 * nosotros, así que no hay diccionario que atacar y una sal solo impediría buscar
 * por hash, que es justo lo que el callback necesita hacer.
 */
export function hashDeState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('base64url');
}

/** Un state nuevo: 256 bits de aleatoriedad del sistema. */
export function nuevoState(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Comparación en tiempo constante, para cuando haya que verificar la firma de un
 * webhook. Comparar con `===` filtra cuántos bytes coinciden por el tiempo que
 * tarda en salir.
 */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
