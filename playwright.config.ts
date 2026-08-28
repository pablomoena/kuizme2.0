import { defineConfig, devices } from '@playwright/test';

// Algunos entornos traen Chromium preinstalado en una ruta fija y con una
// revisión distinta a la que espera el paquete. Ahí se apunta el binario en vez
// de descargar otro. Sin la variable, comportamiento normal de Playwright.
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launch = chromium ? { launchOptions: { executablePath: chromium } } : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // Playwright levanta la app por su cuenta: así la prueba corre igual en local
  // y en CI, sin que nadie tenga que recordar arrancar el servidor primero.
  // Las claves son de relleno a propósito — estas pruebas comprueban el guard y
  // el borde sin sesión, así que no tocan Supabase.
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'placeholder-anon-key-para-e2e',
      NEXT_PUBLIC_ROOT_DOMAIN: 'localhost',
    },
  },

  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], ...launch } },
    { name: 'movil', use: { ...devices['Pixel 7'], ...launch } },
  ],
});
