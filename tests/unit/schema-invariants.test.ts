import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardas sobre el esquema. No reemplazan a los tests de aislamiento contra una
 * base real (esos vienen en la semana 2), pero fijan las decisiones de diseño
 * para que nadie las deshaga sin que CI se dé cuenta.
 */
const MIGRATIONS = 'supabase/migrations';

/** Quita comentarios de línea: los invariantes se verifican sobre DDL real, no
 *  sobre el texto explicativo que menciona los defectos de la v1. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const at = line.indexOf('--');
      return at === -1 ? line : line.slice(0, at);
    })
    .join('\n');
}

const sql = stripComments(
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n'),
);

describe('invariantes del esquema', () => {
  it('D3: questions no guarda la respuesta correcta', () => {
    const table = sql.slice(
      sql.indexOf('create table questions ('),
      sql.indexOf('create index questions_bank_idx'),
    );
    expect(table).not.toMatch(/correct_answer/);
  });

  it('D3: question_options no guarda is_correct', () => {
    const table = sql.slice(
      sql.indexOf('create table question_options ('),
      sql.indexOf('create index question_options_question_idx'),
    );
    expect(table).not.toMatch(/is_correct/);
  });

  it('D3: question_keys no tiene ninguna política', () => {
    expect(sql).toMatch(/create table question_keys/);
    expect(sql).not.toMatch(/create policy[^\n]*on question_keys/);
    expect(sql).not.toMatch(/on public\.question_keys for/);
  });

  it('D4: los alumnos no tienen INSERT ni UPDATE sobre exam_attempts', () => {
    const policies = sql.match(/create policy \w+ on exam_attempts[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      if (/for all|for insert|for update/.test(p)) {
        // Toda política de escritura debe exigir rol de staff.
        expect(p).toMatch(/has_org_role/);
        expect(p).not.toMatch(/student_id = auth\.uid\(\)/);
      }
    }
  });

  it('D4: una respuesta correcta exige respuesta registrada', () => {
    expect(sql).toMatch(/answer_correct_requires_response/);
    expect(sql).toMatch(/is_correct is not true or response is not null/);
  });

  it('D5: el motivo del cambio de nota es obligatorio', () => {
    expect(sql).toMatch(/reason\s+text not null/);
  });

  it('D6: no existen las banderas duplicadas de la v1', () => {
    expect(sql).not.toMatch(/\bis_public\b/);
    expect(sql).not.toMatch(/\bis_free\b/);
    expect(sql).not.toMatch(/\bprice_type\b/);
  });

  it('D8: el temario se lee a nivel catálogo y el contenido exige matrícula', () => {
    // El temario (modules, lessons) sube a can_view_course para que se pueda
    // mostrar antes de matricularse. El cuerpo vive aparte y sigue exigiendo
    // matrícula: RLS filtra filas, no columnas, así que separarlos es la única
    // forma de publicar el título y esconder el contenido.
    for (const table of ['modules', 'lessons']) {
      expect(sql).toMatch(
        new RegExp(
          `create policy ${table}_read on ${table} for select to authenticated\\s+using \\(can_view_course\\(course_id\\)\\)`,
        ),
      );
    }
    expect(sql).toMatch(/create policy lesson_contents_read on lesson_contents/);
    expect(sql).toMatch(/can_study_course\(course_id\)/);
  });

  it('D8: lessons no guarda el cuerpo de la lección', () => {
    // Si el cuerpo volviera a lessons, publicar el temario publicaría el
    // contenido: una política no puede esconder una columna.
    for (const columna of ['body', 'video_id', 'external_url']) {
      expect(sql).toMatch(new RegExp(`alter table lessons drop column ${columna}`));
    }
  });

  it('D8: la excepción de muestra se ata a la lección de esa fila', () => {
    // El error plausible es un exists sin ligar l.id = lesson_id: bastaría UNA
    // lección de muestra en toda la base para abrir todos los contenidos.
    const politica = sql.slice(
      sql.indexOf('create policy lesson_contents_read'),
      sql.indexOf('create policy lesson_contents_write'),
    );
    expect(politica).toMatch(/is_preview/);
    expect(politica).toMatch(/l\.id = lesson_id/);
  });

  it('D7: el material de evaluación no tiene política de lectura para alumnos', () => {
    for (const table of ['question_banks', 'questions', 'question_options', 'exam_questions']) {
      expect(sql).toMatch(new RegExp(`drop policy ${table}_read\\s+on ${table}`));
    }
  });

  it('D7: lessons lleva course_id denormalizado y se sincroniza al mover', () => {
    expect(sql).toMatch(/alter table lessons add column course_id uuid/);
    expect(sql).toMatch(/alter table lessons alter column course_id set not null/);
    expect(sql).toMatch(/create trigger lessons_course_sync before update on lessons/);
  });

  it('D7: ninguna rama de catálogo concede lectura entre organizaciones', () => {
    // La condición de catálogo (published + no privado) siempre va acompañada de
    // is_member_of. Sin eso, un curso público quedaba legible para otros tenants.
    const branches = sql.match(/status = 'published' and[^\n]*visibility <> 'private'/g) ?? [];
    expect(branches.length).toBeGreaterThan(0);
    for (const b of branches) {
      const context = sql.slice(Math.max(0, sql.indexOf(b) - 120), sql.indexOf(b) + b.length);
      expect(context).toMatch(/is_member_of/);
    }
  });

  it('RLS se activa en todas las tablas listadas', () => {
    expect(sql).toMatch(/enable row level security/);
  });

  it('FORCE se retira: es incompatible con los helpers SECURITY DEFINER', () => {
    // Que no quede ninguna tabla con FORCE se afirma contra el catálogo en
    // tests/db/schema-behavior.sql, que es donde se puede comprobar el hecho.
    // Acá solo se fija que la retirada sigue en las migraciones y con su motivo.
    expect(sql).toMatch(/no force row level security/);
  });

  it('D13: borrar una sección no borra sus lecciones', () => {
    // `on delete cascade` acá convertiría "quitar un título" en "borrar la
    // semana entera". El comportamiento se comprueba contra la base en
    // tests/db/secciones.sql; esto fija la intención en el DDL, que es donde un
    // cambio de una palabra la invierte sin que se note en una revisión.
    const fk = sql.match(/add column section_id[\s\S]*?;/)?.[0] ?? '';
    expect(fk).toMatch(/references sections\(id\) on delete set null/);
    expect(fk).not.toMatch(/on delete cascade/);
  });

  it('D13: las funciones que reordenan son SECURITY INVOKER', () => {
    // Si fueran DEFINER correrían como el dueño de la función y las políticas de
    // escritura no aplicarían: un alumno reordenaría el curso de su instituto.
    // Son invoker a propósito, y por eso cada una comprueba las filas afectadas.
    const fns = sql.match(/create or replace function (?:reorder_\w+|move_lesson|set_lesson_section)[\s\S]*?\$\$/g) ?? [];
    expect(fns.length).toBeGreaterThan(0);
    for (const f of fns) {
      expect(f).toMatch(/security invoker/i);
      expect(f).not.toMatch(/security definer/i);
    }
  });

  it('D14: los secretos de las integraciones no tienen ninguna política', () => {
    // El agujero de la v1 es literalmente una política:
    //   CREATE POLICY ... ON organization_secrets FOR ALL
    //   USING (has_role(auth.uid(), 'super_admin', organization_id))
    // `FOR ALL` incluye SELECT y RLS filtra filas, no columnas. Acá la garantía
    // es que NO exista política, así que se afirma sobre el texto: una política
    // añadida "para que el admin pueda ver el estado" reabriría el agujero, y el
    // estado ya se ve en `integrations`, que es otra tabla.
    expect(sql).toMatch(/create table integration_secrets/);
    expect(sql).not.toMatch(/create policy \w+ on integration_secrets/);
    expect(sql).not.toMatch(/create policy \w+ on oauth_states/);
  });

  it('D14: y tampoco GRANT para roles de usuario', () => {
    // Supabase concede toda tabla nueva a authenticated por default privileges,
    // así que "no dar el grant" no basta: hay que quitarlo.
    expect(sql).toMatch(/revoke all on integration_secrets from anon, authenticated/);
    expect(sql).toMatch(/revoke all on oauth_states\s+from anon, authenticated/);
  });

  it('D14: nadie más que el servidor escribe el estado de una integración', () => {
    // Si un administrador pudiera hacer UPDATE, pondría status='connected' sin
    // conexión y la pantalla mostraría una integración activa que no funciona.
    expect(sql).toMatch(/revoke insert, update, delete on integrations from anon, authenticated/);
    expect(sql).not.toMatch(/create policy \w+ on integrations for (all|insert|update|delete)/);
  });

  it('D14: el state de OAuth se consume por su hash, no por "el más reciente"', () => {
    // El callback de la v1, si falta el state, toma el más reciente sin usar de
    // los últimos 10 minutos SIN filtrar por organización.
    const fn = sql.match(/create or replace function consume_oauth_state[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(fn).toMatch(/state_hash = _hash/);
    expect(fn).toMatch(/used_at\s+is null/);
    expect(fn).toMatch(/expires_at > now\(\)/);
    // Y una sola sentencia: comprobar y después marcar deja pasar a dos callbacks
    // simultáneos. tests/db/race-oauth-state.sh lo comprueba con dos conexiones.
    expect(fn).toMatch(/update oauth_states[\s\S]*returning/);
    expect(fn).not.toMatch(/order by[\s\S]*limit 1/);
  });

  it('toda función SECURITY DEFINER fija search_path', () => {
    const fns = sql.match(/create or replace function[\s\S]*?\$\$/g) ?? [];
    const definers = fns.filter((f) => /security definer/i.test(f));
    expect(definers.length).toBeGreaterThan(0);
    for (const f of definers) {
      expect(f).toMatch(/set search_path\s*=\s*public/i);
    }
  });
});
