import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { parseTheme, THEME_TOKENS, type ThemeColors } from './theme.js';

function palette(color = '#112233'): ThemeColors {
  return Object.fromEntries(THEME_TOKENS.map((token) => [token, color])) as ThemeColors;
}

describe('parseTheme', () => {
  it('acepta un tema completo y normaliza a minúsculas', () => {
    const result = parseTheme({ light: palette('#AABBCC'), dark: palette('#112233') });
    expect(result?.light.primary).toBe('#aabbcc');
    expect(result?.dark.onSurface).toBe('#112233');
  });

  it('trata null como "sin tema personalizado"', () => {
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
  });

  it('rechaza claves de color desconocidas en vez de guardarlas', () => {
    const light = { ...palette(), inyectado: '#000000' };
    expect(() => parseTheme({ light, dark: palette() })).toThrow(BadRequestException);
  });

  it('rechaza modos desconocidos', () => {
    expect(() => parseTheme({ light: palette(), dark: palette(), sepia: palette() }))
      .toThrow(BadRequestException);
  });

  it('exige la paleta completa: un token faltante deja la UI leyendo valores viejos', () => {
    const incomplete = palette();
    delete (incomplete as Partial<ThemeColors>).hover;
    expect(() => parseTheme({ light: incomplete, dark: palette() }))
      .toThrow(BadRequestException);
  });

  it('exige hex de seis dígitos', () => {
    for (const invalid of ['#fff', 'rojo', '#12345g', 'rgb(0,0,0)', '']) {
      expect(() => parseTheme({ light: palette(invalid), dark: palette() }))
        .toThrow(BadRequestException);
    }
  });

  it('exige ambos modos', () => {
    expect(() => parseTheme({ light: palette() })).toThrow(BadRequestException);
  });

  it('rechaza un arreglo en lugar de un objeto', () => {
    expect(() => parseTheme([palette()])).toThrow(BadRequestException);
    expect(() => parseTheme({ light: [], dark: palette() })).toThrow(BadRequestException);
  });
});
