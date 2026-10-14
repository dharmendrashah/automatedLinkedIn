const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PERIOD_SECONDS = 30
const DIGITS = 6

const base32Decode = (input: string) => {
   const text = input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
   const bytes: number[] = []
   let bits = 0
   let buffer = 0

   for (const char of text) {
      const value = ALPHABET.indexOf(char)

      if (value === -1) {
         // Never echoes the secret.
         throw new Error('The two-step key is not valid base32')
      }

      buffer = (buffer << 5) | value
      bits += 5

      if (bits >= 8) {
         bytes.push((buffer >>> (bits - 8)) & 0xff)
         bits -= 8
      }
   }

   return new Uint8Array(bytes)
}

// RFC 6238 time-based one-time password, the same parameters as the spider's totpCode (SHA-1, six digits, thirty
// seconds): computed with Web Crypto so it runs in the browser without a decrypted secret ever leaving it.
export const totpCode = async (secret: string, atMs: number) => {
   const counter = new DataView(new ArrayBuffer(8))

   counter.setBigUint64(0, BigInt(Math.floor(atMs / 1000 / PERIOD_SECONDS)))

   const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, [
      'sign',
   ])
   const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer))
   const offset = digest[digest.length - 1] & 0x0f
   const binary =
      (((digest[offset] & 0x7f) << 24) |
         (digest[offset + 1] << 16) |
         (digest[offset + 2] << 8) |
         digest[offset + 3]) >>>
      0

   return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

// How many seconds the current code still has, for a countdown. 30 right at the start of a window, 1 just before it rolls.
export const secondsUntilNextCode = (atMs: number) => PERIOD_SECONDS - (Math.floor(atMs / 1000) % PERIOD_SECONDS)
