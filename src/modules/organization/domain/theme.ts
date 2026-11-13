import { BadRequestException } from '@nestjs/common';

/**
 * The semantic color tokens a business can set by hand, mirrored in the UI's
 * design system (theme-presets.ts). Kept as an explicit allow-list because the
 * theme arrives as free-form JSON from the client: anything not named here is
 * rejected rather than stored, so the column can't become a dumping ground or
 * carry values the UI will never read.
 */
export const THEME_TOKENS = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'hover',
  'onHover',
  'surface',
  'surfaceContainer',
  'surfaceContainerLow',
  'onSurface',
  'onSurfaceVariant',
  'outline',
  'outlineVariant',
  'success',
  'onSuccess',
  'warning',
  'onWarning',
  'error',
  'onError',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeColors = Record<ThemeToken, string>;
export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ThemeDocument = Record<ThemeMode, ThemeColors>;

const HEX = /^#[0-9a-f]{6}$/i;

function parseMode(value: unknown, mode: ThemeMode): ThemeColors {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new BadRequestException(`El tema no trae los colores del modo ${mode}`);
  const source = value as Record<string, unknown>;
  const unknown = Object.keys(source).filter(
    (key) => !THEME_TOKENS.includes(key as ThemeToken),
  );
  if (unknown.length)
    throw new BadRequestException(
      `Colores no reconocidos en modo ${mode}: ${unknown.slice(0, 5).join(', ')}`,
    );
  const colors = {} as ThemeColors;
  for (const token of THEME_TOKENS) {
    const raw = source[token];
    // Every token is required: a partial palette would leave the UI reading
    // whichever value the previous theme left behind.
    if (typeof raw !== 'string' || !HEX.test(raw.trim()))
      throw new BadRequestException(
        `El color "${token}" del modo ${mode} debe ser un hex #RRGGBB`,
      );
    colors[token] = raw.trim().toLowerCase();
  }
  return colors;
}

/**
 * Validates a theme coming from the API. Null means "no custom theme", which
 * is how a business goes back to the built-in palette.
 */
export function parseTheme(value: unknown): ThemeDocument | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('El tema debe traer los modos claro y oscuro');
  const source = value as Record<string, unknown>;
  const unknownModes = Object.keys(source).filter(
    (key) => !THEME_MODES.includes(key as ThemeMode),
  );
  if (unknownModes.length)
    throw new BadRequestException(
      `Modos no reconocidos: ${unknownModes.slice(0, 5).join(', ')}`,
    );
  return {
    light: parseMode(source['light'], 'light'),
    dark: parseMode(source['dark'], 'dark'),
  };
}
