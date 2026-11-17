/**
 * Fotografías del catálogo, dibujadas por la semilla.
 *
 * El POS y el autoservicio solo muestran un producto si tiene una imagen
 * confirmada (catalog-menu.store, branchMenu): sin fotos, la carta publicada
 * sale vacía y el POS dice «No hay carta publicada para esta sucursal y
 * horario». Las imágenes se suben por MediaService.upload y se vinculan por
 * CatalogService.replaceMedia, como desde la pantalla de producto.
 *
 * No se descarga nada: cada imagen es una ilustración plana dibujada aquí —
 * taza con su bebida, jarro de barro, vaso con hielo, plato del desayuno—,
 * rasterizada a 2× y reducida para suavizar bordes, y codificada como PNG
 * con zlib. Sin dependencias.
 */
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const SCALE = 2;
const W = SIZE * SCALE;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: string, b: string, t: number): string => {
  const x = hex(a), y = hex(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

class Canvas {
  readonly px = new Float32Array(W * W * 3);

  background(top: string, bottom: string): void {
    const a = hex(top), b = hex(bottom);
    for (let y = 0; y < W; y++) {
      const t = y / (W - 1);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        for (let c = 0; c < 3; c++) this.px[i + c] = a[c] + (b[c] - a[c]) * t;
      }
    }
  }

  /** Pinta donde `inside` es verdadero, dentro de la caja en coordenadas lógicas. */
  private paint(box: [number, number, number, number], inside: (x: number, y: number) => boolean, color: string, alpha: number): void {
    const [r, g, b] = hex(color);
    const x0 = Math.max(0, Math.floor(box[0] * SCALE)), x1 = Math.min(W - 1, Math.ceil(box[2] * SCALE));
    const y0 = Math.max(0, Math.floor(box[1] * SCALE)), y1 = Math.min(W - 1, Math.ceil(box[3] * SCALE));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        if (!inside((px + 0.5) / SCALE, (py + 0.5) / SCALE)) continue;
        const i = (py * W + px) * 3;
        this.px[i] += (r - this.px[i]) * alpha;
        this.px[i + 1] += (g - this.px[i + 1]) * alpha;
        this.px[i + 2] += (b - this.px[i + 2]) * alpha;
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string, alpha = 1): void {
    this.paint([cx - rx, cy - ry, cx + rx, cy + ry], (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, color, alpha);
  }

  ring(cx: number, cy: number, rx: number, ry: number, width: number, color: string, alpha = 1): void {
    this.paint([cx - rx, cy - ry, cx + rx, cy + ry], (x, y) => {
      const outer = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const inner = ((x - cx) / (rx - width)) ** 2 + ((y - cy) / (ry - width)) ** 2;
      return outer <= 1 && inner > 1;
    }, color, alpha);
  }

  rect(x: number, y: number, w: number, h: number, r: number, color: string, alpha = 1): void {
    this.paint([x, y, x + w, y + h], (px, py) => {
      const dx = Math.max(x + r - px, 0, px - (x + w - r));
      const dy = Math.max(y + r - py, 0, py - (y + h - r));
      return px >= x && px <= x + w && py >= y && py <= y + h && dx * dx + dy * dy <= r * r;
    }, color, alpha);
  }

  polygon(points: [number, number][], color: string, alpha = 1): void {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    this.paint([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], (x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, color, alpha);
  }

  /** Un trazo grueso de A a B, con extremos redondos. */
  line(ax: number, ay: number, bx: number, by: number, width: number, color: string, alpha = 1): void {
    const r = width / 2;
    this.paint([Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r], (x, y) => {
      const vx = bx - ax, vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      return (x - ax - vx * t) ** 2 + (y - ay - vy * t) ** 2 <= r * r;
    }, color, alpha);
  }

  /** Reduce 2× → 1× promediando, y codifica PNG RGB. */
  png(): Buffer {
    const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
    for (let y = 0; y < SIZE; y++) {
      raw[y * (SIZE * 3 + 1)] = 0;
      for (let x = 0; x < SIZE; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = 0; dy < SCALE; dy++)
            for (let dx = 0; dx < SCALE; dx++) sum += this.px[((y * SCALE + dy) * W + x * SCALE + dx) * 3 + c];
          raw[y * (SIZE * 3 + 1) + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(sum / (SCALE * SCALE))));
        }
      }
    }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8; // bits
    ihdr[9] = 2; // RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- piezas ----------------------------------------------------------------

/** La mesa de madera al fondo y la sombra del objeto. */
function scene(c: Canvas, top: string, bottom: string): void {
  c.background(top, bottom);
  c.rect(0, 430, 512, 82, 0, '#8A5A3B');
  c.rect(0, 430, 512, 6, 0, '#6E4429');
  for (const y of [455, 482]) c.rect(0, y, 512, 2, 0, '#7A4E32', 0.6);
}

function steam(c: Canvas, x: number, top: number): void {
  for (const dx of [-26, 0, 26]) {
    for (let t = 0; t < 1; t += 0.02) {
      const y = top - t * 70;
      const xx = x + dx + Math.sin(t * Math.PI * 3 + dx) * 9;
      c.ellipse(xx, y, 4.5, 4.5, '#FFFFFF', 0.08 + 0.12 * (1 - t));
    }
  }
}

interface CupStyle {
  cup: string;
  drink: string;
  /** Lo que va encima de la bebida. */
  top?: 'crema' | 'heart' | 'foam' | 'drizzle' | 'cinnamon' | 'whip' | 'plain';
  small?: boolean;
}

/** Taza de cerámica con plato, vista en tres cuartos. */
function cup(c: Canvas, s: CupStyle): void {
  const k = s.small ? 0.78 : 1;
  const cx = 256, base = 400;
  const rim = base - 150 * k, rx = 104 * k;
  c.ellipse(cx, 425, 175 * k, 22, '#000000', 0.18);
  c.ellipse(cx, base + 6, 168 * k, 34 * k, mix(s.cup, '#000000', 0.18));
  c.ellipse(cx, base, 168 * k, 32 * k, s.cup);
  c.ellipse(cx, base - 2, 110 * k, 18 * k, mix(s.cup, '#000000', 0.08));
  c.ring(cx + rx + 6 * k, rim + 62 * k, 40 * k, 46 * k, 15 * k, mix(s.cup, '#000000', 0.06));
  c.polygon([[cx - rx, rim], [cx + rx, rim], [cx + rx * 0.72, base - 12], [cx - rx * 0.72, base - 12]], s.cup);
  c.ellipse(cx, base - 12, rx * 0.72, 16 * k, s.cup);
  c.polygon([[cx - rx * 0.92, rim + 8], [cx - rx * 0.78, rim + 8], [cx - rx * 0.6, base - 20], [cx - rx * 0.66, base - 20]], '#FFFFFF', 0.22);
  c.ellipse(cx, rim, rx, 26 * k, mix(s.cup, '#FFFFFF', 0.25));
  c.ellipse(cx, rim + 2, rx - 9 * k, 20 * k, s.drink);
  const lighter = mix(s.drink, '#FFF6E8', 0.65);
  switch (s.top) {
    case 'crema':
      c.ring(cx, rim + 2, rx - 9 * k, 20 * k, 9 * k, mix(s.drink, '#D9A066', 0.7));
      break;
    case 'heart':
      c.ellipse(cx - 15 * k, rim - 1, 17 * k, 9 * k, lighter);
      c.ellipse(cx + 15 * k, rim - 1, 17 * k, 9 * k, lighter);
      c.polygon([[cx - 31 * k, rim + 1], [cx + 31 * k, rim + 1], [cx, rim + 15 * k]], lighter);
      break;
    case 'foam':
      c.ellipse(cx, rim + 2, rx - 18 * k, 15 * k, '#F7EEDF');
      c.ellipse(cx + 10, rim + 1, 26 * k, 7 * k, '#FFFFFF', 0.7);
      break;
    case 'cinnamon':
      c.ellipse(cx, rim + 2, rx - 18 * k, 15 * k, '#F2E2C8');
      for (let i = 0; i < 22; i++) c.ellipse(cx + Math.sin(i * 2.3) * 60 * k, rim + Math.cos(i * 1.7) * 9 * k, 2.2, 1.6, '#9C5A2E', 0.8);
      break;
    case 'drizzle':
      c.ellipse(cx, rim + 2, rx - 18 * k, 15 * k, '#F2E2C8');
      for (const o of [-24, 0, 24]) c.line(cx + o - 30 * k, rim - 6, cx + o + 30 * k, rim + 10, 4, '#5B2E16');
      break;
    case 'whip':
      for (const [dx, dy, r] of [[-30, 0, 26], [0, -12, 30], [30, 0, 26], [0, 6, 28]] as const) c.ellipse(cx + dx * k, rim + dy * k, r * k, r * 0.62 * k, '#FFFDF8');
      for (const o of [-18, 6, 22]) c.line(cx + o - 10, rim - 14, cx + o + 10, rim - 4, 3, '#5B2E16');
      break;
  }
  steam(c, cx, rim - 40);
}

/** Jarro de barro guatemalteco, sin plato. */
function jarro(c: Canvas, drink: string, top: 'plain' | 'cinnamon' | 'foam' = 'plain'): void {
  const cx = 250, rim = 248, base = 412;
  c.ellipse(cx, 425, 140, 18, '#000000', 0.18);
  c.ring(cx + 112, 318, 46, 52, 17, '#9E4B26');
  c.ellipse(cx, 335, 118, 92, '#B85C32');
  c.rect(cx - 104, rim, 208, 60, 0, '#B85C32');
  c.ellipse(cx, base - 8, 82, 14, '#A3502A');
  c.ellipse(cx - 52, 330, 18, 64, '#FFFFFF', 0.13);
  c.rect(cx - 112, 300, 224, 8, 4, '#D9A25F', 0.85);
  for (let i = 0; i < 8; i++) c.ellipse(cx - 84 + i * 24, 304, 4, 4, '#F2E6CF');
  c.ellipse(cx, rim, 108, 26, '#C96B3E');
  c.ellipse(cx, rim + 3, 96, 20, drink);
  if (top === 'cinnamon') for (let i = 0; i < 18; i++) c.ellipse(cx + Math.sin(i * 2.1) * 60, rim + 3 + Math.cos(i * 1.3) * 9, 2.4, 1.7, '#8A4A22', 0.85);
  if (top === 'foam') c.ellipse(cx, rim + 3, 80, 14, mix(drink, '#FFFFFF', 0.45));
  steam(c, cx, rim - 38);
}

interface GlassStyle {
  liquid: string;
  /** Capa de abajo, para un latte frío o un café bombón. */
  bottom?: string;
  whip?: boolean;
  lemon?: boolean;
  mint?: boolean;
  ice?: boolean;
  straw?: string;
  short?: boolean;
}

/** Vaso de vidrio con hielo y popote. */
function glass(c: Canvas, s: GlassStyle): void {
  const cx = 256, top = s.short ? 210 : 130, base = 410;
  const half = s.short ? 78 : 82, halfBase = s.short ? 66 : 64;
  c.ellipse(cx, 424, half + 30, 18, '#000000', 0.15);
  const liquidTop = top + (s.whip ? 40 : 34);
  if (s.straw) c.line(cx + 34, top - 70, cx + 12, base - 40, 13, s.straw);
  c.polygon([[cx - half + 8, liquidTop], [cx + half - 8, liquidTop], [cx + halfBase - 6, base - 8], [cx - halfBase + 6, base - 8]], s.liquid);
  if (s.bottom) c.polygon([[cx - halfBase - 2, base - 110], [cx + halfBase + 2, base - 110], [cx + halfBase - 6, base - 8], [cx - halfBase + 6, base - 8]], s.bottom);
  if (s.ice) for (const [dx, dy] of [[-30, 20], [24, 34], [-8, 70], [30, 96], [-34, 120]] as const) {
    c.rect(cx + dx - 20, liquidTop + dy - 20, 40, 38, 8, '#FFFFFF', 0.35);
    c.rect(cx + dx - 14, liquidTop + dy - 14, 14, 10, 4, '#FFFFFF', 0.4);
  }
  if (s.mint) for (const [dx, dy, a] of [[-26, 12, 0.6], [20, 52, -0.5], [-10, 96, 0.3]] as const) {
    c.polygon([[cx + dx, liquidTop + dy], [cx + dx + 22, liquidTop + dy - 10 + a * 10], [cx + dx + 40, liquidTop + dy + 4], [cx + dx + 18, liquidTop + dy + 12]], '#4E9A4A', 0.9);
  }
  if (s.whip) {
    for (const [dx, dy, r] of [[-38, 14, 30], [0, -6, 36], [38, 14, 30], [0, 22, 34]] as const) c.ellipse(cx + dx, top + dy, r, r * 0.7, '#FFFDF8');
    for (const o of [-24, 4, 28]) c.line(cx + o - 12, top - 8, cx + o + 12, top + 6, 4, '#5B2E16');
  }
  // El vidrio: contorno y brillo.
  c.polygon([[cx - half, top], [cx - half + 9, top], [cx - halfBase + 9, base], [cx - halfBase, base]], '#FFFFFF', 0.55);
  c.polygon([[cx + half - 9, top], [cx + half, top], [cx + halfBase, base], [cx + halfBase - 9, base]], '#FFFFFF', 0.4);
  c.polygon([[cx - half + 18, top + 20], [cx - half + 30, top + 20], [cx - halfBase + 28, base - 30], [cx - halfBase + 16, base - 30]], '#FFFFFF', 0.25);
  c.ellipse(cx, base - 4, halfBase, 10, '#FFFFFF', 0.35);
  c.ring(cx, top, half, 12, 3, '#FFFFFF', 0.7);
  if (s.lemon) {
    c.ellipse(cx - half + 4, top + 6, 40, 40, '#E9D84A');
    c.ellipse(cx - half + 4, top + 6, 33, 33, '#F6EC9A');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.line(cx - half + 4, top + 6, cx - half + 4 + Math.cos(a) * 30, top + 6 + Math.sin(a) * 30, 3, '#E9D84A');
    }
  }
}

/** Plato blanco visto desde arriba, en perspectiva suave. */
function plate(c: Canvas): { cx: number; cy: number } {
  const cx = 256, cy = 330;
  c.ellipse(cx, cy + 14, 205, 92, '#000000', 0.16);
  c.ellipse(cx, cy, 205, 90, '#F4F1EA');
  c.ellipse(cx, cy + 4, 160, 66, '#FFFFFF');
  c.ring(cx, cy, 205, 90, 4, '#D9D3C6');
  return { cx, cy };
}

function croissantShape(c: Canvas, cx: number, cy: number, scale = 1): void {
  const parts = [[-88, 22, 30, 22], [-56, 4, 38, 30], [-18, -6, 46, 38], [22, -2, 44, 36], [60, 10, 36, 28], [90, 26, 26, 20]] as const;
  for (const [dx, dy, rx, ry] of parts) c.ellipse(cx + dx * scale, cy + dy * scale, rx * scale, ry * scale, '#C9822E');
  for (const [dx, dy, rx, ry] of parts) c.ellipse(cx + dx * scale, cy + (dy - 6) * scale, rx * 0.8 * scale, ry * 0.6 * scale, '#E3A44A');
  for (const [dx, dy, rx] of parts) c.line(cx + (dx - rx * 0.4) * scale, cy + (dy - 10) * scale, cx + (dx + rx * 0.2) * scale, cy + (dy + 8) * scale, 3, '#A9651F', 0.6);
}

// --- un dibujo por producto --------------------------------------------------

const HOT: [string, string] = ['#F6EAD7', '#E7CFAE'];
const COLD: [string, string] = ['#E3F2F3', '#BFDDE2'];
const FOOD: [string, string] = ['#F8EDCF', '#EBD3A2'];
const BAKERY: [string, string] = ['#F8E1D2', '#EBC2A6'];

const DRAW: Record<string, (c: Canvas) => void> = {
  'P-ESPRESSO': (c) => { scene(c, ...HOT); cup(c, { cup: '#FBF8F2', drink: '#3B1F12', top: 'crema', small: true }); },
  'P-AMERICANO': (c) => { scene(c, ...HOT); cup(c, { cup: '#2F3E46', drink: '#2A160C', top: 'plain' }); },
  'P-PICHEL': (c) => { scene(c, ...HOT); jarro(c, '#3A1E10'); },
  'P-CAFE-LECHE': (c) => { scene(c, ...HOT); cup(c, { cup: '#E9DCC6', drink: '#A8744A', top: 'foam' }); },
  'P-CAPUCHINO': (c) => { scene(c, ...HOT); cup(c, { cup: '#FBF8F2', drink: '#8B5A36', top: 'cinnamon' }); },
  'P-LATTE': (c) => { scene(c, ...HOT); cup(c, { cup: '#5E7D6A', drink: '#9A6A44', top: 'heart' }); },
  'P-MOCHA': (c) => { scene(c, ...HOT); cup(c, { cup: '#B5583A', drink: '#5A3020', top: 'whip' }); },
  'P-BOMBON': (c) => { scene(c, ...HOT); glass(c, { liquid: '#3B1F12', bottom: '#EED9A8', short: true }); },
  'P-CHOCOLATE': (c) => { scene(c, ...HOT); jarro(c, '#4A2414', 'foam'); },
  'P-CHAI': (c) => { scene(c, ...HOT); cup(c, { cup: '#D8C3A5', drink: '#B07A4A', top: 'cinnamon' }); },
  'P-TE': (c) => { scene(c, ...HOT); cup(c, { cup: '#FBF8F2', drink: '#C88A2E', top: 'plain' }); c.line(334, 214, 380, 150, 3, '#F4F1EA'); c.rect(366, 130, 34, 30, 4, '#E0B84A'); },
  'P-COLD-BREW': (c) => { scene(c, ...COLD); glass(c, { liquid: '#3A1E10', ice: true, straw: '#2E2E2E' }); },
  'P-LATTE-FRIO': (c) => { scene(c, ...COLD); glass(c, { liquid: '#7A4A2A', bottom: '#EDE3D2', ice: true, straw: '#2E2E2E' }); },
  'P-FRAPPE': (c) => { scene(c, ...COLD); glass(c, { liquid: '#B88B63', whip: true, straw: '#C0392B' }); },
  'P-LIMONADA': (c) => { scene(c, ...COLD); glass(c, { liquid: '#E4EDA8', ice: true, mint: true, lemon: true, straw: '#2E7D32' }); },
  'P-LICUADO': (c) => { scene(c, ...COLD); glass(c, { liquid: '#F2B6B9', straw: '#E57373' }); c.ellipse(170, 400, 30, 26, '#D63B47'); c.polygon([[160, 376], [170, 366], [182, 376]], '#4E9A4A'); },
  'P-ATOL': (c) => { scene(c, ...HOT); jarro(c, '#F0D98A', 'cinnamon'); },
  'P-DESAYUNO-CHAPIN': (c) => {
    scene(c, ...FOOD);
    const { cx, cy } = plate(c);
    c.ellipse(cx - 70, cy - 10, 62, 34, '#2B1B17');
    c.ellipse(cx - 74, cy - 16, 40, 18, '#3E2A22');
    c.ellipse(cx + 55, cy - 22, 52, 30, '#FFFDF6');
    c.ellipse(cx + 55, cy - 26, 20, 14, '#F2B32A');
    for (const [dx, dy] of [[-30, 36], [10, 44], [50, 38]] as const) c.ellipse(cx + dx, cy + dy, 34, 14, '#C9682B');
    c.ellipse(cx + 110, cy + 24, 28, 14, '#FFFFFF');
    for (const [dx, dy] of [[-128, 18], [-112, 34]] as const) c.rect(cx + dx, cy + dy, 28, 18, 4, '#F3EEDD');
  },
  'P-PANQUEQUES': (c) => {
    scene(c, ...FOOD);
    const { cx, cy } = plate(c);
    for (let i = 0; i < 3; i++) {
      c.ellipse(cx, cy - i * 22 + 8, 120, 34, '#B9722E');
      c.ellipse(cx, cy - i * 22, 120, 32, '#E2A75A');
    }
    c.ellipse(cx, cy - 46, 70, 18, '#D99A2B', 0.85);
    c.line(cx + 40, cy - 46, cx + 70, cy + 4, 9, '#D99A2B', 0.85);
    for (const [dx, dy] of [[-40, -58], [0, -66], [36, -56]] as const) {
      c.ellipse(cx + dx, cy + dy, 16, 14, '#D63B47');
      c.polygon([[cx + dx - 8, cy + dy - 10], [cx + dx, cy + dy - 18], [cx + dx + 8, cy + dy - 10]], '#4E9A4A');
    }
  },
  'P-TOSTADA-AGUACATE': (c) => {
    scene(c, ...FOOD);
    const { cx, cy } = plate(c);
    c.rect(cx - 120, cy - 52, 240, 96, 28, '#B47A3C');
    c.rect(cx - 110, cy - 44, 220, 80, 24, '#E1B979');
    for (let i = 0; i < 6; i++) c.ellipse(cx - 80 + i * 32, cy - 6, 20, 30, '#7FA33C');
    for (let i = 0; i < 6; i++) c.ellipse(cx - 80 + i * 32, cy - 6, 14, 24, '#B9D36B');
    c.ellipse(cx + 34, cy - 4, 46, 28, '#FFFDF6');
    c.ellipse(cx + 34, cy - 8, 17, 12, '#F2B32A');
    for (const dx of [-100, -64]) c.ellipse(cx + dx, cy - 4, 12, 10, '#D9483B');
  },
  'P-SANDWICH-CROISSANT': (c) => {
    scene(c, ...FOOD);
    const { cx, cy } = plate(c);
    croissantShape(c, cx, cy + 10, 1.25);
    c.polygon([[cx - 100, cy - 4], [cx + 100, cy - 4], [cx + 90, cy + 10], [cx - 90, cy + 10]], '#E8A3A0');
    c.polygon([[cx - 92, cy - 14], [cx + 92, cy - 14], [cx + 84, cy - 2], [cx - 84, cy - 2]], '#F4C542');
    croissantShape(c, cx, cy - 24, 1.15);
  },
  'P-CROISSANT': (c) => { scene(c, ...BAKERY); c.ellipse(256, 410, 170, 22, '#000000', 0.16); croissantShape(c, 256, 340, 1.5); },
  'P-PAN-BANANO': (c) => {
    scene(c, ...BAKERY);
    c.ellipse(256, 412, 150, 20, '#000000', 0.16);
    c.rect(150, 230, 212, 180, 22, '#6E3E1C');
    c.rect(162, 246, 188, 156, 16, '#C68C4E');
    for (const [x, y] of [[200, 290], [260, 320], [310, 280], [220, 360], [300, 370]] as const) c.ellipse(x, y, 9, 6, '#7A4A22');
  },
  'P-RELLENITO': (c) => {
    scene(c, ...BAKERY);
    const { cx, cy } = plate(c);
    for (const [dx, dy] of [[-70, 4], [0, -14], [70, 4]] as const) {
      c.ellipse(cx + dx, cy + dy, 56, 34, '#8E3B16');
      c.ellipse(cx + dx - 8, cy + dy - 8, 34, 16, '#B5592A');
      for (let i = 0; i < 14; i++) c.ellipse(cx + dx + Math.sin(i * 2.7) * 40, cy + dy + Math.cos(i * 1.9) * 20, 2.2, 2.2, '#FFFFFF', 0.9);
    }
  },
  'P-CHAMPURRADA': (c) => {
    scene(c, ...BAKERY);
    c.ellipse(256, 412, 170, 20, '#000000', 0.16);
    for (const [x, y] of [[180, 360], [330, 350], [256, 300]] as const) {
      c.ellipse(x, y + 8, 90, 34, '#B9722E');
      c.ellipse(x, y, 90, 32, '#E5B15E');
      for (let i = 0; i < 16; i++) c.ellipse(x + Math.sin(i * 2.4) * 60, y + Math.cos(i * 1.7) * 18, 3, 2, '#F7E7C3');
    }
  },
  'P-CHEESECAKE': (c) => {
    scene(c, ...BAKERY);
    const { cx, cy } = plate(c);
    c.polygon([[cx - 120, cy + 30], [cx + 110, cy - 10], [cx + 120, cy + 40], [cx - 110, cy + 60]], '#9C6A3A');
    c.polygon([[cx - 120, cy - 30], [cx + 110, cy - 70], [cx + 110, cy - 10], [cx - 120, cy + 30]], '#F6EBD1');
    c.polygon([[cx - 120, cy - 30], [cx + 110, cy - 70], [cx + 80, cy - 90], [cx - 110, cy - 46]], '#D63B47');
    for (const [dx, dy] of [[-60, -64], [20, -84]] as const) c.ellipse(cx + dx, cy + dy, 18, 14, '#C2263A');
  },
  'P-TRES-LECHES': (c) => {
    scene(c, ...BAKERY);
    const { cx, cy } = plate(c);
    c.rect(cx - 110, cy - 70, 220, 110, 10, '#F3DFB6');
    c.rect(cx - 110, cy - 90, 220, 30, 14, '#FFFDF8');
    for (let i = 0; i < 30; i++) c.ellipse(cx + Math.sin(i * 2.9) * 96, cy - 76 + Math.cos(i * 1.3) * 8, 2.3, 1.7, '#9C5A2E', 0.8);
    c.ellipse(cx, cy - 98, 16, 15, '#B8102E');
    c.line(cx, cy - 110, cx + 10, cy - 130, 3, '#4E7A2E');
  },
  'P-AGUA-PURA': (c) => {
    scene(c, ...COLD);
    c.ellipse(256, 420, 70, 14, '#000000', 0.15);
    c.rect(214, 150, 84, 268, 30, '#CDE8F6', 0.85);
    c.rect(234, 110, 44, 50, 8, '#CDE8F6', 0.9);
    c.rect(236, 92, 40, 24, 6, '#1E6FB8');
    c.rect(214, 250, 84, 70, 0, '#1E88E5');
    c.rect(214, 270, 84, 10, 0, '#FFFFFF', 0.8);
    c.rect(226, 170, 12, 220, 6, '#FFFFFF', 0.45);
  },
  'P-AGUA-MINERAL': (c) => {
    scene(c, ...COLD);
    c.ellipse(256, 420, 64, 14, '#000000', 0.15);
    c.rect(218, 190, 76, 228, 26, '#2E7D4F');
    c.polygon([[236, 120], [276, 120], [292, 196], [220, 196]], '#2E7D4F');
    c.rect(236, 98, 40, 26, 6, '#C9A94A');
    c.rect(218, 270, 76, 80, 0, '#F4F1EA');
    c.rect(218, 296, 76, 8, 0, '#C9A94A');
    c.rect(228, 200, 10, 200, 5, '#FFFFFF', 0.3);
  },
  'P-SERVICIO-DOMICILIO': (c) => {
    scene(c, '#F4EFE6', '#E2D6C2');
    c.ellipse(256, 424, 140, 16, '#000000', 0.16);
    c.polygon([[150, 190], [362, 190], [380, 420], [132, 420]], '#C49A6C');
    c.polygon([[150, 190], [362, 190], [356, 160], [156, 160]], '#A87D52');
    c.ring(256, 186, 46, 40, 10, '#8A6240');
    c.ellipse(256, 310, 52, 52, '#6F4E37');
    c.ellipse(256, 310, 20, 30, '#C49A6C');
    c.line(256, 284, 256, 336, 4, '#6F4E37');
  },
};

/** El PNG de un producto, o null si no tiene dibujo. */
export function productImage(productCode: string): Buffer | null {
  const draw = DRAW[productCode];
  if (!draw) return null;
  const canvas = new Canvas();
  draw(canvas);
  return canvas.png();
}

export const DRAWN_PRODUCTS = Object.keys(DRAW);
