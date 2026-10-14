// tools/world-art/png.mjs — PNG read/write and RGBA image helpers for the world-art
// pipeline. node:zlib only, zero dependencies.
//
// decodePNG accepts what PixelLab and every paint tool emit: 8-bit grey, grey+alpha,
// RGB, RGBA and indexed colour (1/2/4/8-bit, with tRNS), plus 16-bit channels
// (truncated to 8). Interlaced files are refused by name rather than misread.
// encodePNG writes 8-bit RGBA with a per-row filter choice. Compressed bytes depend
// on the zlib build, so drift checks compare PIXELS (pixelHash), never file bytes.
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** A blank (fully transparent) RGBA image. */
export function createImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function decodePNG(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let off = 8, ihdr = null, plte = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = { w: body.readUInt32BE(0), h: body.readUInt32BE(4), depth: body[8], ct: body[9], interlace: body[12] };
    else if (type === 'PLTE') plte = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('PNG without IHDR');
  if (ihdr.interlace) throw new Error('interlaced PNG is not supported — re-save without interlacing');
  const { w, h, depth, ct } = ihdr;
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!chans) throw new Error('unsupported PNG colour type ' + ct);
  const bpp = Math.max(1, (chans * depth) >> 3);
  const stride = (w * chans * depth + 7) >> 3;
  const raw = inflateSync(Buffer.concat(idat));
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  const img = createImage(w, h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    for (let i = 0; i < stride; i++) {
      const x = raw[p++], a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else throw new Error('bad PNG filter ' + f);
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const sample = (k) => {
        if (depth === 8) return cur[x * chans + k];
        if (depth === 16) return cur[(x * chans + k) * 2];
        const bit = x * depth, byte = cur[bit >> 3], shift = 8 - depth - (bit & 7);
        return (byte >> shift) & ((1 << depth) - 1);
      };
      if (ct === 3) {
        const i = sample(0);
        img.data[o] = plte[i * 3]; img.data[o + 1] = plte[i * 3 + 1]; img.data[o + 2] = plte[i * 3 + 2];
        img.data[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (ct === 0 || ct === 4) {
        const g = depth < 8 ? Math.round(sample(0) * 255 / ((1 << depth) - 1)) : sample(0);
        img.data[o] = img.data[o + 1] = img.data[o + 2] = g;
        img.data[o + 3] = ct === 4 ? sample(1) : 255;
      } else {
        img.data[o] = sample(0); img.data[o + 1] = sample(1); img.data[o + 2] = sample(2);
        img.data[o + 3] = ct === 6 ? sample(3) : 255;
      }
    }
    prev.set(cur);
  }
  return img;
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

export function encodePNG(img) {
  const { width: w, height: h, data } = img;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    const up = y ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0, b = up ? up[i] : 0, c = up && i >= 4 ? up[i - 4] : 0;
        let pr;
        if (f === 0) pr = 0;
        else if (f === 1) pr = a;
        else if (f === 2) pr = b;
        else if (f === 3) pr = (a + b) >> 1;
        else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (row[i] - pr) & 255;
        o[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** sha256 over width, height and the RGBA bytes — the drift identity of an image. */
export function pixelHash(img) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(img.width, 0); head.writeUInt32BE(img.height, 4);
  return createHash('sha256').update(head).update(img.data).digest('hex');
}

export function cloneImage(img) {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

/** Copy a w×h rect of src at (sx,sy) onto dst at (dx,dy). Replace, or alpha-over when `over`. */
export function blit(dst, src, sx, sy, w, h, dx, dy, over = false) {
  for (let y = 0; y < h; y++) {
    const ty = dy + y, fy = sy + y;
    if (ty < 0 || ty >= dst.height || fy < 0 || fy >= src.height) continue;
    for (let x = 0; x < w; x++) {
      const tx = dx + x, fx = sx + x;
      if (tx < 0 || tx >= dst.width || fx < 0 || fx >= src.width) continue;
      const s = (fy * src.width + fx) * 4, d = (ty * dst.width + tx) * 4;
      const a = src.data[s + 3];
      if (!over) { dst.data.set(src.data.subarray(s, s + 4), d); continue; }
      if (!a) continue;
      if (a === 255) { dst.data.set(src.data.subarray(s, s + 4), d); continue; }
      const da = dst.data[d + 3] / 255, sa = a / 255, oa = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++) dst.data[d + k] = Math.round((src.data[s + k] * sa + dst.data[d + k] * da * (1 - sa)) / oa);
      dst.data[d + 3] = Math.round(oa * 255);
    }
  }
}

export function crop(img, x, y, w, h) {
  const out = createImage(w, h);
  blit(out, img, x, y, w, h, 0, 0);
  return out;
}

export function flipX(img) {
  const out = createImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const s = (y * img.width + x) * 4, d = (y * img.width + (img.width - 1 - x)) * 4;
    out.data.set(img.data.subarray(s, s + 4), d);
  }
  return out;
}

export function scaleNearest(img, k) {
  const out = createImage(Math.round(img.width * k), Math.round(img.height * k));
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const s = (Math.min(img.height - 1, Math.floor(y / k)) * img.width + Math.min(img.width - 1, Math.floor(x / k))) * 4;
    out.data.set(img.data.subarray(s, s + 4), (y * out.width + x) * 4);
  }
  return out;
}

export function alphaAt(img, x, y) {
  return x < 0 || y < 0 || x >= img.width || y >= img.height ? 0 : img.data[(y * img.width + x) * 4 + 3];
}
