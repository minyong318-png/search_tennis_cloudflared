/**
 * Cloudflare Workers Web Push (aes128gcm) + VAPID (ES256)
 * - subscription: { endpoint: string, keys: { p256dh: base64url, auth: base64url } }
 * - env needs: VAPID_PRIVATE_KEY (base64url), VAPID_PUBLIC_KEY (base64url), VAPID_SUBJECT ("mailto:..")
 */

function b64urlToBytes(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return b64;
}

function concatBytes(...arrs) {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function u16be(n) {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

function textBytes(s) {
  return new TextEncoder().encode(s);
}

function endpointAudience(endpoint) {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}

async function hkdfExtract(saltBytes, ikmBytes) {
  const saltKey = await crypto.subtle.importKey("raw", saltBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = await crypto.subtle.sign("HMAC", saltKey, ikmBytes);
  return new Uint8Array(prk);
}

async function hkdfExpand(prkBytes, infoBytes, length) {
  const prkKey = await crypto.subtle.importKey("raw", prkBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = new Uint8Array(length);
  let prev = new Uint8Array(0);
  let pos = 0;
  let counter = 1;

  while (pos < length) {
    const data = concatBytes(prev, infoBytes, new Uint8Array([counter]));
    const t = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, data));
    const take = Math.min(t.length, length - pos);
    out.set(t.slice(0, take), pos);
    pos += take;
    prev = t;
    counter++;
  }
  return out;
}

/**
 * aes128gcm Web Push encryption per RFC 8291
 */
async function encryptAes128Gcm({ subscription, payloadBytes }) {
  const clientPub = b64urlToBytes(subscription.keys.p256dh); // 65 bytes uncompressed
  const authSecret = b64urlToBytes(subscription.keys.auth); // 16 bytes

  // Import client's public ECDH key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Generate server ephemeral ECDH keypair
  const serverKp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientKey },
    serverKp.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK = HKDF-Extract(authSecret, sharedSecret) using "Content-Encoding: auth\0" as info in expand step
  const prkAuth = await hkdfExtract(authSecret, sharedSecret);
  const prk = await hkdfExpand(prkAuth, textBytes("Content-Encoding: auth\0"), 32);

  // Build "context" = len(clientPub) || clientPub || len(serverPub) || serverPub
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKp.publicKey)); // 65 bytes
  const context = concatBytes(u16be(clientPub.length), clientPub, u16be(serverPubRaw.length), serverPubRaw);

  // CEK & Nonce derivation
  const cekInfo = concatBytes(textBytes("Content-Encoding: aes128gcm\0"), textBytes("P-256\0"), context);
  const nonceInfo = concatBytes(textBytes("Content-Encoding: nonce\0"), textBytes("P-256\0"), context);

  const prkSalt = await hkdfExtract(salt, prk);
  const cek = await hkdfExpand(prkSalt, cekInfo, 16);
  const nonce = await hkdfExpand(prkSalt, nonceInfo, 12);

  // Plaintext formatting: payload || 0x02 (padding delimiter), no extra padding
  const plaintext = concatBytes(payloadBytes, new Uint8Array([0x02]));

  // AES-GCM encrypt
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext)
  );

  return {
    ciphertext,
    salt,
    serverPubRaw, // for Crypto-Key: dh=
  };
}

/**
 * VAPID JWT (ES256) signing using JWK constructed from:
 * - env.VAPID_PRIVATE_KEY (d) base64url
 * - env.VAPID_PUBLIC_KEY (uncompressed 65 bytes => x,y)
 */
async function createVapidAuthorization({ endpoint, env }) {
  const aud = endpointAudience(endpoint);
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12h
  const sub = env.VAPID_SUBJECT?.startsWith("mailto:") ? env.VAPID_SUBJECT : `mailto:${env.VAPID_SUBJECT}`;

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub };

  const enc = (obj) => {
    const json = JSON.stringify(obj);
    return bytesToB64url(textBytes(json));
  };

  const signingInput = `${enc(header)}.${enc(payload)}`;

  // Build JWK
  // createVapidAuthorization 내부에서 pub 읽는 부분을 이렇게 바꿔
const pubBytes = b64urlToBytes((env.VAPID_PUBLIC_KEY || "").trim());
if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
  throw new Error("Invalid VAPID_PUBLIC_KEY format");
}

// ✅ 헤더에 쓸 공개키는 항상 '정규화된 base64url'로
const pubB64url = bytesToB64url(pubBytes);

// private(d)도 혹시 표준 base64/패딩/공백 섞였을 수 있으니 정규화
const dB64url = bytesToB64url(b64urlToBytes((env.VAPID_PRIVATE_KEY || "").trim()));

const x = pubBytes.slice(1, 33);
const y = pubBytes.slice(33, 65);

const jwk = {
  kty: "EC",
  crv: "P-256",
  x: bytesToB64url(x),
  y: bytesToB64url(y),
  d: dB64url,
};

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(
  await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textBytes(signingInput))
  );

  // Cloudflare Workers(WebCrypto)에서는 ECDSA 서명이
  // - DER(ASN.1)로 올 수도 있고
  // - JOSE(raw r||s, 64 bytes)로 올 수도 있음
  let sigJose;
  if (sig.length === 64) {
    // already JOSE (r||s)
    sigJose = sig;
  } else if (sig[0] === 0x30) {
    // DER → JOSE
    sigJose = derToJose(sig, 64);
  } else {
    // 알 수 없는 형식
    throw new Error(`Unexpected ECDSA signature format (len=${sig.length}, first=0x${sig[0]?.toString(16)})`);
  }


  const jwt = `${signingInput}.${bytesToB64url(sigJose)}`;

  // Authorization: vapid t=..., k=...
  // k is the VAPID public key (base64url, no padding)
  
  return `vapid t=${jwt}, k=${pubB64url}`;
}

// Convert DER ECDSA signature to JOSE (r||s)
function derToJose(derSig, joseLen) {
  // Minimal DER parser for ECDSA signatures
  // Structure: 0x30 len 0x02 rlen r 0x02 slen s
  let i = 0;
  if (derSig[i++] !== 0x30) throw new Error("Invalid DER signature");
  const seqLen = derSig[i++];
  if (seqLen + 2 !== derSig.length && seqLen + 3 !== derSig.length) {
    // tolerate some variants
  }
  if (derSig[i++] !== 0x02) throw new Error("Invalid DER signature (r)");
  const rLen = derSig[i++];
  let r = derSig.slice(i, i + rLen);
  i += rLen;

  if (derSig[i++] !== 0x02) throw new Error("Invalid DER signature (s)");
  const sLen = derSig[i++];
  let s = derSig.slice(i, i + sLen);

  // Strip leading zeros
  while (r.length > 1 && r[0] === 0x00) r = r.slice(1);
  while (s.length > 1 && s[0] === 0x00) s = s.slice(1);

  // Left pad to joseLen/2 each
  const half = joseLen / 2;
  const out = new Uint8Array(joseLen);
  out.set(r.length > half ? r.slice(-half) : r, half - Math.min(r.length, half));
  out.set(s.length > half ? s.slice(-half) : s, joseLen - Math.min(s.length, half));
  return out;
}

/**
 * Main: send Web Push
 */
export async function sendWebPush({ subscription, title, body, ttl = 60, env }) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Invalid subscription object");
  }
  if (!env?.VAPID_PRIVATE_KEY || !env?.VAPID_PUBLIC_KEY || !env?.VAPID_SUBJECT) {
    throw new Error("Missing VAPID env vars (VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT)");
  }

  const payloadObj = { title, body };
  const payloadBytes = textBytes(JSON.stringify(payloadObj));

  const { ciphertext, salt, serverPubRaw } = await encryptAes128Gcm({ subscription, payloadBytes });

  const authorization = await createVapidAuthorization({ endpoint: subscription.endpoint, env });

  const pubB64url = bytesToB64url(b64urlToBytes((env.VAPID_PUBLIC_KEY || "").trim()));
  const cryptoKey = `dh=${bytesToB64url(serverPubRaw)}; p256ecdsa=${pubB64url}`;
  console.log("[VAPID pub normalized head]", bytesToB64url(b64urlToBytes(env.VAPID_PUBLIC_KEY.trim())).slice(0, 20));
  const encryption = `salt=${bytesToB64url(salt)}`;
  async function makeAppleTopic(env, subscription) {
  // 안정적으로 고정될 문자열(원하는 걸로 바꿔도 됨)
  const seed = (env.APP_ORIGIN || new URL(subscription.endpoint).origin);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  // bytesToB64url은 네 코드에 이미 있음 (VAPID에서 쓰는 그 함수)
  return bytesToB64url(new Uint8Array(hash)).slice(0, 32); // 32자, base64url만
}

  const url = new URL(subscription.endpoint);

  const headers = {
    TTL: String(ttl),
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    "Crypto-Key": cryptoKey,
    "Encryption": encryption,
    "Authorization": authorization,
  };

  // ✅ Apple Web Push(APNs) 전용
  if (url.hostname === "web.push.apple.com") {
    if (!env.WEB_PUSH_ID) {
      throw new Error("Missing env var WEB_PUSH_ID for Apple Web Push Topic");
    }
    const seed = env.APP_ORIGIN || "search-tennis-court";
    const hash = await crypto.subtle.digest("SHA-256", textBytes(seed));
    headers["Topic"] = bytesToHex(new Uint8Array(hash)).slice(0, 32); // ✅ 32 chars, [0-9a-f]
  }

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body: ciphertext,
  });


  return res;
}
