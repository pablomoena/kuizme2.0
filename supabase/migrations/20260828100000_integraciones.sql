-- ============================================================================
-- D14 · Zona de integraciones por tenant: los cimientos
-- ============================================================================
-- Cada institución conecta SU cuenta de Zoom, y después Mercado Pago, HubSpot y
-- lo que venga. Una app de Kuizme en el marketplace de cada proveedor; muchas
-- cuentas conectadas. Nunca credenciales de app por institución.
--
-- Esta migración monta la mecánica, no el proveedor: el estado de la conexión,
-- los secretos y la máquina del OAuth. Las llamadas a la API de Zoom vienen
-- después, cuando exista la app registrada.
--
-- ── Lo que la v1 hace bien y se copia ──────────────────────────────────────
-- Separa el estado no secreto de la conexión (conectado, qué cuenta, cuándo
-- vence) de los tokens. Es la división correcta y no había que inventarla.
--
-- ── Lo que la v1 hace mal y no se repite ───────────────────────────────────
-- 1. Sus tokens SON alcanzables desde el navegador. `organization_secrets` está
--    en el esquema público, con GRANT (el hook de desconexión hace .delete()
--    desde el cliente) y con esta política:
--
--      CREATE POLICY "Super admins can manage organization secrets"
--      ON public.organization_secrets FOR ALL
--      USING (has_role(auth.uid(), 'super_admin', organization_id))
--
--    `FOR ALL` incluye SELECT, y RLS filtra FILAS, NO COLUMNAS —lo mismo que
--    obligó a separar la clave de respuestas (D3) y el cuerpo de la lección
--    (D8)—. Un super_admin, o cualquiera con su sesión, pide
--    `select zoom_refresh_token from organization_secrets` y lo recibe en texto
--    plano. Un refresh token de Zoom da acceso continuo a la cuenta de esa
--    institución: crear y borrar reuniones, listar grabaciones, ver usuarios.
--
--    Acá los secretos van en una tabla con RLS activo, CERO políticas y SIN
--    GRANT: el doble candado de question_keys, que ya está probado en esta base.
--    No hay política que endurecer más adelante porque no hay política.
--
-- 2. Sus tokens están en texto plano. Acá el cifrado lo hace la aplicación con
--    una llave que vive en el entorno, no en la base. Un respaldo de la base,
--    por sí solo, no entrega ningún token. Por eso las columnas son `bytea` y no
--    `text`: el tipo dice que ahí no va nada legible.
--
-- 3. Su callback de OAuth ignora el propósito del parámetro `state`. Lo decodifica
--    con base64 sin firma —así que el organization_id que trae es del cliente— y
--    si falta, cae a "el state sin usar más reciente de los últimos 10 minutos"
--    SIN filtrar por organización. Eso ata la cuenta de Zoom de quien llegue al
--    callback con la institución que empezó un flujo hace un rato.
--
--    Acá el state se consume por su hash, en una sola sentencia, de un solo uso
--    y con vencimiento. No existe la consulta "el más reciente".
-- ============================================================================

create type integration_provider as enum ('zoom', 'mercado_pago', 'hubspot');

-- 'error' y 'expired' se distinguen a propósito: vencido se arregla renovando el
-- token sin molestar a nadie; error es algo que el administrador tiene que ver.
create type integration_status as enum
  ('disconnected', 'connected', 'expired', 'revoked', 'error');

-- ────────────────────────────────────────────────────────────────────────────
-- 1 · El estado de la conexión. Nada secreto acá.
-- ────────────────────────────────────────────────────────────────────────────
create table integrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider        integration_provider not null,
  status          integration_status   not null default 'disconnected',
  -- Con qué cuenta quedó conectada. El administrador tiene que poder reconocer
  -- cuál conectó: "zoom@instituto.cl" contesta la pregunta, un uuid no.
  account_label   text,
  account_ref     text,
  scopes          text[] not null default '{}',
  expires_at      timestamptz,
  connected_at    timestamptz,
  connected_by    uuid references auth.users(id) on delete set null,
  last_error      text,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, provider)
);

create index integrations_org_idx on integrations (organization_id, provider);

create trigger integrations_touch before update on integrations
  for each row execute function touch_updated_at();

comment on table integrations is
  'D14: estado de la conexión de un tenant con un proveedor. Sin secretos: esos van en integration_secrets, que ningún rol de usuario alcanza.';
comment on column integrations.account_label is
  'D14: para que el administrador reconozca qué cuenta conectó. No es un identificador.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2 · Los secretos. Fuera del alcance de todo rol de usuario.
-- ────────────────────────────────────────────────────────────────────────────
create table integration_secrets (
  integration_id         uuid primary key references integrations(id) on delete cascade,
  access_token_encrypted  bytea not null,
  refresh_token_encrypted bytea,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger integration_secrets_touch before update on integration_secrets
  for each row execute function touch_updated_at();

comment on table integration_secrets is
  'D14: tokens cifrados por la aplicación con una llave del entorno. RLS activo y CERO políticas: ningún rol de usuario alcanza una fila, igual que question_keys (D3). La v1 los tenía legibles desde el navegador.';
comment on column integration_secrets.access_token_encrypted is
  'bytea, no text: acá no va nada legible. El cifrado lo hace la aplicación; la base nunca ve la llave.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3 · La máquina del OAuth
-- ────────────────────────────────────────────────────────────────────────────
-- Se guarda el HASH del state, no el state. Así una lectura de esta tabla no
-- entrega un state usable, y el callback tiene que traer el valor original.
create table oauth_states (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider        integration_provider not null,
  state_hash      text not null unique,
  created_by      uuid not null references auth.users(id) on delete cascade,
  -- A dónde volver en la aplicación. Se valida en el servidor antes de usarla:
  -- un redirect abierto acá sería una forma de robar el código de autorización.
  redirect_to     text,
  used_at         timestamptz,
  expires_at      timestamptz not null default now() + interval '10 minutes',
  created_at      timestamptz not null default now()
);

create index oauth_states_limpieza_idx on oauth_states (expires_at);

comment on table oauth_states is
  'D14: un state de OAuth pendiente. Se guarda su hash, no su valor. Se consume por hash con consume_oauth_state(); no existe ninguna consulta por "el más reciente" — eso es lo que en la v1 ata la cuenta de quien llegue al callback con la institución equivocada.';

-- ── Consumir un state: atómico, de un solo uso, con vencimiento ────────────
-- Una sola sentencia UPDATE ... RETURNING. Dos callbacks simultáneos con el
-- mismo state no pueden ganar los dos: el segundo no encuentra fila porque el
-- primero ya puso used_at. Comprobar y después marcar, en dos pasos, sí dejaría
-- pasar a los dos.
--
-- No recibe organization_id: lo DEVUELVE. El cliente no puede elegir a qué
-- institución se conecta la cuenta, que es el agujero del callback de la v1.
create or replace function consume_oauth_state(_hash text, _provider integration_provider)
returns table (organization_id uuid, created_by uuid, redirect_to text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update oauth_states s
     set used_at = now()
   where s.state_hash = _hash
     and s.provider   = _provider
     and s.used_at   is null
     and s.expires_at > now()
  returning s.organization_id, s.created_by, s.redirect_to;
end $$;

comment on function consume_oauth_state(text, integration_provider) is
  'D14: consume un state de OAuth. Atómico y de un solo uso. Devuelve la organización en vez de recibirla: quien llega al callback no elige a qué tenant se conecta la cuenta.';

-- Solo el servidor. Ningún rol de usuario ejecuta esto.
revoke execute on function consume_oauth_state(text, integration_provider) from public, anon, authenticated;
grant  execute on function consume_oauth_state(text, integration_provider) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4 · RLS y permisos
-- ────────────────────────────────────────────────────────────────────────────
alter table integrations        enable row level security;
alter table integration_secrets enable row level security;
alter table oauth_states        enable row level security;

-- integrations: la lee el administrador de la organización, y nadie escribe.
--
-- Sin política de escritura a propósito. Si un administrador pudiera hacer
-- UPDATE, podría poner status='connected' sin que exista ninguna conexión, y la
-- pantalla mostraría una integración activa que no funciona. El estado lo
-- escribe únicamente el servidor, que es quien habló con el proveedor.
--
-- Solo org_admin, no instructor: conectar la cuenta de la institución es un acto
-- administrativo, y account_label es un correo. Al instructor le basta saber si
-- puede programar una clase en vivo, y eso lo contesta la función de abajo sin
-- darle la fila.
create policy integrations_read on integrations for select to authenticated
  using (
    has_org_role(organization_id, array['org_admin']::org_role[])
    or is_platform_admin()
  );

-- integration_secrets y oauth_states quedan SIN políticas a propósito: RLS
-- activo y cero políticas significa que ningún rol de usuario alcanza una fila.

grant select on integrations to authenticated;

-- Y REVOCAR el resto explícitamente. Supabase concede TODA tabla nueva completa a
-- authenticated por default privileges, así que "no dar el grant" no basta: hay
-- que quitarlo. Sin esto, un UPDATE de un administrador no falla — RLS lo deja en
-- cero filas y devuelve éxito. La pantalla mostraría el cambio y la base no lo
-- tendría, que es el mismo éxito silencioso que las funciones de reordenar
-- convierten en excepción a mano.
--
-- Lo detectó la suite: `update integrations set status = 'connected'` sobre la
-- fila de OTRA organización pasaba por aceptado.
revoke insert, update, delete on integrations from anon, authenticated;

-- El doble candado: sin GRANT, aunque alguien escriba una política permisiva por
-- error, el rol no llega a la tabla. Es lo que D3 hace con question_keys, y hace
-- falta explícitamente porque Supabase concede toda tabla nueva a authenticated
-- por default privileges.
revoke all on integration_secrets from anon, authenticated;
revoke all on oauth_states        from anon, authenticated;

grant select, insert, update, delete on integrations        to service_role;
grant select, insert, update, delete on integration_secrets to service_role;
grant select, insert, update, delete on oauth_states        to service_role;

-- ── Lo que el instructor necesita saber, y nada más ────────────────────────
-- Un booleano en vez de la fila. Así puede saber si programar una clase en vivo
-- tiene sentido sin ver con qué cuenta ni cuándo vence el token.
create or replace function integration_conectada(_provider integration_provider)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from integrations i
    where i.provider = _provider
      and i.status = 'connected'
      and (
        has_org_role(i.organization_id, array['org_admin','instructor']::org_role[])
        or is_platform_admin()
      )
  )
$$;

comment on function integration_conectada(integration_provider) is
  'D14: si el tenant del usuario tiene este proveedor conectado. Devuelve un booleano y no la fila, para que un instructor no vea la cuenta ni el vencimiento.';

revoke execute on function integration_conectada(integration_provider) from public, anon;
grant  execute on function integration_conectada(integration_provider) to authenticated;
