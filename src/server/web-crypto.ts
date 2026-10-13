export function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sha256Hex(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function encodeBase64Url(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function decodeBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeJsonBase64Url(value: unknown) {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function decodeJsonBase64Url<T>(value: string) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

export async function signHs256(payload: unknown, secret: string) {
  const header = encodeJsonBase64Url({ alg: 'HS256', typ: 'JWT' });
  const body = encodeJsonBase64Url(payload);
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyHs256<T>(token: string, secret: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  try {
    const decodedHeader = decodeJsonBase64Url<{ alg?: string; typ?: string }>(header);
    if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT') return null;
    const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await globalThis.crypto.subtle.verify('HMAC', key, decodeBase64Url(signature), new TextEncoder().encode(`${header}.${body}`));
    if (!valid) return null;
    return decodeJsonBase64Url<T>(body);
  } catch {
    return null;
  }
}
