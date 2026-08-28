#!/usr/bin/env bash
# ============================================================================
# D14 · Un state de OAuth se consume UNA vez, aunque lleguen dos a la vez
# ============================================================================
# El callback puede recibir el mismo state dos veces: el usuario recarga, el
# proveedor reintenta, o alguien lo replica a propósito. Si las dos llamadas lo
# consumen, las dos siguen adelante y la segunda sobrescribe la conexión de la
# primera con otros tokens.
#
# consume_oauth_state() es UNA sentencia `update ... where used_at is null
# returning`. Postgres serializa las dos actualizaciones sobre la misma fila: la
# segunda reevalúa el WHERE con used_at ya puesto y no devuelve nada.
#
# Comprobar y después marcar, en dos pasos, sí dejaría pasar a las dos. Y eso no
# se ve en un archivo .sql —hacen falta dos conexiones solapadas—, de ahí el
# script.
#
# Sesión A abre transacción, consume el state (toma el cerrojo de la fila) y
# espera antes de confirmar. Sesión B intenta consumirlo: queda bloqueada, y al
# desbloquearse ve used_at puesto y recibe cero filas. Determinista.
# ============================================================================
set -uo pipefail

PSQL=(psql -h localhost -U kuizme -d kuizme_test -v ON_ERROR_STOP=1 -q -X)
ORG=1e900000-0000-0000-0000-000000000001
USR=1e900000-0000-0000-0000-0000000000a1
HASH=hash-de-la-carrera

"${PSQL[@]}" <<SQL >/dev/null
insert into auth.users (id, email) values ('$USR', 'carrera.oauth@test.cl');
insert into organizations (id, slug, name) values ('$ORG', 'instituto-carrera-oauth', 'Carrera OAuth');
insert into memberships (user_id, organization_id, role) values ('$USR', '$ORG', 'org_admin');
insert into oauth_states (organization_id, provider, state_hash, created_by, redirect_to)
  values ('$ORG', 'zoom', '$HASH', '$USR', '/panel/integraciones');
SQL

# Devuelve por stdout cuántas filas consumió esta sesión.
consumir () {  # $1 = segundos de espera antes de confirmar
  "${PSQL[@]}" -t -A <<SQL 2>/dev/null
begin;
select count(*) from consume_oauth_state('$HASH', 'zoom');
select pg_sleep($1);
commit;
SQL
}

# La salida de A va a un archivo, no a una variable: una asignación dentro de un
# trabajo en segundo plano ocurre en la subshell y el padre nunca la ve.
tmp_a=$(mktemp)
trap 'rm -f "$tmp_a"' EXIT
consumir 2 > "$tmp_a" &
pid_a=$!
sleep 0.7                      # que A ya tenga el cerrojo de la fila
salida_b=$(consumir 0)
wait $pid_a

filas_a=$(grep -E '^[0-9]+$' "$tmp_a" | head -1)
filas_b=$(echo "$salida_b" | grep -E '^[0-9]+$' | head -1)
usados=$("${PSQL[@]}" -t -A -c \
  "select count(*) from oauth_states where state_hash = '$HASH' and used_at is not null")

echo
if [ "$filas_a" = "1" ] && [ "$filas_b" = "0" ] && [ "$usados" = "1" ]; then
  echo "OK    la primera sesión consumió el state (1 fila)"
  echo "OK    la segunda, solapada, recibió 0 filas"
  echo "OK    el state quedó marcado usado exactamente una vez"
  echo
  echo "── Un solo uso del state verificado ──"
  exit 0
fi

echo "FALLA: el mismo state se consumió más de una vez"
echo "       sesión A devolvió '$filas_a' fila(s), sesión B devolvió '$filas_b'"
echo "       filas con used_at puesto: $usados"
exit 1
