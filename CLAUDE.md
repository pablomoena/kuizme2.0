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

## Dos trampas del entorno que ya nos costaron tiempo

**1. `supabase db push` informa mal.** Imprime `Remote database is up to date`
*después* de aplicar las migraciones, así que el mensaje describe el estado final
y no una decisión de saltarse algo. **No lo uses como señal.** Para saber el
estado real, corre `tests/db/verify-remote.sql` en el SQL Editor del dashboard.

**2. Supabase concede toda tabla nueva a `anon` y `authenticated`.** Tiene
`alter default privileges` configurado en el schema `public`, así que crear una
tabla la abre a los roles de usuario sin que nadie lo pida — y las omisiones
deliberadas de las migraciones de permisos no se respetan. Se detectó con
`question_keys`, que tenía 6 grants pese a no concedérsele ninguno.

Por eso `tests/db/stubs.sql` **emula esos default privileges**: sin ellos, las
pruebas locales pasan mientras la base real está distinta. Cualquier tabla nueva
tiene que revocarse explícitamente si no debe ser alcanzable, y el test de
comportamiento lo verifica en CI.

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
