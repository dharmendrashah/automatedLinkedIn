export type SecretKey = 'password' | 'totpSecret' | 'session'
export type Flags = Record<SecretKey, boolean>
export type Values = Record<SecretKey, string>

export const noFlags: Flags = {
   password: false,
   totpSecret: false,
   session: false,
}

// A password is used exactly as typed; the key and the cookie are trimmed.
const typed = (key: SecretKey, value: string) => (key === 'password' ? value : value.trim())

const keys: SecretKey[] = ['password', 'totpSecret', 'session']

// Which secrets the account will have after saving: typed or still saved, and not removed.
export const effectiveFlags = (values: Values, saved: Flags = noFlags, cleared: Flags = noFlags): Flags => ({
   password: !cleared.password && (Boolean(typed('password', values.password)) || saved.password),
   totpSecret: !cleared.totpSecret && (Boolean(typed('totpSecret', values.totpSecret)) || saved.totpSecret),
   session: !cleared.session && (Boolean(typed('session', values.session)) || saved.session),
})

// What is missing, in plain words, or undefined when the account can be saved.
export const missingFrom = (email: string, flags: Flags) => {
   if (!email.trim()) return 'Enter your LinkedIn email.'
   if (!flags.password && !flags.session) return 'Add a password or a browser sign-in token to continue.'
   if (flags.totpSecret && !flags.password) return 'A two-step key needs the password too.'

   return undefined
}

export type Patch = {
   password: string | null | undefined
   totpSecret: string | null | undefined
   session: string | null | undefined
}

// undefined keeps the saved secret, a string replaces it, null removes it. Blank never removes.
export const buildPatch = (values: Values, cleared: Flags): Patch => {
   const patch: Patch = {
      password: undefined,
      totpSecret: undefined,
      session: undefined,
   }

   for (const key of keys) {
      const value = typed(key, values[key])

      patch[key] = cleared[key] ? null : value || undefined
   }

   return patch
}

export const hasChanges = (email: string, original: string, patch: Patch) =>
   email.trim() !== original || keys.some(key => patch[key] !== undefined)
