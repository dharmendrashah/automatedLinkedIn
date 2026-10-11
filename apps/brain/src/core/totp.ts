const MIN_LENGTH = 16
const SCHEME = /^otpauth:\/\//i

const secretOfUri = (uri: string) => {
   let url: URL

   try {
      url = new URL(uri)
   } catch {
      throw new Error('The otpauth link is not valid')
   }

   if (url.hostname.toLowerCase() !== 'totp') {
      throw new Error('Only time-based (otpauth://totp) links are supported')
   }

   const secret = url.searchParams.get('secret')

   if (!secret) {
      throw new Error('The otpauth link has no secret parameter')
   }

   return secret
}

// Accepts an otpauth://totp URI or a bare base32 secret and returns the canonical base32 secret.
// Error messages state the rule and never echo the input, because it is a secret.
export const parseTotpSecret = (input: string) => {
   const raw = input.trim()
   const secret = SCHEME.test(raw) ? secretOfUri(raw) : raw
   const normalized = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()

   if (!/^[A-Z2-7]*$/.test(normalized)) {
      throw new Error('TOTP secret must be base32 (letters A-Z and digits 2-7)')
   }

   if (normalized.length < MIN_LENGTH) {
      throw new Error(`TOTP secret must be at least ${MIN_LENGTH} characters`)
   }

   return normalized
}
