import { describe, expect, it } from 'vitest';
import {
  normalizeHost,
  requiresOrganization,
  resolveTenant,
  RESERVED_SLUGS,
} from '@/lib/tenant/resolve';

const ROOT = 'kuizme.com';

describe('normalizeHost', () => {
  it('baja a minúsculas y quita el puerto', () => {
    expect(normalizeHost('App.Kuizme.COM:3000')).toBe('app.kuizme.com');
  });

  it('tolera vacío y nulo', () => {
    expect(normalizeHost(null)).toBe('');
    expect(normalizeHost(undefined)).toBe('');
    expect(normalizeHost('   ')).toBe('');
  });

  it('no rompe IPv6 entre corchetes', () => {
    expect(normalizeHost('[::1]:3000')).toBe('[::1]');
  });
});

describe('resolveTenant', () => {
  it('el dominio raíz es el sitio de marketing', () => {
    expect(resolveTenant('kuizme.com', ROOT)).toEqual({ kind: 'marketing' });
    expect(resolveTenant('www.kuizme.com', ROOT)).toEqual({ kind: 'marketing' });
  });

  it('app resuelve al plano de control', () => {
    expect(resolveTenant('app.kuizme.com', ROOT)).toEqual({ kind: 'platform' });
  });

  it('un subdominio cualquiera resuelve a tenant', () => {
    expect(resolveTenant('ibmiel.kuizme.com', ROOT)).toEqual({
      kind: 'tenant',
      slug: 'ibmiel',
    });
  });

  it('ignora mayúsculas y puerto', () => {
    expect(resolveTenant('IBMiel.Kuizme.com:3000', ROOT)).toEqual({
      kind: 'tenant',
      slug: 'ibmiel',
    });
  });

  it.each([...RESERVED_SLUGS].filter((s) => s !== 'app' && s !== 'www'))(
    'rechaza el subdominio reservado %s',
    (slug) => {
      expect(resolveTenant(`${slug}.${ROOT}`, ROOT).kind).toBe('unknown');
    },
  );

  it('rechaza subdominios anidados', () => {
    // Sin esto, "victima.atacante.kuizme.com" podría colarse como tenant.
    expect(resolveTenant('a.b.kuizme.com', ROOT).kind).toBe('unknown');
  });

  it.each([
    '-empieza-con-guion',
    'termina-con-guion-',
    'a',
    'con_underscore',
    'con.punto',
    'a'.repeat(51),
  ])('rechaza el slug inválido %s', (slug) => {
    expect(resolveTenant(`${slug}.${ROOT}`, ROOT).kind).toBe('unknown');
  });

  it('un host ajeno es candidato a dominio propio', () => {
    expect(resolveTenant('portal.instituto.cl', ROOT)).toEqual({
      kind: 'custom-domain',
      host: 'portal.instituto.cl',
    });
  });

  it('no confunde un dominio que solo termina parecido', () => {
    // "nokuizme.com" no es subdominio de "kuizme.com".
    expect(resolveTenant('nokuizme.com', ROOT)).toEqual({
      kind: 'custom-domain',
      host: 'nokuizme.com',
    });
  });

  it('host vacío es desconocido, no marketing', () => {
    expect(resolveTenant(null, ROOT).kind).toBe('unknown');
    expect(resolveTenant('', ROOT).kind).toBe('unknown');
  });

  it('funciona en desarrollo con localhost', () => {
    expect(resolveTenant('localhost:3000', 'localhost')).toEqual({ kind: 'marketing' });
    expect(resolveTenant('ibmiel.localhost:3000', 'localhost')).toEqual({
      kind: 'tenant',
      slug: 'ibmiel',
    });
  });
});

describe('requiresOrganization', () => {
  it('solo tenant y dominio propio necesitan organización', () => {
    expect(requiresOrganization({ kind: 'tenant', slug: 'x' })).toBe(true);
    expect(requiresOrganization({ kind: 'custom-domain', host: 'x.cl' })).toBe(true);
    expect(requiresOrganization({ kind: 'marketing' })).toBe(false);
    expect(requiresOrganization({ kind: 'platform' })).toBe(false);
  });
});
