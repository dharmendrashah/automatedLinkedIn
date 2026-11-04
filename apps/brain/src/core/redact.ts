// Takes emails and phone numbers out of words before they are shown or sent on (Get our chat with them, "Remove emails and phone
// numbers"). It cannot promise to catch every form of either, so it is a safeguard, not a guarantee.
const EMAIL = /[^\s@<>()[\],;:"']+@[^\s@<>()[\],;:"']+\.[A-Za-z]{2,}/g
const PHONE = /(?<![\w.])[+(]?\d[\d\s().-]{6,}\d(?![\w])/g

export const redactContacts = (text: string) => text.replace(EMAIL, '[email removed]').replace(PHONE, '[phone removed]')

// One message for a digest: contact details removed when asked, and cut to `max` characters.
export const digestText = (text: string, redact: boolean, max = 200) => {
   const clean = (redact ? redactContacts(text) : text).replace(/\s+/g, ' ').trim()

   return clean.length > max ? `${clean.slice(0, max - 1)}\u2026` : clean
}
