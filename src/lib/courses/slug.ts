/**
 * Slugs de curso, en el cliente y en el servidor.
 *
 * La autoridad es la base: `courses_slug_format` rechaza cualquier cosa que no
 * cumpla el patrón, y un trigger normaliza. Esto no reemplaza esa validación —no
 * se confía en el cliente— sino que la anticipa, para que el formulario proponga
 * un slug usable y explique el problema antes de enviar.
 *
 * PATTERN es el mismo patrón que el CHECK de la base, escrito una sola vez acá y
 * comprobado contra ella en tests/db/schema-behavior.sql.
 */

/** De 3 a 50 caracteres: minúscula o dígito, interior con guiones, sin terminar en guión. */
export const PATTERN = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/;

export const MIN_LENGTH = 3;
export const MAX_LENGTH = 50;

const ACENTOS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' };

/**
 * Propone un slug a partir de un título. No garantiza validez —un título de dos
 * letras da un slug de dos letras, que la base rechaza— porque inventar
 * caracteres para rellenar produciría URLs que nadie escribió.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACENTOS[c] ?? c)
    // Cualquier otra cosa fuera del alfabeto permitido pasa a ser separador.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    // El recorte puede dejar un guión al final.
    .replace(/-+$/, '');
}

export type SlugProblem =
  | { kind: 'vacio' }
  | { kind: 'corto'; length: number }
  | { kind: 'largo'; length: number }
  | { kind: 'caracteres' };

/** null si el slug es válido; el problema concreto si no. */
export function checkSlug(slug: string): SlugProblem | null {
  const s = slug.trim().toLowerCase();
  if (s.length === 0) return { kind: 'vacio' };
  if (s.length < MIN_LENGTH) return { kind: 'corto', length: s.length };
  if (s.length > MAX_LENGTH) return { kind: 'largo', length: s.length };
  if (!PATTERN.test(s)) return { kind: 'caracteres' };
  return null;
}

/** Mensaje para mostrar en el formulario. Uno por problema, en concreto. */
export function describeSlugProblem(problem: SlugProblem): string {
  switch (problem.kind) {
    case 'vacio':
      return 'La dirección del curso no puede quedar vacía.';
    case 'corto':
      return `La dirección necesita al menos ${MIN_LENGTH} caracteres (tiene ${problem.length}).`;
    case 'largo':
      return `La dirección no puede pasar de ${MAX_LENGTH} caracteres (tiene ${problem.length}).`;
    case 'caracteres':
      return 'Usa solo minúsculas, números y guiones, sin empezar ni terminar en guión.';
  }
}
