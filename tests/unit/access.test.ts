import { describe, expect, it } from 'vitest';
import { decideAccess, isStaff, type AccessInput } from '@/lib/auth/access';

const org = {
  id: '0a000000-0000-0000-0000-000000000001',
  slug: 'instituto-a',
  name: 'Instituto A',
  status: 'active' as const,
};

function input(over: Partial<AccessInput> = {}): AccessInput {
  return {
    target: { kind: 'tenant', slug: 'instituto-a' },
    userId: 'aa000000-0000-0000-0000-000000000002',
    organization: org,
    role: 'student',
    isPlatformAdmin: false,
    ...over,
  };
}

describe('decideAccess', () => {
  it('deja entrar a un miembro con la organización activa', () => {
    expect(decideAccess(input())).toEqual({ kind: 'allow', role: 'student' });
  });

  it('manda al login cuando no hay sesión, sin revelar si la organización existe', () => {
    // El orden importa: si se comprobara la organización antes que la sesión, un
    // visitante podría distinguir subdominios reales de inventados.
    expect(decideAccess(input({ userId: null }))).toEqual({ kind: 'sign-in' });
    expect(decideAccess(input({ userId: null, organization: null }))).toEqual({
      kind: 'sign-in',
    });
  });

  it('trata "no existe" y "no soy miembro" con la misma respuesta', () => {
    expect(decideAccess(input({ organization: null }))).toEqual({
      kind: 'forbidden',
      reason: 'no-membership',
    });
    expect(decideAccess(input({ role: null }))).toEqual({
      kind: 'forbidden',
      reason: 'no-membership',
    });
  });

  it('cierra el portal de una organización suspendida o cancelada', () => {
    for (const status of ['suspended', 'cancelled'] as const) {
      expect(decideAccess(input({ organization: { ...org, status } }))).toEqual({
        kind: 'forbidden',
        reason: 'organization-suspended',
      });
    }
  });

  it('deja pasar a trial y active', () => {
    for (const status of ['trial', 'active'] as const) {
      expect(decideAccess(input({ organization: { ...org, status } }))).toMatchObject({
        kind: 'allow',
      });
    }
  });

  it('el admin de plataforma entra sin membresía, incluso si está suspendida', () => {
    expect(
      decideAccess(
        input({ role: null, isPlatformAdmin: true, organization: { ...org, status: 'suspended' } }),
      ),
    ).toEqual({ kind: 'allow', role: 'platform_admin' });
  });

  it('no autoriza nada fuera de un host de organización', () => {
    for (const target of [
      { kind: 'marketing' } as const,
      { kind: 'platform' } as const,
      { kind: 'unknown', host: 'x.y' } as const,
    ]) {
      expect(decideAccess(input({ target }))).toEqual({ kind: 'not-a-portal' });
    }
  });

  it('un dominio propio se autoriza igual que un subdominio', () => {
    expect(
      decideAccess(input({ target: { kind: 'custom-domain', host: 'portal.instituto.cl' } })),
    ).toMatchObject({ kind: 'allow' });
  });
});

describe('isStaff', () => {
  it('solo staff edita contenido', () => {
    expect(isStaff('org_admin')).toBe(true);
    expect(isStaff('instructor')).toBe(true);
    expect(isStaff('platform_admin')).toBe(true);
    expect(isStaff('student')).toBe(false);
  });
});
