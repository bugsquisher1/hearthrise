// tools/balance-lab/shims/node-crypto.mjs — `node:crypto`'s createHmac('sha256'), synchronous, for the browser bundle.
//
// The edge's hunt seeder (supabase/functions/hr-accrue/hunt-seed.js) mixes every swing's seed with
// HMAC-SHA256(secret, label) through node:crypto, synchronously, inside the settle. The browser's WebCrypto is
// async, so the Balance Lab bundle (tools/balance-lab/build.mjs) maps `node:crypto` here: FIPS 180-4 SHA-256 and
// RFC 2104 HMAC in plain integers. Only the surface hunt-seed.js calls exists: createHmac('sha256', key)
// .update(text, 'utf8').digest() -> a byte array. tools/balance-lab/parity.mjs proves the seeds equal node's.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);

/** SHA-256 of a byte array: a 32-byte Uint8Array. */
export function sha256(bytes) {
  const n = bytes.length, bits = n * 8;
  const total = ((n + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[n] = 0x80;
  /* the length in bits, big-endian, in the last 8 bytes (a label is far under 2^32 bits) */
  m[total - 4] = (bits >>> 24) & 255; m[total - 3] = (bits >>> 16) & 255; m[total - 2] = (bits >>> 8) & 255; m[total - 1] = bits & 255;
  m[total - 5] = Math.floor(bits / 4294967296) & 255;
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      W[i] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = (v >>> 16) & 255; out[i * 4 + 2] = (v >>> 8) & 255; out[i * 4 + 3] = v & 255; });
  return out;
}

const utf8 = (s) => new TextEncoder().encode(String(s));

/** node:crypto's createHmac, SHA-256 only: update(text | bytes) ... digest() -> Uint8Array (indexable like a Buffer). */
export function createHmac(alg, key) {
  if (String(alg).toLowerCase() !== 'sha256') throw new Error('balance-lab crypto shim: only sha256 (asked ' + alg + ')');
  let k = typeof key === 'string' ? utf8(key) : new Uint8Array(key);
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { const b = k[i] || 0; ipad[i] = b ^ 0x36; opad[i] = b ^ 0x5c; }
  const parts = [];
  const h = {
    update(data, enc) {
      if (typeof data === 'string' && enc && enc !== 'utf8' && enc !== 'utf-8') throw new Error('balance-lab crypto shim: utf8 text only');
      parts.push(typeof data === 'string' ? utf8(data) : new Uint8Array(data));
      return h;
    },
    digest(enc) {
      if (enc) throw new Error('balance-lab crypto shim: digest() answers bytes only');
      const len = parts.reduce((s, p) => s + p.length, 0);
      const inner = new Uint8Array(64 + len);
      inner.set(ipad);
      let o = 64;
      for (const p of parts) { inner.set(p, o); o += p.length; }
      const ih = sha256(inner);
      const outer = new Uint8Array(96);
      outer.set(opad); outer.set(ih, 64);
      return sha256(outer);
    },
  };
  return h;
}

export default { createHmac };
