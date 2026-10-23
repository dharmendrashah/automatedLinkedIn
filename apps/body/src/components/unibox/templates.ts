export type Template = {
   id: string
   name: string
   body: string
}

export const TEMPLATES: Template[] = [
   {
      id: 'thanks',
      name: 'Thanks for replying',
      body: 'Hi {first name}, thanks for getting back to me. Happy to share more: what would be most useful?',
   },
   {
      id: 'times',
      name: 'Suggest a call',
      body: 'Hi {first name}, would a 15 minute call this week work? Send me a time that suits you and I will make it fit. {account}',
   },
   {
      id: 'later',
      name: 'Follow up later',
      body: 'Hi {first name}, no rush at all. I will check back in a few weeks. {account}',
   },
   {
      id: 'wrong',
      name: 'Wrong person',
      body: 'Hi {first name}, thanks for letting me know. Could you point me to the right person?',
   },
]

const NOT_NAMES = new Set(['unknown', 'linkedin'])

export const firstName = (full: string) => {
   const [first = ''] = full.trim().split(/\s+/)

   return first && !NOT_NAMES.has(first.toLowerCase()) ? first : undefined
}

// Puts the values into {variables}. A variable with no value stays as written and is listed (once), so the owner sees it before
// sending "Hi {first name}".
export const fillTemplate = (body: string, values: Record<string, string | undefined>) => {
   const missing: string[] = []
   const text = body.replace(/\{\s*([^{}]+?)\s*\}/g, (whole, name: string) => {
      const key = name.toLowerCase()
      const value = Object.hasOwn(values, key) ? values[key] : undefined

      if (value) {
         return value
      }

      if (!missing.includes(key)) {
         missing.push(key)
      }

      return whole
   })

   return {
      text,
      missing,
   }
}
