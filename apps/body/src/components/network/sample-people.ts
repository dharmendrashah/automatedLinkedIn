import { type NetworkRequest } from './types'

// Made-up people for the preview: none of them exists, and no name here is taken from a real request.
type Person = Pick<NetworkRequest, 'name' | 'headline' | 'mutual' | 'note'>

const PEOPLE: Person[] = [
   {
      name: 'Maya Fernandes',
      headline: 'Founder at Northwind Labs | Building scheduling tools for clinics',
      mutual: 'Jon Okafor is a mutual connection',
      note: 'Hi, I saw your post about outbound and would like to stay in touch. We are working on something close to what you do and I think we could help each other. Happy to share what we learned about timing.',
   },
   {
      name: 'Daniel Kim',
      headline: 'Senior Recruiter at Harbor Talent',
      mutual: 'Priya Natarajan and 2 other mutual connections',
   },
   {
      name: 'Sofia Almeida',
      headline: 'Head of Growth | B2B SaaS | Former agency owner',
   },
   {
      name: 'Tomas Berg',
      headline: 'Product designer',
      mutual: 'Lena Fischer is a mutual connection',
      note: 'Met you at the meetup last week.',
   },
   {
      name: 'Aisha Rahman',
      headline: 'Director of Sales, EMEA at Brightline Software | Helping teams book more qualified meetings',
      mutual: 'Marco Ruiz is a mutual connection',
   },
   {
      name: 'Oliver Grant',
      headline: 'Freelance copywriter',
   },
   {
      name: 'Chen Wei',
      headline: 'Software engineer at Lumen Cloud',
      mutual: 'Sara Whitfield and 4 other mutual connections',
   },
   {
      name: 'Hannah Schultz',
      headline: 'Marketing manager at Kestrel Foods | Events | Partnerships',
      note: 'Hello! I run partnerships at Kestrel and your profile came up when I was looking for people in your field.',
   },
]

// People number `index`, repeating the list with a number added to the name when more than its length are asked for.
export const samplePerson = (index: number): Person => {
   const person: Person = PEOPLE[index % PEOPLE.length] ?? {
      name: 'Sample Person',
      headline: '',
   }
   const round = Math.floor(index / PEOPLE.length)

   return round === 0 ? person : { ...person, name: `${person.name} ${round + 1}` }
}

export const SAMPLE_COUNT = PEOPLE.length
