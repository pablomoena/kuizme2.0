#!/usr/bin/env bash
# ============================================================================
# D12 · La condición de carrera del cupo
# ============================================================================
# Contar y después insertar es una carrera: dos alumnos que pulsan
# "Matricularme" a la vez pueden pasar los dos y dejar 31 en un cupo de 30.
# check_enrollment_capacity() toma `for update` sobre la fila del curso para
# serializar a los que compiten por el mismo curso.
#
# Esto no se puede probar en un archivo .sql: hacen falta dos conexiones
# solapadas. De ahí el script.
#
# Sesión A entra en transacción, inserta (toma el cerrojo) y espera antes de
# confirmar. Sesión B intenta insertar: queda bloqueada hasta que A confirma, y
# entonces ve el cupo lleno y falla. Determinista, sin depender del azar.
# ============================================================================
set -uo pipefail

PSQL=(psql -h localhost -U kuizme -d kuizme_test -v ON_ERROR_STOP=1 -q -X)
ORG=0e300000-0000-0000-0000-000000000001
CURSO=e1300000-0000-0000-0000-000000000001
A=ea300000-0000-0000-0000-000000000001
B=ea300000-0000-0000-0000-000000000002

"${PSQL[@]}" <<SQL >/dev/null
insert into auth.users (id, email) values
  ('$A', 'carrera.a@test.cl'), ('$B', 'carrera.b@test.cl');
insert into organizations (id, slug, name) values ('$ORG', 'instituto-carrera', 'Carrera');
insert into memberships (user_id, organization_id, role) values
  ('$A', '$ORG', 'student'), ('$B', '$ORG', 'student');
insert into courses (id, organization_id, slug, title, status, visibility, max_students)
  values ('$CURSO', '$ORG', 'cupo-carrera', 'Cupo de uno', 'published', 'public', 1);
insert into course_pricing (course_id, kind) values ('$CURSO', 'free');
SQL

matricular_como () {  # $1 = uuid del alumno, $2 = segundos de espera antes de confirmar
  "${PSQL[@]}" <<SQL 2>&1
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '$1', 'role', 'authenticated')::text, true);
insert into enrollments (course_id, student_id, status) values ('$CURSO', '$1', 'active');
select pg_sleep($2);
commit;
SQL
}

salida_a=$(matricular_como "$A" 2) &
pid_a=$!
sleep 0.7                      # que A ya tenga el cerrojo
salida_b=$(matricular_como "$B" 0 2>&1)
rc_b=$?
wait $pid_a

activos=$("${PSQL[@]}" -t -A -c \
  "select count(*) from enrollments where course_id = '$CURSO' and status = 'active'")

echo
if [ "$activos" = "1" ] && [ $rc_b -ne 0 ]; then
  echo "OK    solo una matrícula entró en un cupo de 1 (la segunda falló)"
  echo "OK    la segunda dijo: $(echo "$salida_b" | grep -oE 'ERROR:.*' | head -1 | cut -c1-70)"
  echo
  echo "── Carrera del cupo verificada ──"
  exit 0
fi

echo "FALLA: quedaron $activos matrículas activas en un cupo de 1"
echo "       la segunda sesión terminó con código $rc_b"
echo "$salida_b" | head -5
exit 1
