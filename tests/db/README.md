# Verificación del esquema contra una base real

`schema-behavior.sql` comprueba que las decisiones de diseño **funcionan**, no
solo que el SQL compila. Cubre:

- **D2** — `organization_id` se deriva por trigger a través de tres niveles de
  cascada, y falla si el padre no existe en vez de insertar una fila huérfana.
- **D3** — `question_keys` tiene RLS activo, forzado y **cero políticas**.
- **D4** — una respuesta marcada correcta sin respuesta registrada es imposible
  (el dato exacto que produjo «6 preguntas Sin responder en verde» en la v1), y
  un intento en progreso no puede tener fecha de entrega.
- **D5** — un cambio de nota sin motivo se rechaza.
- Subdominios reservados y normalización de `slug` a minúsculas.

## Con Supabase local (recomendado)

```bash
npm run db:reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -f tests/db/schema-behavior.sql
```

## Con un Postgres cualquiera

Necesita los stubs de Supabase (`auth.users`, `auth.uid()`, roles):

```bash
createdb kuizme_test
psql -d kuizme_test -f tests/db/stubs.sql
psql -d kuizme_test -v ON_ERROR_STOP=1 -f supabase/migrations/*.sql
psql -d kuizme_test -f tests/db/schema-behavior.sql
```

Un `NOTICE: OK ...` por cada caso significa que la guarda bloqueó lo que debía.
Un `ERROR: FALLO` significa que una decisión de diseño se deshizo.

> Estas comprobaciones son de invariantes de esquema. La suite de **aislamiento
> entre tenants** (dos organizaciones semilla, un test por tabla, con sesiones
> reales de usuario) es la de la semana 2 y es la que de verdad protege el
> multi-tenant.
