# Kuizme

LMS multi-tenant con módulo de evaluaciones, para instituciones de LATAM.
Reconstrucción independiente de la v1 (que vive en Lovable y queda congelada como
el portal de IBMiel).

## Cómo trabajar con Pablo

**Guiar siempre paso a paso.** Nada de "configura los secretos" ni "activa PITR":
hay que decir dónde hacer clic, qué escribir, qué va a aparecer en pantalla y
cómo saber si salió bien. Si un paso puede fallar, indicar cuál es el error
probable y qué hacer con él.

Y no dar por bueno lo que no se verificó: los mensajes de las herramientas
mienten (ver las dos trampas más abajo). Se comprueba contra la fuente real y se
reporta el resultado, no la expectativa.

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
- **La membresía no da lectura del contenido.** Pertenecer a la organización no
  es lo mismo que poder leerla. Módulos y lecciones exigen `can_study_course()`;
  el material de evaluación (bancos, preguntas, alternativas, armado del examen)
  no tiene política de lectura para alumnos y lo entrega el servidor.
- **RLS no concede lecturas entre tenants, nunca.** Ni para un catálogo público:
  toda rama de una política que afloje por estado o visibilidad lleva
  `is_member_of` al lado. El catálogo entre organizaciones lo sirve el servidor,
  con el tenant ya resuelto desde el hostname.

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
| D7 | La lectura de contenido se gana, no se hereda | Membresía daba lectura de todo el tenant |

## La puerta

`src/lib/auth/access.ts` concentra la decisión de acceso en una función pura, y
`guard.ts` es la plomería: resolver el tenant del host, buscar organización y
membresía, delegar. Lo hace con el token del usuario, así que RLS sigue
aplicando — si el guard tuviera un error, la base seguiría negando.

Todo lo que vive bajo `src/app/(portal)/` exige sesión y membresía: el layout del
grupo llama a `requirePortal()` antes de renderizar, así que una página nueva no
puede olvidarse de comprobar el acceso. `requireStaff()` añade el rol.

Dos cosas que no son estéticas:

- **"No existe la organización" y "no eres miembro" dan la misma respuesta.** Con
  RLS, una organización de la que no eres miembro llega como `null`, así que son
  indistinguibles por construcción. Distinguirlas convertiría los subdominios en
  un directorio de instituciones recorrible.
- **La sesión se comprueba antes que la organización.** Si fuera al revés, un
  visitante sin cuenta podría separar subdominios reales de inventados.

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

**3. El rol dueño de tus pruebas se salta RLS; el de Supabase quizá no.** Los
helpers `is_member_of()` y `has_org_role()` son `security definer`, así que
corren como el dueño de la función. Si ese rol queda sujeto a RLS, ninguna
política le aplica —están declaradas `to authenticated`— y devuelven false para
todo: la aplicación se queda en blanco. En local y en CI el dueño es
superusuario y el problema es invisible.

Por eso `memberships` y `platform_admins` tienen RLS activo pero **sin
`force`**, y `tests/db/owner-privileges.sql` traspasa todo a un rol
`nosuperuser nobypassrls` y comprueba que sigue funcionando. Es la misma lección
que la trampa 2: si el entorno de prueba es más permisivo que el real, la prueba
pasa y la producción está distinta.

**4. Los tipos de las consultas se caen a `never` sin decir nada.** postgrest-js
exige que cada tabla del tipo `Database` traiga `Relationships`, además de
`Views` y `Functions` en el esquema. Si falta cualquiera de las tres, la tabla no
satisface `GenericTable`, **toda** consulta resuelve a `never`, y no hay ni un
error de compilación: el código sigue tipando, los tests siguen pasando y
`select('role')` devuelve un valor sin forma.

Se midió quitando cada clave y contando errores: `Relationships` 5, `Views` 4,
`Functions` 4, `CompositeTypes` 0 (esta no la exige). Por eso los tipos **se
generan** (`npm run db:types`) y hay dos guardas: `npm run db:types:check` en CI
para la deriva contra el esquema, y `tests/types/db-inference.ts`, que afirma en
tiempo de compilación que las consultas resuelven a una forma concreta.

## Reordenar contenido

El orden lo aplica la base en **una sola sentencia** (`reorder_modules`,
`reorder_lessons`): o queda el orden completo, o no cambia nada. Se manda la
lista entera de ids, no un movimiento suelto — una lista parcial significa que el
cliente y la base discrepan, y aplicarla dejaría índices repetidos.

Son `security invoker`, así que RLS aplica. Y **comprueban cuántas filas
tocaron**: con RLS un UPDATE sin permiso no falla, simplemente no toca nada, así
que sin esa comprobación un alumno vería el nuevo orden en pantalla y la base
guardaría el viejo. `tests/db/reorder.sql` lo verifica, y se comprobó que la
prueba falla si se quita la comprobación.

En la interfaz, **el teclado es el camino principal, no un añadido**: cada
elemento tiene botones reales de subir y bajar que se deshabilitan en los
extremos, y cada movimiento se anuncia por `aria-live` con nombre y posición. El
arrastre usa la misma función pura (`src/lib/courses/reorder.ts`), así que los
dos caminos no pueden divergir. En la v1 solo había arrastre.

## Comandos

```bash
npm run dev         # desarrollo
npm run verify      # tipos + lint + tests (correr antes de cada commit)
npm run build
npm run db:reset    # aplica migraciones en la base local
npm run db:types    # regenera src/lib/db/types.ts desde el esquema
npm run test:e2e    # guard del portal y borde (Playwright levanta el servidor)
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
