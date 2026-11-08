// 加密工具：PBKDF2 口令哈希 / HMAC 签名 Cookie / 恒定时间比较 / 短 ID
// 迭代次数取 10_000：Workers 免费版单请求 CPU 限制 10ms，
// crypto.subtle 为原生实现，10k 次 PBKDF2 约占 2-5ms，是免费额度内的安全取值。

const enc = new TextEncoder()
const PBKDF2_ITERATIONS = 10_000

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexDecode(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** 口令哈希，返回 "salt.hash" 格式；传入 saltHex 用于校验时复现 */
export async function pbkdf2Hash(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? hexDecode(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return `${hex(salt)}.${hex(new Uint8Array(bits))}`
}

export async function pbkdf2Verify(password: string, stored: string): Promise<boolean> {
  const salt = stored.split('.')[0]
  const calc = await pbkdf2Hash(password, salt)
  return timingEqual(calc, stored)
}

async function hmac(secretHex: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexDecode(secretHex) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return hex(new Uint8Array(sig))
}

export async function hmacVerify(secretHex: string, msg: string, sigHex: string): Promise<boolean> {
  if (!secretHex) return false
  const calc = await hmac(secretHex, msg)
  return timingEqual(calc, sigHex)
}

export function hmacSign(secretHex: string, msg: string): Promise<string> {
  return hmac(secretHex, msg)
}

/** 恒定时间字符串比较，防时序侧信道 */
export function timingEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 短链接 ID，去掉易混淆字符 */
export function randomId(len = 8): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

export const now = (): number => Math.floor(Date.now() / 1000)
