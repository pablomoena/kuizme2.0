import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  cifrar,
  descifrar,
  ErrorDeCifrado,
  hashDeState,
  igualesEnTiempoConstante,
  llaveDesde,
  nuevoState,
} from '@/lib/integrations/cifrado';

const llave = randomBytes(32);
const otraLlave = randomBytes(32);
const TOKEN = 'zoom_refresh_token_de_ejemplo.con.puntos-y_guiones';

describe('cifrar / descifrar', () => {
  it('vuelve al texto original', () => {
    expect(descifrar(cifrar(TOKEN, llave), llave)).toBe(TOKEN);
  });

  it('el cifrado no contiene el texto plano', () => {
    // Obvio, y por eso conviene afirmarlo: un error de formato que dejara el
    // token en claro pasaría todos los demás tests.
    expect(cifrar(TOKEN, llave)).not.toContain('zoom_refresh');
  });

  it('dos cifrados del MISMO texto son distintos', () => {
    // Nonce nuevo cada vez. Si se repitiera, dos mensajes con el mismo nonce y la
    // misma llave revelan su XOR y GCM deja de proteger nada.
    const a = cifrar(TOKEN, llave);
    const b = cifrar(TOKEN, llave);
    expect(a).not.toBe(b);
    expect(descifrar(a, llave)).toBe(descifrar(b, llave));
  });

  it('con otra llave no descifra', () => {
    expect(() => descifrar(cifrar(TOKEN, llave), otraLlave)).toThrow(ErrorDeCifrado);
  });

  it('un dato alterado falla en vez de devolver basura', () => {
    // Esto es lo que compra GCM sobre CBC: sin autenticación, un byte cambiado
    // daría un texto distinto que después se mandaría al proveedor.
    const bueno = cifrar(TOKEN, llave);
    const partes = bueno.split('.');
    const cuerpo = Buffer.from(partes[2]!, 'base64url');
    cuerpo[0] = cuerpo[0]! ^ 0xff;
    const alterado = `${partes[0]}.${partes[1]}.${cuerpo.toString('base64url')}`;

    expect(() => descifrar(alterado, llave)).toThrow(ErrorDeCifrado);
  });

  it('un nonce alterado también falla', () => {
    const partes = cifrar(TOKEN, llave).split('.');
    const nonce = Buffer.from(partes[1]!, 'base64url');
    nonce[0] = nonce[0]! ^ 0xff;
    expect(() =>
      descifrar(`${partes[0]}.${nonce.toString('base64url')}.${partes[2]}`, llave),
    ).toThrow(ErrorDeCifrado);
  });

  it('rechaza formatos que no reconoce', () => {
    for (const malo of ['', 'texto-plano', 'v1.solo-dos-partes', 'v2.aaaa.bbbb']) {
      expect(() => descifrar(malo, llave)).toThrow(ErrorDeCifrado);
    }
  });

  it('rechaza un cifrado truncado', () => {
    const partes = cifrar(TOKEN, llave).split('.');
    expect(() => descifrar(`${partes[0]}.${partes[1]}.AAAA`, llave)).toThrow(ErrorDeCifrado);
  });

  it('el mensaje de error no distingue llave mala de dato alterado', () => {
    // La diferencia solo le sirve a quien está probando llaves.
    const conOtraLlave = (() => {
      try {
        descifrar(cifrar(TOKEN, llave), otraLlave);
      } catch (e) {
        return (e as Error).message;
      }
    })();

    const partes = cifrar(TOKEN, llave).split('.');
    const cuerpo = Buffer.from(partes[2]!, 'base64url');
    cuerpo[0] = cuerpo[0]! ^ 0xff;
    const alteradoMsg = (() => {
      try {
        descifrar(`${partes[0]}.${partes[1]}.${cuerpo.toString('base64url')}`, llave);
      } catch (e) {
        return (e as Error).message;
      }
    })();

    expect(conOtraLlave).toBe(alteradoMsg);
  });

  it('cifra tokens vacíos y muy largos sin romperse', () => {
    expect(descifrar(cifrar('', llave), llave)).toBe('');
    const largo = 'x'.repeat(10_000);
    expect(descifrar(cifrar(largo, llave), llave)).toBe(largo);
  });

  it('conserva acentos y emoji', () => {
    const raro = 'matrícula · año · 🇨🇱';
    expect(descifrar(cifrar(raro, llave), llave)).toBe(raro);
  });
});

describe('llaveDesde', () => {
  it('acepta 32 bytes en base64', () => {
    expect(llaveDesde(randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  it('rechaza que falte, con instrucciones', () => {
    for (const v of [undefined, '']) {
      expect(() => llaveDesde(v)).toThrow(/openssl rand -base64 32/);
    }
  });

  it('rechaza una llave del tamaño equivocado', () => {
    // Una frase corta usada como llave da 256 bits de los cuales la mitad son
    // predecibles. Falla al arrancar, no después de un año cifrando.
    expect(() => llaveDesde(Buffer.from('mi-contraseña').toString('base64'))).toThrow(
      /necesita 32/,
    );
    expect(() => llaveDesde(randomBytes(16).toString('base64'))).toThrow(/necesita 32/);
    expect(() => llaveDesde(randomBytes(64).toString('base64'))).toThrow(/necesita 32/);
  });

  it('no acepta una frase en claro por parecer larga', () => {
    // 'contraseña-muy-larga-pero-no-base64' decodifica a otra cantidad de bytes:
    // el chequeo de tamaño es lo que atrapa este caso, no un chequeo de formato.
    expect(() => llaveDesde('contraseña-muy-larga-que-no-es-base64-de-32')).toThrow(
      ErrorDeCifrado,
    );
  });
});

describe('state de OAuth', () => {
  it('cada state es distinto y bien largo', () => {
    const muchos = new Set(Array.from({ length: 500 }, () => nuevoState()));
    expect(muchos.size).toBe(500);
    expect(nuevoState().length).toBeGreaterThanOrEqual(43); // 32 bytes en base64url
  });

  it('el hash es estable y no contiene el state', () => {
    const s = nuevoState();
    expect(hashDeState(s)).toBe(hashDeState(s));
    expect(hashDeState(s)).not.toContain(s);
  });

  it('states distintos dan hashes distintos', () => {
    expect(hashDeState('a')).not.toBe(hashDeState('b'));
  });
});

describe('igualesEnTiempoConstante', () => {
  it('compara bien', () => {
    expect(igualesEnTiempoConstante('abc', 'abc')).toBe(true);
    expect(igualesEnTiempoConstante('abc', 'abd')).toBe(false);
  });

  it('largos distintos no revientan', () => {
    // timingSafeEqual lanza si los buffers miden distinto; hay que atajarlo antes.
    expect(igualesEnTiempoConstante('abc', 'abcdef')).toBe(false);
    expect(igualesEnTiempoConstante('', 'x')).toBe(false);
    expect(igualesEnTiempoConstante('', '')).toBe(true);
  });
});
