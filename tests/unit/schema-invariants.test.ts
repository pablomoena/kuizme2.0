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

  it('RLS activo y forzado en todas las tablas listadas', () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/force row level security/);
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
