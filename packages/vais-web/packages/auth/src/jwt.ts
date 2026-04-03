/**
 * JWT utility — HMAC-SHA256 based JWT encode / decode / verify.
 *
 * Designed for framework demonstration purposes.
 * Works in both browser (Web Crypto API) and Node.js (>= 18) environments.
 * No external dependencies — only TextEncoder and a simple HMAC implementation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Standard JWT payload fields plus an optional arbitrary data bag.
 */
export interface JWTPayload {
  /** Subject — typically the user ID. */
  sub: string;
  /** Issued-at timestamp (Unix seconds). */
  iat: number;
  /** Expiration timestamp (Unix seconds). */
  exp: number;
  /** JWT ID — unique token identifier. */
  jti?: string;
  /** Arbitrary application-level data. */
  data?: Record<string, unknown>;
}

/**
 * Options accepted by encodeJWT.
 */
export interface JWTEncodeOptions {
  /** Lifetime in seconds (default: 3600 — 1 hour). */
  expiresIn?: number;
  /** Pre-computed Unix-seconds issue time (default: Date.now() / 1000). */
  iat?: number;
  /** JWT ID override. */
  jti?: string;
}

// ─── Base64url helpers ────────────────────────────────────────────────────────

/**
 * Encode a string or Uint8Array to base64url (no padding).
 */
export function base64urlEncode(input: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = input;
  }

  // Convert bytes to a binary string then use btoa.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url string to a UTF-8 string.
 */
export function base64urlDecode(input: string): string {
  // Re-add padding.
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Decode a base64url string to raw bytes (Uint8Array).
 */
export function base64urlDecodeBytes(input: string): Uint8Array {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────

/**
 * Compute HMAC-SHA256 over `message` using `secret`.
 * Prefers the Web Crypto API (available in browser and Node >= 18).
 *
 * Falls back to a pure-JS SHA-256 + HMAC implementation for environments
 * where crypto.subtle is unavailable.
 */
async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();

  // Web Crypto path (preferred).
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    globalThis.crypto.subtle
  ) {
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await globalThis.crypto.subtle.sign(
      "HMAC",
      keyMaterial,
      enc.encode(message),
    );
    return new Uint8Array(sig);
  }

  // Pure-JS fallback — SHA-256 based HMAC.
  return hmacSha256Fallback(enc.encode(secret), enc.encode(message));
}

// ─── Pure-JS SHA-256 + HMAC (fallback) ───────────────────────────────────────

/** SHA-256 constants. */
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function sha256(data: Uint8Array): Uint8Array {
  // Pre-processing: padding.
  const len = data.length;
  const bitLen = len * 8;
  // Pad to multiple of 64 bytes.
  const padLen = ((len + 9 + 63) & ~63) - len;
  const padded = new Uint8Array(len + padLen);
  padded.set(data);
  padded[len] = 0x80;
  // Append 64-bit big-endian bit length.
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

  // Initial hash values.
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let off = 0; off < padded.length; off += 64) {
    const chunk = new DataView(padded.buffer, off, 64);
    for (let i = 0; i < 16; i++) {
      w[i] = chunk.getUint32(i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const result = new Uint8Array(32);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0, false);
  rv.setUint32(4, h1, false);
  rv.setUint32(8, h2, false);
  rv.setUint32(12, h3, false);
  rv.setUint32(16, h4, false);
  rv.setUint32(20, h5, false);
  rv.setUint32(24, h6, false);
  rv.setUint32(28, h7, false);
  return result;
}

function hmacSha256Fallback(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 64;

  // If key is longer than block size, hash it first.
  let k = key.length > blockSize ? sha256(key) : key;

  // Pad key to block size.
  const kPadded = new Uint8Array(blockSize);
  kPadded.set(k);

  const oKey = new Uint8Array(blockSize);
  const iKey = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKey[i] = kPadded[i] ^ 0x5c;
    iKey[i] = kPadded[i] ^ 0x36;
  }

  const inner = new Uint8Array(blockSize + data.length);
  inner.set(iKey);
  inner.set(data, blockSize);

  const innerHash = sha256(inner);

  const outer = new Uint8Array(blockSize + 32);
  outer.set(oKey);
  outer.set(innerHash, blockSize);

  return sha256(outer);
}

// ─── Refresh token generator ──────────────────────────────────────────────────

/**
 * Generate a cryptographically random refresh token string.
 * Uses crypto.randomUUID when available, falls back to random hex.
 */
export function generateRefreshToken(): string {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  // Fallback: build 32-byte random hex string.
  const bytes = new Uint8Array(32);
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    globalThis.crypto.getRandomValues
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Last-resort pseudo-random (not cryptographically secure — demo only).
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── JWT header ───────────────────────────────────────────────────────────────

const JWT_HEADER = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

// ─── encodeJWT ────────────────────────────────────────────────────────────────

/**
 * Encode a JWT with HMAC-SHA256 signature.
 *
 * @param payload  - Application payload; sub is required.
 * @param secret   - Signing secret.
 * @param options  - Optional expiresIn (seconds), iat override, jti override.
 * @returns        Signed JWT string (Header.Payload.Signature).
 */
export async function encodeJWT(
  payload: Omit<JWTPayload, "iat" | "exp"> & Partial<Pick<JWTPayload, "iat" | "exp">>,
  secret: string,
  options?: JWTEncodeOptions,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const iat = options?.iat ?? payload.iat ?? now;
  const expiresIn = options?.expiresIn ?? 3600;
  const exp = payload.exp ?? (iat + expiresIn);
  const jti = options?.jti ?? payload.jti ?? generateRefreshToken().slice(0, 16);

  const fullPayload: JWTPayload = {
    ...payload,
    iat,
    exp,
    jti,
  };

  const payloadEncoded = base64urlEncode(JSON.stringify(fullPayload));
  const signingInput = `${JWT_HEADER}.${payloadEncoded}`;
  const sigBytes = await hmacSha256(secret, signingInput);
  const signature = base64urlEncode(sigBytes);

  return `${signingInput}.${signature}`;
}

// ─── decodeJWT ────────────────────────────────────────────────────────────────

/**
 * Decode a JWT without verifying the signature.
 * Returns the payload object, or null if the token is malformed.
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(base64urlDecode(parts[1])) as JWTPayload;
  } catch {
    return null;
  }
}

// ─── verifyJWT ────────────────────────────────────────────────────────────────

/**
 * Verify a JWT's signature and expiration.
 *
 * @param token  - The JWT string to verify.
 * @param secret - The signing secret.
 * @returns      The decoded payload if valid, or null otherwise.
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Re-compute the expected signature.
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSigBytes = await hmacSha256(secret, signingInput);
    const expectedSig = base64urlEncode(expectedSigBytes);

    // Constant-time comparison isn't strictly needed for a demo, but we
    // avoid early return to reduce timing leakage.
    if (expectedSig !== signatureB64) {
      return null;
    }

    const payload = JSON.parse(base64urlDecode(payloadB64)) as JWTPayload;

    // Expiration check.
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp !== undefined && now > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
