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
