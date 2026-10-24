import type { AccountProfile } from '@automatedLinkedIn/contracts'

const empty = {
   items: [],
   total: 0,
}

// A new account's profile: a name and a headline, and nothing else (no picture, cover, location or counts).
export const sparseProfile = (now: Date): AccountProfile => ({
   contract: 1,
   captured_at: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
   name: 'New Account',
   verified: false,
   headline: 'Just getting started',
   topSkills: [],
   services: [],
   experience: [],
   education: [],
   projects: empty,
   skills: empty,
   recommendations: {
      received: empty,
      given: empty,
   },
   languages: empty,
   interests: {
      topVoices: [],
      companies: [],
      groups: [],
      newsletters: [],
      schools: [],
   },
   peopleYouMayKnow: [],
   youMightLike: [],
})
