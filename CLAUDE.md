# Kuizme

LMS multi-tenant con módulo de evaluaciones, para instituciones de LATAM.
Reconstrucción independiente de la v1 (que vive en Lovable y queda congelada como
el portal de IBMiel).

## Modelo de seguridad — leer antes de tocar datos

Tres capas. La v1 tenía solo la tercera, y por eso un error de política no era un
bug sino una brecha de datos.

1. **Borde** (`src/middleware.ts`) — resuelve el tenant desde el hostname y
   refresca la sesión. Es el único lugar que escribe cookies.
2. **Servidor** — toda escritura y toda lectura sensible ocurre en Server
   Components o Server Actions, con el token del usuario.
3. **RLS** — defensa en profundidad. Un usuario solo alcanza organizaciones de
   las que es miembro.

### Reglas que no se negocian

- **La organización activa se deriva del hostname, nunca de la cookie.** Si la
  tomas de la sesión, una cuenta con varias membresías puede operar sobre el
  tenant equivocado.
- **El service role (`src/lib/supabase/admin.ts`) es solo para webhooks, jobs y
  la corrección de exámenes.** Atender una petición de usuario con él desactiva
  RLS y anula la capa 3. Cada uso nuevo se justifica en revisión de código.
- **La clave de respuestas nunca sale del servidor.** Vive en `question_keys`,
  que tiene RLS activo y cero políticas: ningún rol de usuario la alcanza. No
  agregues `correct_answer` a `questions` ni `is_correct` a `question_options`.
- **Los alumnos no escriben en `exam_attempts`.** Las transiciones de estado
  pasan por el servidor.
- **Todo cambio de nota deja registro en `grade_changes`,** con motivo.

## Decisiones de diseño del esquema

Van marcadas `D1..D6` en `supabase/migrations/`. Cada una cierra un problema
concreto y documentado de la v1:

| | Decisión | Cierra |
|---|---|---|
| D1 | `memberships` en vez de un usuario por organización | Índice único que impedía multi-org |
| D2 | `organization_id` en toda tabla de tenant, por trigger | Políticas con joins de 3 niveles |
| D3 | Clave de respuestas en `question_keys` | Alumnos leían `correct_answer` |
| D4 | Intento como máquina de estados, sin `UPDATE` de alumno | Alumnos podían escribirse la nota |
| D5 | `grade_changes` con motivo obligatorio | Notas editadas a mano sin trazabilidad |
| D6 | Una columna canónica por decisión | `is_public` vs `visibility` en 22 políticas |

`tests/unit/schema-invariants.test.ts` verifica estas decisiones en CI para que
nadie las deshaga sin darse cuenta.

## Comandos

```bash
npm run dev         # desarrollo
npm run verify      # tipos + lint + tests (correr antes de cada commit)
npm run build
npm run test:e2e
npm run db:reset    # aplica migraciones en la base local
```

Para probar un tenant en desarrollo: `http://ibmiel.localhost:3000`
(los subdominios de `localhost` resuelven sin configurar nada).

## Convenciones

- TypeScript `strict` con `noUncheckedIndexedAccess`. No se relaja.
- Español neutro en la interfaz. `<html lang="es">`.
- Todo estado de carga tiene su estado de error con reintento. La v1 manejaba
  `isLoading` en 121 archivos y `isError` en cero: un fallo de red se veía igual
  que "no hay datos".
- Cero colores hardcodeados: solo tokens, para que el tema del tenant llegue.
- Nada de componentes de más de ~300 líneas.
