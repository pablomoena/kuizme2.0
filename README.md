# Kuizme

Plataforma de cursos y evaluaciones en línea para instituciones de LATAM.
Multi-tenant, con módulo de exámenes como diferenciador.

## Estado

Fundaciones. Ver [`CLAUDE.md`](./CLAUDE.md) para el modelo de seguridad y las
decisiones de esquema, que conviene leer antes de escribir código.

## Stack

Next.js (App Router) · TypeScript estricto · Tailwind 4 · Supabase (Postgres +
Auth + Storage) · Vercel · Vitest + Playwright

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # completar con tu proyecto de Supabase
npm run db:start               # Postgres local (requiere Docker)
npm run db:reset               # aplica migraciones
npm run dev
```

- Sitio de marketing: `http://localhost:3000`
- Plano de control: `http://app.localhost:3000`
- Portal de un tenant: `http://ibmiel.localhost:3000`

## Arquitectura de dominios

| Host | Sirve |
|---|---|
| `kuizme.com` | Marketing y precios |
| `app.kuizme.com` | Plano de control de plataforma |
| `{slug}.kuizme.com` | Portal de cada institución |
| dominio propio | Fase posterior; el middleware ya resuelve por host |

## Migraciones

**Las aplica el pipeline, no una persona.** En la v1 los cambios de esquema se
hacían desde un editor y hubo correcciones por SQL directo que nunca quedaron
versionadas: git dejó de ser la fuente de verdad del producto.

- `ci.yml` levanta un Postgres limpio en cada PR, aplica **todas** las
  migraciones desde cero y corre `tests/db/schema-behavior.sql`. Si una
  migración no corre o una decisión de diseño se deshace, CI falla ahí.
- `deploy-db.yml` aplica las migraciones al proyecto real al mergear a `main`.

### Secretos que necesita el repo

En *Settings → Secrets and variables → Actions*:

| Secreto | De dónde sale |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token en `supabase.com/dashboard/account/tokens` |
| `SUPABASE_DB_PASSWORD` | La contraseña de la base del proyecto |

### Aplicar el esquema por primera vez

Desde tu máquina, una sola vez:

```bash
supabase login
supabase link --project-ref bmsefapphatpqtufbife
supabase db push
```

De ahí en adelante lo hace CI.

## Variables de entorno

Local (`.env.local`, no se commitea):

```
NEXT_PUBLIC_SUPABASE_URL=https://bmsefapphatpqtufbife.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_ROOT_DOMAIN=localhost
```

En Vercel, las mismas tres con `NEXT_PUBLIC_ROOT_DOMAIN=kuizme.com`, más
`SUPABASE_SERVICE_ROLE_KEY` (que nunca se comparte por chat ni se commitea).
