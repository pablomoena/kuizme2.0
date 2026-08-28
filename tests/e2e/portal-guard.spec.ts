import { expect, test } from '@playwright/test';

/**
 * El guard del portal, comprobado por HTTP y no por lectura del código.
 *
 * Lo que se protege acá es que ninguna página del grupo (portal) se pueda ver
 * sin sesión, y que el borde rechace hosts que no son un tenant válido. Es
 * comportamiento que se rompe en silencio: basta mover una página fuera del
 * grupo de rutas para que quede abierta, y nada más lo detectaría.
 *
 * Se usan peticiones sin seguir redirecciones para afirmar el código y el
 * destino exactos, no la página final.
 */

const TENANT = 'http://ibmiel.localhost:3000';

// Para las peticiones sin navegador se conecta por IP con la cabecera Host
// explícita: Node no resuelve los subdominios de localhost (Chromium sí), y así
// la prueba no depende del DNS de la máquina donde corre.
const ORIGIN = 'http://127.0.0.1:3000';
const asHost = (host: string) => ({ headers: { host }, maxRedirects: 0 });

test.describe('sin sesión', () => {
  test('el panel de un tenant manda al login, en el mismo subdominio', async ({ request }) => {
    const res = await request.get(`${ORIGIN}/panel`, asHost('ibmiel.localhost:3000'));
    expect(res.status()).toBe(307);
    // Relativo a propósito: un Location absoluto sacaría al usuario del
    // subdominio de su institución y el tenant se resolvería mal.
    expect(res.headers()['location']).toBe('/login');
  });

  test('las rutas del editor tampoco se ven sin sesión', async ({ request }) => {
    // Se prueban todas las rutas del grupo (portal), no solo /panel: el riesgo
    // real es añadir una página nueva y que quede fuera del guard.
    for (const ruta of [
      '/panel/cursos',
      '/panel/cursos/cualquier-curso',
      '/cursos',
      '/cursos/cualquier-curso',
    ]) {
      const res = await request.get(`${ORIGIN}${ruta}`, asHost('ibmiel.localhost:3000'));
      expect(res.status(), ruta).toBe(307);
      expect(res.headers()['location'], ruta).toBe('/login');
    }
  });

  test('el login del tenant se muestra', async ({ page }) => {
    await page.goto(`${TENANT}/login`);
    await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
  });

  test('el panel no existe en el host de marketing', async ({ request }) => {
    const res = await request.get(`${ORIGIN}/panel`, asHost('localhost:3000'));
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toBe('/');
  });
});

test.describe('el borde rechaza hosts que no son tenants', () => {
  for (const { host, motivo } of [
    { host: 'a.b.localhost:3000', motivo: 'más de un nivel de subdominio' },
    { host: 'admin.localhost:3000', motivo: 'subdominio reservado' },
    { host: 'api.localhost:3000', motivo: 'subdominio reservado' },
  ]) {
    test(`404 en ${host} (${motivo})`, async ({ request }) => {
      const res = await request.get(`${ORIGIN}/panel`, asHost(host));
      expect(res.status()).toBe(404);
    });
  }
});
