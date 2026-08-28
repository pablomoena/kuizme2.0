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

## `tenant-isolation.sql` — el activo central

Siembra **dos organizaciones** con sus usuarios y comprueba, con sesiones reales,
que el tenant A no alcanza nada del tenant B. Las sesiones no se simulan a medias:

```sql
set local role authenticated;
select test_as('<uuid del usuario>');   -- fija el claim `sub` del JWT
```

`auth.uid()` en `stubs.sql` lee ese claim igual que en Supabase, así que las
políticas se evalúan de verdad. **22 comprobaciones**, entre ellas:

- El admin de A ve exactamente 1 fila en cada tabla, y es la fila correcta.
- El alumno de B no ve cursos, notas ni preguntas de A — y tampoco las notas de
  sus propios compañeros.
- `question_keys` rechaza incluso al `org_admin` (D3).
- El alumno no puede alterar su nota (D4).
- Un usuario autenticado sin membresía ve **0 filas** en todo.
- El admin de B no puede insertar, actualizar ni borrar en A.
- `anon` no alcanza ninguna tabla.

### Está probado que puede fallar

Un test que no distingue el éxito del fracaso no sirve. Se verificó saboteando
el esquema a propósito:

| Sabotaje | Resultado |
|---|---|
| `courses_read` con `using (true)` | `FALLO [admin A]: ve 2 filas en courses` |
| `GRANT SELECT` sobre `question_keys` | `FALLO CRÍTICO: question_keys es alcanzable` |
| Devolver el `UPDATE` de intentos al alumno | `FALLO CRÍTICO: el alumno alteró su propia nota` |

El tercero es exactamente P0-2 de la v1, que estuvo abierto en producción
durante meses. La suite lo detecta al instante.
