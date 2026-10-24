import { type AccountProfile, PROFILE_CONTRACT_VERSION, accountProfileSchema } from '@automatedLinkedIn/contracts'

import { StepFailed, describeError } from '../../browsing/errors'
import { createKeep } from '../../browsing/snapshot'
import { runTargets } from '../../browsing/targets'
import {
   parseAbout,
   parseAnalytics,
   parseComments,
   parseEducation,
   parseExperience,
   parseFollowers,
   parseInterests,
   parseLanguages,
   parseOpenToWork,
   parsePosts,
   parseProjects,
   parseRecommendations,
   parseServices,
   parseSkills,
   parseSuggestions,
   parseTopCard,
} from '../../linkedin/profileReader'
import { SignedOut } from '../../linkedin/session'
import { DETAIL_PAGES } from './capture'
import { type PageContext, type PageDeps, createPages } from './pages'

export type ProfileInput = {
   // Keep the pages with the run, to study how they are built (a run keeps at most 20 files, so only the profile keeps its links).
   snapshots: boolean
}

// DONE: the profile and every page behind it were read. PARTIAL: some page did not open, the time ran out, or a section did not match
// the contract and was left out. NOT_OPENED: the account's own address did not lead to a profile. SIGNED_OUT: LinkedIn asked for a sign-in.
// INVALID: what was read does not fit the contract even with its sections left out, so nothing is handed over.
export type ProfileRead = {
   outcome: 'DONE' | 'PARTIAL' | 'NOT_OPENED' | 'SIGNED_OUT' | 'INVALID'
   // What was read, by a fixed label, for the report; counts only.
   counts: Array<{ label: string; count: number }>
   // Sections that were left out of the file because they did not match the contract.
   dropped: number
}

// The pages behind the profile's "Show all" links are the ones the capture opens (`DETAIL_PAGES`); each is opened by its address, as a
// person could type it.

// No new page is begun after this much of the run; the time limit of the task is longer, so the one in progress can end.
export const BUDGET_MS = 8 * 60 * 1000
// After this many pages in a row that did not open the run stops: something is wrong.
const MAX_FAILURES_IN_A_ROW = 3
// How many posts and comments are kept (the contract allows 50).
const ACTIVITY_LIMIT = 10

// A list as the contract wants it: the items cut to what it allows, and how many the page listed.
const listOf = <T>(items: T[], max: number) => ({
   items: items.slice(0, max),
   total: items.length,
})

const noList = listOf([], 0)
const noInterests: AccountProfile['interests'] = {
   topVoices: [],
   companies: [],
   groups: [],
   newsletters: [],
   schools: [],
}

// What a section is when it is left out, for the ones that are not optional.
const EMPTY: Record<string, unknown> = {
   openToWork: undefined,
   about: undefined,
   services: [],
   analytics: undefined,
   activity: undefined,
   experience: [],
   education: [],
   projects: noList,
   skills: noList,
   recommendations: {
      received: noList,
      given: noList,
   },
   languages: noList,
   interests: noInterests,
   peopleYouMayKnow: [],
   youMightLike: [],
}

// Checks the profile against its contract. A section that does not fit is replaced by an empty one, so one odd page never costs the
// rest; a profile that still does not fit (the name, say) is not given.
const checked = (profile: AccountProfile) => {
   let current: unknown = profile
   let dropped = 0

   for (let attempt = 0; attempt <= Object.keys(EMPTY).length; attempt += 1) {
      const result = accountProfileSchema.safeParse(current)

      if (result.success) {
         return {
            profile: result.data,
            dropped,
         }
      }

      const [key] = result.error.issues[0]?.path ?? []

      if (typeof key !== 'string' || !(key in EMPTY)) {
         return {
            profile: undefined,
            dropped,
         }
      }

      dropped += 1
      current = {
         ...(current as Record<string, unknown>),
         [key]: EMPTY[key],
      }
   }

   return {
      profile: undefined,
      dropped,
   }
}

// Reading step of the profile task (.plan/linkedin-profile-task.md): it opens the account's own profile and the pages behind its "Show
// all" links that the readers know, reads what they show, and hands over `profile.json` (the contract `accountProfileSchema`). It
// clicks only the chips of Interests. Names and words of the profile never reach the log, a warning or the report.
export const readProfile = async (
   context: PageContext,
   baseUrl: string,
   input: ProfileInput,
   deps: PageDeps = {}
): Promise<ProfileRead> => {
   const { log, warn, attach } = context
   const { now = Date.now } = deps
   const pages = createPages(context, baseUrl, deps)
   // A run keeps at most 20 files: the profile keeps its links and controls, each other page only its markup.
   const keep = createKeep(context, input.snapshots)
   const keepLean = createKeep(context, input.snapshots, undefined, false)
   const interests = structuredClone(noInterests)
   const draft = {
      experience: [] as AccountProfile['experience'],
      education: [] as AccountProfile['education'],
      projects: [] as AccountProfile['projects']['items'],
      skills: [] as AccountProfile['skills']['items'],
      received: [] as AccountProfile['recommendations']['received']['items'],
      given: [] as AccountProfile['recommendations']['given']['items'],
      languages: [] as AccountProfile['languages']['items'],
      posts: [] as NonNullable<AccountProfile['activity']>['posts'],
      comments: [] as NonNullable<AccountProfile['activity']>['comments'],
   }

   const addInterests = (html: string) => {
      const found = parseInterests(html)

      for (const kind of Object.keys(interests) as Array<keyof typeof interests>) {
         const known = new Set(interests[kind].map(item => item.url ?? item.name))

         for (const item of found[kind]) {
            if (!known.has(item.url ?? item.name) && interests[kind].length < 50) {
               interests[kind].push(item)
               known.add(item.url ?? item.name)
            }
         }
      }
   }

   try {
      const profileUrl = await pages.openOwn()

      if (!profileUrl) {
         log('The account’s own profile did not open')

         return {
            outcome: 'NOT_OPENED',
            counts: [],
            dropped: 0,
         }
      }

      await pages.scrollThrough()
      await keep('profile')

      const main = await pages.html()
      const top = parseTopCard(main)

      if (!top) {
         log('The page did not hold a profile')

         return {
            outcome: 'NOT_OPENED',
            counts: [],
            dropped: 0,
         }
      }

      const { name } = top
      log('Read the profile')
      draft.experience = parseExperience(main)

      const done = await runTargets({
         targets: [...DETAIL_PAGES],
         step: async page => {
            await pages.open(`${profileUrl}${page.path}`)
            await pages.scrollThrough()
            await keepLean(`detail-${page.name}`)

            const html = await pages.html()

            if (page.name === 'experience') draft.experience = parseExperience(html)
            if (page.name === 'education') draft.education = parseEducation(html)
            if (page.name === 'projects') draft.projects = parseProjects(html)
            if (page.name === 'skills') draft.skills = parseSkills(html)
            if (page.name === 'recommendations-received') draft.received = parseRecommendations(html)
            if (page.name === 'recommendations-given') draft.given = parseRecommendations(html)
            if (page.name === 'languages') draft.languages = parseLanguages(html)
            if (page.name === 'posts') draft.posts = parsePosts(html, ACTIVITY_LIMIT)
            if (page.name === 'comments') draft.comments = parseComments(html, ACTIVITY_LIMIT, name)

            if (page.name === 'interests') {
               addInterests(html)
               await pages.eachInterestTab(async () => {
                  await pages.scrollThrough()
                  addInterests(await pages.html())
               })
            }

            log(`Read the page of ${page.name}`)

            return true
         },
         recover: () => Promise.resolve(),
         between: pages.between,
         elapsed: pages.elapsed,
         budgetMs: BUDGET_MS,
         maxFailuresInARow: MAX_FAILURES_IN_A_ROW,
         isFatal: error => error instanceof SignedOut,
         warn,
         says: {
            stepStopped: 'A page of the profile did not open',
            notRecovered: 'The profile could not be opened again',
         },
      })

      const suggestions = parseSuggestions(main)
      const followers = parseFollowers(main)
      const full: AccountProfile = {
         contract: PROFILE_CONTRACT_VERSION,
         captured_at: new Date(now()).toISOString(),
         profileUrl: top.profileUrl,
         name: top.name,
         verified: top.verified,
         pronouns: top.pronouns,
         headline: top.headline,
         location: top.location,
         imageUrl: top.imageUrl,
         coverUrl: top.coverUrl,
         followers,
         connections: top.connections,
         about: parseAbout(main),
         openToWork: parseOpenToWork(main),
         topSkills: [],
         services: parseServices(main),
         analytics: parseAnalytics(main),
         activity: {
            followers,
            posts: draft.posts,
            comments: draft.comments,
         },
         experience: draft.experience,
         education: draft.education,
         projects: listOf(draft.projects, 100),
         skills: listOf(draft.skills, 500),
         recommendations: {
            received: listOf(draft.received, 100),
            given: listOf(draft.given, 100),
         },
         languages: listOf(draft.languages, 50),
         interests,
         peopleYouMayKnow: suggestions.peopleYouMayKnow,
         youMightLike: suggestions.youMightLike,
      }
      const { profile, dropped } = checked(full)

      if (!profile) {
         warn('The profile did not match its contract')

         return {
            outcome: 'INVALID',
            counts: [],
            dropped,
         }
      }

      attach('profile.json', JSON.stringify(profile, null, 1), 'application/json')

      return {
         outcome: done === DETAIL_PAGES.length && dropped === 0 ? 'DONE' : 'PARTIAL',
         counts: [
            {
               label: 'Jobs',
               count: profile.experience.length,
            },
            {
               label: 'Schools',
               count: profile.education.length,
            },
            {
               label: 'Skills',
               count: profile.skills.items.length,
            },
            {
               label: 'Projects',
               count: profile.projects.items.length,
            },
            {
               label: 'Recommendations received',
               count: profile.recommendations.received.items.length,
            },
            {
               label: 'Recommendations given',
               count: profile.recommendations.given.items.length,
            },
            {
               label: 'Languages',
               count: profile.languages.items.length,
            },
            {
               label: 'Services',
               count: profile.services.length,
            },
            {
               label: 'Interests',
               count: Object.values(profile.interests).reduce((sum, list) => sum + list.length, 0),
            },
            {
               label: 'Posts',
               count: profile.activity?.posts.length ?? 0,
            },
            {
               label: 'Comments',
               count: profile.activity?.comments.length ?? 0,
            },
            {
               label: 'People you may know',
               count: profile.peopleYouMayKnow.length,
            },
            {
               label: 'Pages you might like',
               count: profile.youMightLike.length,
            },
         ],
         dropped,
      }
   } catch (error) {
      if (error instanceof SignedOut) {
         return {
            outcome: 'SIGNED_OUT',
            counts: [],
            dropped: 0,
         }
      }

      if (error instanceof StepFailed) {
         warn(describeError(error, 'The profile could not be opened'))

         return {
            outcome: 'NOT_OPENED',
            counts: [],
            dropped: 0,
         }
      }

      throw error
   }
}
