#!/usr/bin/env node
/**
 * Genera src/lib/db/types.ts desde el esquema real de Postgres.
 *
 * `supabase gen types` necesita Docker, que no está disponible en todos los
 * entornos donde trabajamos. Este generador usa psql y la introspección de
 * pg_catalog, así que corre en cualquier parte donde haya una base con las
 * migraciones aplicadas — incluido el CI, que además comprueba que el archivo
 * commiteado no se haya quedado atrás (npm run db:types:check).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT = 'src/lib/db/types.ts';
const CHECK = process.argv.includes('--check');
const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://kuizme:kuizme@localhost:5432/kuizme_test';

/** Postgres → TypeScript. Lo que no esté acá cae en `unknown` a propósito: es
 *  mejor un error de tipos que un `any` silencioso. */
const SCALARS = {
  uuid: 'string', text: 'string', citext: 'string', varchar: 'string',
  bpchar: 'string', name: 'string',
  int2: 'number', int4: 'number', int8: 'number', float4: 'number',
  float8: 'number', numeric: 'number',
  bool: 'boolean',
  timestamptz: 'string', timestamp: 'string', date: 'string', time: 'string',
  interval: 'string',
  json: 'Json', jsonb: 'Json',
};

/** Tipos de Postgres tal como los imprime pg_get_function_result / oidvectortypes. */
function tsFnType(pgType, enumNames) {
  const isArray = pgType.endsWith('[]');
  const base = isArray ? pgType.slice(0, -2) : pgType;
  const NAMES = {
    uuid: 'string', text: 'string', citext: 'string', boolean: 'boolean', void: 'undefined',
    integer: 'number', bigint: 'number', numeric: 'number', double: 'number',
    jsonb: 'Json', json: 'Json',
    'timestamp with time zone': 'string', 'timestamp without time zone': 'string', date: 'string',
  };
  const mapped = enumNames.has(base)
    ? `Database['public']['Enums']['${base}']`
    : (NAMES[base] ?? 'unknown');
  return isArray ? `${mapped}[]` : mapped;
}

function tsType(col, enumNames) {
  const udt = col.udt.replace(/^_/, '');
  const isArray = col.udt.startsWith('_');
  let base;
  if (enumNames.has(udt)) base = `Database['public']['Enums']['${udt}']`;
  else base = SCALARS[udt] ?? 'unknown';
  return isArray ? `${base}[]` : base;
}

const raw = execFileSync('psql', [DB_URL, '-q', '-f', 'scripts/introspect.sql'], {
  encoding: 'utf8',
  env: { ...process.env },
});
const schema = JSON.parse(raw.trim());
const enumNames = new Set(schema.enums.map((e) => e.name));

const lines = [
  '// GENERADO AUTOMÁTICAMENTE — no editar a mano.',
  '// Fuente: el esquema real de Postgres. Regenerar con `npm run db:types`.',
  '// El CI corre `npm run db:types:check`, así que un cambio de esquema sin',
  '// regenerar este archivo hace fallar la build antes de llegar a producción.',
  '',
  'export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];',
  '',
  // `type` y no `interface` para igualar lo que emite `supabase gen types`; con
  // esta versión de postgrest-js ambas funcionan.
  'export type Database = {',
  '  public: {',
  '    Tables: {',
];

for (const table of schema.tables) {
  const cols = table.columns;
  lines.push(`      ${table.name}: {`);
  lines.push('        Row: {');
  for (const c of cols) {
    const t = tsType(c, enumNames);
    lines.push(`          ${c.name}: ${c.notNull ? t : `${t} | null`};`);
  }
  lines.push('        };');

  const derived = new Set(table.derived ?? []);
  lines.push('        Insert: {');
  for (const c of cols) {
    if (c.generated) continue;
    const t = tsType(c, enumNames);
    // Opcional si tiene default, admite null, o la rellena un trigger (D2).
    const optional = c.hasDefault || !c.notNull || derived.has(c.name);
    lines.push(`          ${c.name}${optional ? '?' : ''}: ${c.notNull ? t : `${t} | null`};`);
  }
  lines.push('        };');

  lines.push('        Update: {');
  for (const c of cols) {
    if (c.generated) continue;
    const t = tsType(c, enumNames);
    lines.push(`          ${c.name}?: ${c.notNull ? t : `${t} | null`};`);
  }
  lines.push('        };');

  // Relationships es obligatoria para postgrest-js (ver introspect.sql).
  const rels = table.relationships ?? [];
  if (rels.length === 0) {
    lines.push('        Relationships: [];');
  } else {
    lines.push('        Relationships: [');
    for (const r of rels) {
      lines.push('          {');
      lines.push(`            foreignKeyName: '${r.foreignKeyName}';`);
      lines.push(`            columns: [${r.columns.map((c) => `'${c}'`).join(', ')}];`);
      lines.push(`            isOneToOne: ${r.isOneToOne};`);
      lines.push(`            referencedRelation: '${r.referencedRelation}';`);
      lines.push(
        `            referencedColumns: [${r.referencedColumns.map((c) => `'${c}'`).join(', ')}];`,
      );
      lines.push('          },');
    }
    lines.push('        ];');
  }
  lines.push('      };');
}

lines.push('    };');
// GenericSchema de postgrest-js pide Tables, Views y Functions. Sin Views o sin
// Functions la inferencia se cae a `never` sin ningún error que lo delate
// (comprobado: 4 errores de compilación en la guarda de tipos por cada una).
// CompositeTypes no la exige, pero se emite para igualar la forma que produce
// `supabase gen types` y no sorprender a quien compare.
// Las vistas de public que authenticated puede leer. Solo Row + Relationships:
// una vista no actualizable no necesita Insert ni Update, y GenericView los
// acepta ausentes.
if ((schema.views ?? []).length === 0) {
  lines.push('    Views: { [_ in never]: never };');
} else {
  lines.push('    Views: {');
  for (const view of schema.views) {
    lines.push(`      ${view.name}: {`);
    lines.push('        Row: {');
    for (const c of view.columns) {
      lines.push(`          ${c.name}: ${tsType(c, enumNames)} | null;`);
    }
    lines.push('        };');
    lines.push('        Relationships: [];');
    lines.push('      };');
  }
  lines.push('    };');
}
// Las funciones que `authenticated` puede ejecutar, para que rpc() tipe. Qué se
// puede llamar de verdad lo decide el GRANT, no este tipo.
if (schema.functions.length === 0) {
  lines.push('    Functions: { [_ in never]: never };');
} else {
  lines.push('    Functions: {');
  const vistas = new Set();
  for (const f of schema.functions) {
    // Una sobrecarga daría dos claves iguales. No tenemos ninguna; si aparece,
    // se emite la primera y se avisa en vez de generar TypeScript inválido.
    if (vistas.has(f.name)) {
      console.warn(`  aviso: ${f.name} está sobrecargada; se emite solo la primera firma.`);
      continue;
    }
    vistas.add(f.name);
    lines.push(`      ${f.name}: {`);
    if (f.args.length === 0) {
      lines.push('        Args: Record<PropertyKey, never>;');
    } else {
      lines.push('        Args: {');
      for (const a of f.args) {
        lines.push(`          ${a.name}: ${tsFnType(a.type, enumNames)};`);
      }
      lines.push('        };');
    }
    lines.push(`        Returns: ${tsFnType(f.returns, enumNames)};`);
    lines.push('      };');
  }
  lines.push('    };');
}
lines.push('    CompositeTypes: { [_ in never]: never };');
lines.push('    Enums: {');
for (const e of schema.enums) {
  lines.push(`      ${e.name}: ${e.values.map((v) => `'${v}'`).join(' | ')};`);
}
lines.push('    };');
lines.push('  };');
lines.push('};');
lines.push('');
lines.push('/** Atajos: Row<\'courses\'>, Insert<\'lessons\'>, Enum<\'org_role\'>. */');
lines.push("export type Tables = Database['public']['Tables'];");
lines.push('export type Row<T extends keyof Tables> = Tables[T][\'Row\'];');
lines.push('export type Insert<T extends keyof Tables> = Tables[T][\'Insert\'];');
lines.push('export type Update<T extends keyof Tables> = Tables[T][\'Update\'];');
lines.push("export type Enum<T extends keyof Database['public']['Enums']> =");
lines.push("  Database['public']['Enums'][T];");
lines.push('');

const output = lines.join('\n');

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== output) {
    console.error(
      `\n${OUT} está desincronizado con el esquema.\n` +
        'Corre `npm run db:types` y commitea el resultado.\n',
    );
    process.exit(1);
  }
  console.log(`${OUT} al día con el esquema.`);
} else {
  writeFileSync(OUT, output);
  console.log(`${OUT} generado (${schema.tables.length} tablas, ${schema.enums.length} enums).`);
}
