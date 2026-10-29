// مولّد أيقونات PNG صغير بلا اعتماديات: مربع مدوّر بنفسجي وصاعقة بيضاء.
// يستخدم صورة مفهرسة (palette) بـ 8 مستويات تمويه، فيبقى الحساب خفيفًا جدًا (مناسب للخطة المجانية).

const BG = [124, 58, 237];
const FG = [255, 255, 255];
const LEVELS = 8;
const SUBSAMPLES = 4;
// رؤوس الصاعقة في شبكة 24×24 (نفس شعار الواجهة).
const BOLT = [[13, 2], [3, 14], [12, 14], [11, 22], [21, 10], [12, 10]];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));

  return out;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// maskable: بلا زوايا شفافة وبصاعقة أصغر لتبقى داخل المنطقة الآمنة.
export async function renderIcon(size, { maskable = false } = {}) {
  const scale = (size * (maskable ? 0.44 : 0.56)) / 20;
  const offset = size / 2 - 12 * scale;
  const points = BOLT.map(([x, y]) => [offset + x * scale, offset + y * scale]);
  const radius = maskable ? 0 : size * 0.22;

  const raw = new Uint8Array((size + 1) * size);
  const coverage = new Float32Array(size);

  for (let y = 0; y < size; y++) {
    coverage.fill(0);

    for (let s = 0; s < SUBSAMPLES; s++) {
      const sy = y + (s + 0.5) / SUBSAMPLES;
      const crossings = [];

      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) {
          crossings.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
        }
      }

      crossings.sort((a, b) => a - b);

      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(0, crossings[i]);
        const to = Math.min(size, crossings[i + 1]);
        if (to <= from) continue;

        const last = Math.min(size - 1, Math.ceil(to) - 1);
        for (let x = Math.floor(from); x <= last; x++) {
          coverage[x] += (Math.min(to, x + 1) - Math.max(from, x)) / SUBSAMPLES;
        }
      }
    }

    let inset = 0;
    if (radius > 0) {
      const center = y + 0.5;
      const dy = center < radius ? radius - center : center > size - radius ? center - (size - radius) : 0;
      inset = dy > 0 ? radius - Math.sqrt(Math.max(0, radius * radius - dy * dy)) : 0;
    }

    const row = y * (size + 1);
    raw[row] = 0;

    for (let x = 0; x < size; x++) {
      const center = x + 0.5;
      raw[row + 1 + x] = center < inset || center > size - inset
        ? 0
        : 1 + Math.round(Math.min(1, coverage[x]) * (LEVELS - 1));
    }
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, size);
  headerView.setUint32(4, size);
  header[8] = 8;  // عمق البت
  header[9] = 3;  // ألوان مفهرسة

  const palette = new Uint8Array((LEVELS + 1) * 3);
  const alpha = new Uint8Array(LEVELS + 1).fill(255);
  alpha[0] = 0;
  for (let i = 0; i < LEVELS; i++) {
    const mix = i / (LEVELS - 1);
    for (let c = 0; c < 3; c++) palette[(i + 1) * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * mix);
  }

  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("tRNS", alpha),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array(0))
  ]);
}
