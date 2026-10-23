import { type Attachment, type Person, type UniboxAccount, type UniboxConversation, type UniboxMessage } from '../types'

// A small deterministic random source, so the sample is the same on every load and in every test.
const random = (seed: number) => {
   let state = seed >>> 0

   return () => {
      state = (state + 0x6d2b79f5) >>> 0

      let t = state

      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
   }
}

const FIRST = [
   'Noor',
   'Jonas',
   'Aiko',
   'Carlos',
   'Freya',
   'Ibrahim',
   'Zoe',
   'Mateo',
   'Elin',
   'Tariq',
   'Chloe',
   'Anders',
   'Sofia',
   'Kofi',
   'Mara',
   'Viktor',
   'Leila',
   'Owen',
   'Ines',
   'Rafael',
]
const LAST = [
   'Haddad',
   'Weber',
   'Tanaka',
   'Silva',
   'Larsen',
   'Demir',
   'Moreau',
   'Ortiz',
   'Berg',
   'Khan',
   'Dubois',
   'Nilsson',
   'Rossi',
   'Mensah',
   'Novak',
   'Petrov',
   'Amiri',
   'Doyle',
   'Costa',
   'Vega',
]

const OPENERS = [
   'Thanks for reaching out. Can you tell me a bit more about what you do?',
   'Interesting. We are looking at this next quarter. What does pricing look like?',
   'Not right now, but please check back in a couple of months.',
   'Who else in my industry have you worked with?',
   'Could we move this to email? Mine is on my profile.',
   'This is the first I have heard of it. Can you send a short overview?',
   'We already have a vendor for this, but I am open to a comparison.',
   'Yes, I am the right person. What did you have in mind?',
   'Thanks! Sending this to my team and will get back to you.',
   'Sounds useful. Do you have a case study I can read?',
]
const FOLLOW_UPS = [
   'Happy to share more. Would a 15 minute call this week work?',
   'Thanks for the quick answer. I will send a short summary today.',
   'Here is the overview we use with teams like yours.',
   'Understood. I will follow up in a few weeks.',
   'Great, I will send a calendar invite now.',
]
const WITH_LINKS = [
   'Here is our overview: https://example.com/overview?ref=linkedin and the pricing page www.example.com/pricing.',
   'Booking link: https://bit.ly/3sample, pick any time that works.',
   'Case study: https://example.org/case-studies/retail (no sign-up needed).',
]
const HOUR = 3_600_000
const DAY = 24 * HOUR

const pick = <T>(list: T[], next: () => number) => list[Math.floor(next() * list.length)]!

const personAt = (index: number): Person => ({
   name: `${FIRST[index % FIRST.length]} ${LAST[Math.floor(index / FIRST.length) % LAST.length]}`,
   profileUrl: `https://www.linkedin.com/in/sample-contact-${index}/`,
})

// Conversations that are entirely invented, for a page that must hold what real life holds (waiting for days, groups, links, a
// message that is only a picture, a conversation of 500 messages, one person reached from several accounts) and contains nobody
// real. Deterministic for a seed.
export const inventedConversations = (
   accounts: UniboxAccount[],
   now: number,
   count: number,
   seed = 7
): UniboxConversation[] => {
   if (accounts.length === 0) {
      return []
   }

   const next = random(seed)
   const used = new Map<number, Set<string>>()
   const conversations: UniboxConversation[] = []
   let contacts = 0

   for (let index = 0; index < count; index += 1) {
      // About one in five reuses a person already reached from another account.
      const reuse = contacts > 0 && next() < 0.2
      let person = reuse ? Math.floor(next() * contacts) : contacts
      let account = accounts[Math.floor(next() * accounts.length)]!

      for (let tries = 0; used.get(person)?.has(account.id) && tries < accounts.length; tries += 1) {
         account = accounts[(accounts.indexOf(account) + 1) % accounts.length]!
      }

      if (used.get(person)?.has(account.id)) {
         person = contacts
      }

      if (person === contacts) {
         contacts += 1
      }

      used.set(person, new Set([...(used.get(person) ?? []), account.id]))

      const group = next() < 0.05
      const contact = personAt(person)
      const participants = group ? [contact, personAt(person + 7), personAt(person + 11)] : [contact]
      const length = index === 3 ? 500 : 1 + Math.floor(next() ** 2 * 12)
      const lastIsTheirs = next() < 0.55
      const lastAt = now - (5 * 60_000 + next() ** 2 * 40 * DAY)
      const messages: UniboxMessage[] = []
      let at = lastAt

      for (let place = length - 1; place >= 0; place -= 1) {
         const theirs = (length - 1 - place) % 2 === 0 ? lastIsTheirs : !lastIsTheirs
         const roll = next()
         const attachments: Attachment[] =
            roll < 0.04
               ? [{ kind: 'IMAGE', name: 'photo.png' }]
               : roll < 0.06
                 ? [{ kind: 'AUDIO' }]
                 : roll < 0.08
                   ? [{ kind: 'FILE', name: 'overview.pdf' }]
                   : []
         const text = attachments.length
            ? ''
            : roll < 0.2
              ? pick(WITH_LINKS, next)
              : theirs
                ? pick(OPENERS, next)
                : pick(FOLLOW_UPS, next)

         messages.unshift({
            id: `m-${index}-${place}`,
            direction: theirs ? 'THEM' : 'ME',
            sender: theirs ? contact.name : account.name,
            at,
            when: '',
            text,
            attachments,
         })
         at -= 5 * 60_000 + next() * 3 * DAY
      }

      const last = messages.at(-1)!
      const done = last.direction === 'THEM' && next() < 0.06 && last.at + HOUR < now

      conversations.push({
         id: `sample-${index}`,
         accountId: account.id,
         contact,
         participants,
         kind: group ? 'GROUP' : 'DIRECT',
         unread: last.direction === 'THEM' && next() < 0.35,
         complete: next() > 0.06,
         messages,
         ...(done && { doneAt: last.at + HOUR }),
      })
   }

   return conversations
}
