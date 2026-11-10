import { z } from 'zod'

import {
   type CompanyItem,
   type PersonItem,
   type PersonSnapshotData,
   type PostItem,
   type WorkflowItemData,
   domainOfWebsite,
   expandShortPostLink,
   isShortPostLink,
   mergeBySlug,
   parseLinkedInUrl,
   person,
   profileFacts,
   readItem,
   snapshotFrom,
} from 'core'

import {
   COMPANY_REMEMBER_DAYS,
   ColleaguesService,
   CollectCacheService,
   CollectKeepService,
   EMAIL_REMEMBER_DAYS,
   InputPickService,
   InputTakenService,
   type InputType,
   type Kept,
   LinkedInCompanyService,
   LinkedInPostService,
   LinkedInProfileService,
   PeopleLabelService,
   PersonSnapshotService,
   PostPageService,
   RECENT_DAYS,
   type SeenSkip,
   TAKEN_KIND,
   WorkflowListService,
   WorkflowRunService,
} from 'database'

import {
   ALL_CAP,
   ELSE_SOURCES,
   type GraphNode,
   inputPickOf,
   inputTake,
   keepLabelOf,
   portKey,
   portOfEdge,
} from '@automatedLinkedIn/contracts'

import {
   ENRICH_BATCH,
   adsFrom,
   adsParams,
   cardFromSnapshot,
   commentersFrom,
   commentersParams,
   companiesFrom,
   companiesFromDomains,
   companiesLinksParams,
   domainParams,
   emailsFrom,
   emailsParams,
   employeesFrom,
   employeesParams,
   engagedParams,
   findPostsParams,
   hiringFrom,
   jobPostingsFrom,
   jobPostingsParams,
   jobsParams,
   postsFrom,
   postsOfParams,
   profileRowsFrom,
   profilesFrom,
   profilesParams,
   reactorsFrom,
   reactorsParams,
   searchCompaniesParams,
   searchPeopleParams,
   searchedPeopleFrom,
} from '../data/operations'
import { getConnections, getConversations, getRequests } from './accountRead'
import { answerRequests } from './answerRequests'
import { removeConnections } from './connectionBlocks'
import {
   type Context,
   DAY_MS,
   type Request,
   type StepResult,
   Waiting,
   aside,
   collectEach,
   companiesOf,
   configOf,
   elseKey,
   keepItems,
   numberIn,
   parentsOf,
   peopleOf,
   postsOf,
   rulesOf,
   scoringNodeBefore,
   textIn,
   thresholdsOf,
   wordsIn,
} from './context'
import { commentOnPosts, reactToPosts } from './engageBlocks'
import { eventTrigger, hookTrigger, ifEvent, messageMood, runEvent } from './eventBlocks'
import { sendInvites, withdrawInvites } from './inviteBlocks'
import { retry, stop, taskResult, wait } from './logicBlocks'
import { getFeed, getMutual, getNotifications, getViewers } from './ownPageBlocks'
import { getChat, ifPerson, splitPeople } from './personBlocks'
import { bestPerCompany, scoreCompanies, scoreSignals, spaceOut, stopContacting } from './rankBlocks'
import { classifyItems, detectChanges, findThePattern } from './readBlocks'
import { cutOf, withoutSlugs } from './readLimit'
import { replyToConversations, sendMessages } from './replyBlocks'
import { fitToRoom, personWait } from './roomBlocks'
import { runWorkflow } from './runWorkflow'
import { sendPages } from './sendApi'
import { applyProfiles, conditionsOf, filterPeople, matches, rescorePeople, scorePeople } from './steps'
import { selectAccounts, visitCompany, visitProfile } from './visitPages'
import { approvedTrigger, askMeFirst, writeWordsOnPosts } from './writeBlocks'
import { writePost } from './writePost'

const DONE: StepResult = {
   status: 'DONE',
   itemsIn: 0,
   itemsOut: 0,
}

const JOB_BATCH = 10

// What a finished workflow passed on. What an API call sent is read through `sentTo`, or put in the block's settings.
const inputSchema = z.object({ people: z.array(z.unknown()).optional() })

const runInput = (ctx: Context) => inputSchema.safeParse(ctx.run.input).data ?? {}

// The values an API call sent in a field, for a block that reads the call itself. A block with a setting a call replaces
// is given the values in that setting instead (`applyApiInput`).
const sentTo = (ctx: Context, field: string) => {
   const value = z.record(z.string(), z.unknown()).safeParse(ctx.run.input).data?.[field]

   return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : undefined
}

const linksOf = (urls: string[], kind: 'post' | 'profile' | 'company') =>
   urls.flatMap(url => {
      const link = parseLinkedInUrl(url, kind)

      return link ? [link] : []
   })

// The data service cannot read lnkd.in short links: send the post they lead to. A short link not expanded when it was
// saved is expanded now and kept; if that fails too, the short link is sent and that post finds nobody.
const sendableUrl = async (post: { id: string | null; url: string; expandedUrl: string | null }) => {
   if (post.expandedUrl || !isShortPostLink(post.url)) {
      return post.expandedUrl ?? post.url
   }

   const expanded = await expandShortPostLink(post.url)

   if (expanded && post.id) {
      await LinkedInPostService.saveExpanded(post.id, expanded)
   }

   return expanded ?? post.url
}

// The slice of the owner's list the block's settings pick.
const pickFilter = (ctx: Context, type: InputType) =>
   InputPickService.filter(
      ctx.run.userId,
      inputPickOf(type, ctx.node.config),
      ctx.run.workflowId,
      type,
      new Date(),
      ctx.run.id
   )

// A block that skips what the workflow already took remembers this batch; a preview never does.
const rememberTaken = async (ctx: Context, type: InputType, slugs: string[]) => {
   if (!ctx.preview && inputPickOf(type, ctx.node.config).skipTaken) {
      await InputTakenService.record(ctx.run.workflowId, ctx.run.id, TAKEN_KIND[type], slugs)
   }
}

const inputPosts = async (ctx: Context): Promise<StepResult> => {
   const sent = sentTo(ctx, 'posts')
   const posts = sent
      ? linksOf(sent, 'post').map(link => ({
           ...link,
           id: null,
           expandedUrl: null,
        }))
      : await LinkedInPostService.waiting(ctx.run.userId, inputTake('input.posts', ctx.node.config), {
           ...(await pickFilter(ctx, 'input.posts')),
           statuses: [],
        })
   const previews = await PostPageService.previews(
      ctx.run.userId,
      posts.map(({ slug }) => slug)
   )
   const items: PostItem[] = await Promise.all(
      posts.map(async post => ({
         kind: 'post' as const,
         slug: post.slug,
         url: await sendableUrl(post),
         postId: post.id,
         preview: previews.get(post.slug) ?? null,
      }))
   )
   const result = await keepItems(ctx, items, 0)

   if (!sent) {
      await rememberTaken(
         ctx,
         'input.posts',
         posts.map(({ slug }) => slug)
      )
   }

   return {
      ...result,
      message: items.length === 0 ? 'No waiting posts in your posts list match this block.' : undefined,
   }
}

// People from /profiles, from the links set on the block, or from an API call. They are "known": being in
// /profiles does not stop them later.
const inputProfiles = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const links = wordsIn(config, 'links')
   const people =
      links.length > 0
         ? linksOf(links, 'profile').map(link =>
              person({
                 ...link,
                 known: true,
              })
           )
         : (
              await LinkedInProfileService.pick(
                 ctx.run.userId,
                 inputTake('input.profiles', ctx.node.config),
                 await pickFilter(ctx, 'input.profiles')
              )
           ).map(profile =>
              person({
                 slug: profile.slug,
                 url: profile.url,
                 name: profile.fullName,
                 headline: profile.headline,
                 location: profile.location,
                 known: true,
              })
           )
   const result = await keepItems(ctx, mergeBySlug(people), 0)

   if (links.length === 0) {
      await rememberTaken(
         ctx,
         'input.profiles',
         people.map(({ slug }) => slug)
      )
   }

   return {
      ...result,
      message:
         people.length === 0
            ? `No profiles in ${ctx.node.config.source === 'network' ? 'My network' : 'your profiles list'} match this block.`
            : undefined,
   }
}

const inputCompanies = async (ctx: Context): Promise<StepResult> => {
   const sent = sentTo(ctx, 'companies')
   const companies: CompanyItem[] = sent
      ? linksOf(sent, 'company').map(link => ({
           kind: 'company',
           ...link,
           name: null,
           hiring: [],
        }))
      : (
           await LinkedInCompanyService.pick(
              ctx.run.userId,
              inputTake('input.companies', ctx.node.config),
              await pickFilter(ctx, 'input.companies')
           )
        ).map(company => ({
           kind: 'company',
           slug: company.slug,
           url: company.url,
           name: company.name,
           hiring: [],
        }))
   const result = await keepItems(ctx, companies, 0)

   if (!sent) {
      await rememberTaken(
         ctx,
         'input.companies',
         companies.map(({ slug }) => slug)
      )
   }

   return {
      ...result,
      message: companies.length === 0 ? 'No companies in your companies list match this block.' : undefined,
   }
}

// What the workflow this one listens to gave back. A person is known: being in its list does not stop them here.
const afterWorkflow = async (ctx: Context): Promise<StepResult> => {
   const items = (runInput(ctx).people ?? []).flatMap(data => {
      const item = readItem(data)

      if (!item) {
         return []
      }

      return [
         item.kind === 'profile'
            ? {
                 ...item,
                 known: true,
                 score: null,
                 band: null,
                 matched: [],
              }
            : item,
      ]
   })

   return keepItems(ctx, items, 0)
}

const engagement = (ctx: Context, kind: 'commenters' | 'reactors') => {
   const config = configOf(ctx.node)
   const limit = config.all === true ? ALL_CAP : numberIn(config, 'howMany')

   return collectEach(
      ctx,
      postsOf(ctx.inputs).map(post => ({
         inputKey: post.slug,
         slug: kind === 'commenters' ? 'post-comments' : 'post-reactions',
         params:
            kind === 'commenters'
               ? commentersParams(post, {
                    limit,
                    postedWithin: textIn(config, 'postedWithin'),
                    includeReplies: config.includeReplies === true,
                 })
               : reactorsParams(post, {
                    limit,
                    reactionType: textIn(config, 'reactionType'),
                 }),
         use: async rows => {
            const people = kind === 'commenters' ? commentersFrom(rows, post) : reactorsFrom(rows, post)

            await WorkflowRunService.mergePeople(ctx.at, people)
         },
      }))
   )
}

type Executor = (ctx: Context) => Promise<StepResult>
type Row = Record<string, unknown>

// Whether the block keeps what it finds in the owner's lists and remembers it. A preview keeps nothing.
const keeps = (ctx: Context) => configOf(ctx.node).keep === true && !ctx.preview

// Whether the block reads again what was read in the last 30 days.
const rereads = (ctx: Context) => configOf(ctx.node).reread === true

// A request whose items are kept for a week when the block keeps what it finds: the same request asked again gives them
// back for nothing. `save` writes items into the step's output.
const remembering = (
   ctx: Context,
   spec: {
      inputKey: string
      slug: string
      params: Record<string, unknown>
      map: (rows: Row[]) => WorkflowItemData[]
      save: (items: WorkflowItemData[]) => Promise<unknown>
      // What else a finished request stores, such as the full profiles it came with.
      also?: (rows: Row[]) => Promise<void>
      // False when the same request must always be asked again (a short window); the default remembers it for a week.
      reuse?: boolean
   }
): Request => ({
   inputKey: spec.inputKey,
   slug: spec.slug,
   params: spec.params,
   recall: async () => {
      const items =
         keeps(ctx) && spec.reuse !== false
            ? await CollectCacheService.find(ctx.run.userId, spec.slug, spec.params)
            : null

      if (!items) {
         return false
      }

      await spec.save(items)

      return true
   },
   use: async rows => {
      const items = spec.map(rows)

      await spec.save(items)

      if (keeps(ctx)) {
         await spec.also?.(rows)

         if (spec.reuse !== false) {
            await CollectCacheService.put(ctx.run.userId, spec.slug, spec.params, items)
         }
      }
   },
})

const seed = (ctx: Context) => (items: WorkflowItemData[]) => WorkflowRunService.seedItems(ctx.at, items)

const mergeIn = (ctx: Context) => (items: WorkflowItemData[]) => WorkflowRunService.mergePeople(ctx.at, peopleOf(items))

// Full profiles that came with a search are kept, so reading them later is not paid for again.
const rememberProfiles = (ctx: Context) => async (rows: Row[]) => {
   for (const [slug, row] of profileRowsFrom(rows)) {
      await PersonSnapshotService.save(ctx.run.userId, slug, snapshotFrom(row))
   }
}

const savePosts = (ctx: Context) => async (rows: Record<string, unknown>[]) => {
   await WorkflowRunService.seedItems(ctx.at, postsFrom(rows))
}

const SHORT_WINDOWS = new Set(['1h', '24h', 'week'])

const findPosts = (ctx: Context) => {
   const config = configOf(ctx.node)

   return collectEach(ctx, [
      remembering(ctx, {
         inputKey: 'search',
         slug: 'posts',
         params: findPostsParams({
            keywords: textIn(config, 'keywords'),
            postedWithin: textIn(config, 'postedWithin'),
            howMany: numberIn(config, 'howMany'),
            sortBy: textIn(config, 'sortBy'),
            contentType: textIn(config, 'contentType'),
            includeReposts: config.includeReposts === true,
            includeQuotePosts: config.includeQuotePosts === true,
            authors: wordsIn(config, 'authors'),
            mentioning: wordsIn(config, 'mentioning'),
         }),
         map: postsFrom,
         save: seed(ctx),
         // A search for the last hour, day or week is asked again every time, so a daily run sees today's posts.
         reuse: !SHORT_WINDOWS.has(textIn(config, 'postedWithin')),
      }),
   ])
}

type PostSource = { slug: string; url: string; score?: number | null }

// Posts of people carry who wrote them and the score that person had, so a block after it can take the best authors first, and the
// step says how many people had no post in the window.
const postsOfEach = async (ctx: Context, sources: PostSource[], byPerson: boolean): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const settings = {
      howMany: numberIn(config, 'howMany'),
      postedWithin: textIn(config, 'postedWithin'),
      includeReposts: config.includeReposts === true,
   }
   const result = await collectEach(
      ctx,
      sources.map(source => ({
         inputKey: source.slug,
         slug: 'posts',
         params: postsOfParams(source.url, settings),
         use: async (rows: Record<string, unknown>[]) => {
            await WorkflowRunService.seedItems(
               ctx.at,
               postsFrom(rows).map(post =>
                  byPerson
                     ? {
                          ...post,
                          authorSlug: source.slug,
                          authorScore: source.score ?? null,
                       }
                     : post
               )
            )
         },
      }))
   )

   if (!byPerson) {
      return result
   }

   const written = new Set(postsOf(await WorkflowRunService.items(ctx.run.id, [ctx.at])).map(post => post.authorSlug))
   const without = sources.filter(({ slug }) => !written.has(slug)).length

   return without === 0
      ? result
      : {
           ...result,
           message: [result.message, `${without} of ${sources.length} people had no post in the window.`]
              .filter(Boolean)
              .join(' '),
        }
}

const engagedPosts = (ctx: Context) => {
   const config = configOf(ctx.node)
   const settings = {
      howMany: numberIn(config, 'howMany'),
      postedWithin: textIn(config, 'postedWithin'),
   }

   return collectEach(
      ctx,
      peopleOf(ctx.inputs).flatMap(item =>
         ['profile-comments', 'profile-reactions'].map(slug => ({
            inputKey: `${item.slug}:${slug}`,
            slug,
            params: engagedParams(item, settings),
            use: savePosts(ctx),
         }))
      )
   )
}

const employees = (ctx: Context) => {
   const config = configOf(ctx.node)
   const settings = {
      howMany: numberIn(config, 'howMany'),
      titles: wordsIn(config, 'titles'),
      seniority: wordsIn(config, 'seniority'),
      functions: wordsIn(config, 'functions'),
      locations: wordsIn(config, 'locations'),
      pastTitles: wordsIn(config, 'pastTitles'),
      yearsAtCompany: wordsIn(config, 'yearsAtCompany'),
      yearsOfExperience: wordsIn(config, 'yearsOfExperience'),
      headcount: wordsIn(config, 'headcount'),
      changedJobs: config.changedJobs === true,
      industries: wordsIn(config, 'industries'),
   }

   return collectEach(
      ctx,
      companiesOf(ctx.inputs).map(company =>
         remembering(ctx, {
            inputKey: company.slug,
            slug: 'company-employees',
            params: employeesParams(company, settings),
            map: rows => employeesFrom(rows, company),
            save: mergeIn(ctx),
            also: rememberProfiles(ctx),
         })
      )
   )
}

// Marks the companies that are hiring for the role; the rest are dropped or passed on, as the block says.
const jobs = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const companies = companiesOf(ctx.inputs)
   const settings = {
      jobTitle: textIn(config, 'jobTitle'),
      howMany: numberIn(config, 'howMany'),
      location: textIn(config, 'location'),
      workplace: textIn(config, 'workplace'),
      employment: textIn(config, 'employment'),
      experience: textIn(config, 'experience'),
      postedWithin: textIn(config, 'postedWithin'),
      salary: textIn(config, 'salary'),
      sortBy: textIn(config, 'sortBy'),
      easyApply: config.easyApply === true,
      fewApplicants: config.fewApplicants === true,
      industries: wordsIn(config, 'industries'),
   }

   await WorkflowRunService.seedItems(ctx.at, companies)

   const batches = Array.from({ length: Math.ceil(companies.length / JOB_BATCH) }, (_, index) =>
      companies.slice(index * JOB_BATCH, (index + 1) * JOB_BATCH)
   )
   const result = await collectEach(
      ctx,
      batches.map((batch, index) => ({
         inputKey: `batch-${index}`,
         slug: 'jobs',
         params: jobsParams(batch, settings),
         use: async rows => {
            const roles = hiringFrom(rows, batch)

            await WorkflowRunService.putItems(
               ctx.at,
               batch.map(company => ({
                  ...company,
                  hiring: roles.get(company.slug) ?? [],
               }))
            )
         },
      }))
   )
   const stored = companiesOf(await WorkflowRunService.items(ctx.run.id, [ctx.at]))
   const kept = config.onlyHiring === false ? stored : stored.filter(({ hiring }) => hiring.length > 0)
   const final = await keepItems(ctx, kept, companies.length)

   return {
      ...result,
      itemsOut: final.itemsOut,
   }
}

const domainLookup = (ctx: Context) => {
   const config = configOf(ctx.node)

   return collectEach(ctx, [
      remembering(ctx, {
         inputKey: 'lookup',
         slug: 'domain-lookup',
         params: domainParams(wordsIn(config, 'domains'), numberIn(config, 'howMany')),
         map: companiesFromDomains,
         save: seed(ctx),
      }),
   ])
}

const searchPeople = (ctx: Context) => {
   const config = configOf(ctx.node)

   return collectEach(ctx, [
      remembering(ctx, {
         inputKey: 'search',
         slug: 'profiles',
         params: searchPeopleParams({
            keywords: textIn(config, 'keywords'),
            titles: wordsIn(config, 'titles'),
            companies: wordsIn(config, 'companies'),
            locations: wordsIn(config, 'locations'),
            seniority: wordsIn(config, 'seniority'),
            functions: wordsIn(config, 'functions'),
            headcount: wordsIn(config, 'headcount'),
            industries: wordsIn(config, 'industries'),
            yearsOfExperience: wordsIn(config, 'yearsOfExperience'),
            changedJobs: config.changedJobs === true,
            postedRecently: config.postedRecently === true,
            howMany: numberIn(config, 'howMany'),
            yearsAtCompany: wordsIn(config, 'yearsAtCompany'),
            pastCompanies: wordsIn(config, 'pastCompanies'),
            pastTitles: wordsIn(config, 'pastTitles'),
            schools: wordsIn(config, 'schools'),
            names: wordsIn(config, 'names'),
            companyHQLocations: wordsIn(config, 'companyHQLocations'),
            profileLanguages: wordsIn(config, 'profileLanguages'),
         }),
         map: rows => searchedPeopleFrom(rows).slice(0, numberIn(config, 'howMany')),
         save: mergeIn(ctx),
         also: rememberProfiles(ctx),
      }),
   ])
}

// Campaign labels are written by a real run of a campaign workflow, never by a preview.
const labelsCampaign = (ctx: Context) => !ctx.preview && Boolean(ctx.run.workflow.campaign)

const labelOf = ({ slug, tags }: PersonItem) => ({
   slug,
   tags,
})

// Process tag labels only the people who have a row; the list step builds the rows of the people it inserts.
const EXISTING_ROWS = { build: false }

const overflowOf = (dropped: number) => (dropped > 0 ? `${dropped} labels did not fit.` : null)

// Reads the full profile of everyone it gets who was not read yet. A full profile the owner got in the last 30 days
// is used again instead of paid for (unless the block reads again), and every one it pays for is kept so the drawer
// shows it. After a Score block they are scored again and the ones that no longer fit are dropped; without one they
// keep no score. It leaves the step's output to its caller. `reuse` is the stored reads a caller already looked up.
const readPeople = async (ctx: Context, people: PersonItem[], reuse?: Map<string, PersonSnapshotData>) => {
   const { run, node, graph, at } = ctx
   const scoring = scoringNodeBefore(graph, node.id)
   const rules = scoring ? await rulesOf(run.userId, scoring) : null
   const thresholds = thresholdsOf(run, scoring)
   const pending = people.filter(({ enriched }) => !enriched)
   const stored =
      reuse ??
      (rereads(ctx)
         ? new Map<string, PersonSnapshotData>()
         : await PersonSnapshotService.recent(
              run.userId,
              pending.map(({ slug }) => slug)
           ))
   const reused = pending.filter(({ slug }) => stored.has(slug))
   const toRead = pending.filter(({ slug }) => !stored.has(slug)).sort((a, b) => a.slug.localeCompare(b.slug))
   const batches = Array.from({ length: Math.ceil(toRead.length / ENRICH_BATCH) }, (_, index) =>
      toRead.slice(index * ENRICH_BATCH, (index + 1) * ENRICH_BATCH)
   )

   await WorkflowRunService.seedItems(at, people)

   if (reused.length > 0) {
      const cards = new Map([...stored].map(([slug, snapshot]) => [slug, cardFromSnapshot(snapshot)]))

      await WorkflowRunService.putItems(at, applyProfiles(reused, cards, rules, thresholds))
   }

   const collected = await collectEach(
      ctx,
      batches.map((batch, index) => ({
         inputKey: `batch-${index}`,
         slug: 'profiles',
         params: profilesParams(batch),
         use: async rows => {
            const found = profileRowsFrom(rows)

            if (!ctx.preview) {
               for (const [slug, row] of found) {
                  await PersonSnapshotService.save(run.userId, slug, snapshotFrom(row))
               }
            }

            await WorkflowRunService.putItems(at, applyProfiles(batch, profilesFrom(rows), rules, thresholds))
         },
      }))
   )
   const read = peopleOf(await WorkflowRunService.items(run.id, [at]))
   // The company of the current job, read when the block says so; the people are scored again with what it says.
   const companies = configOf(node).readCompany === true ? await withCompanies(ctx, read, rules, thresholds) : null
   const all = companies ? [...companies.kept, ...companies.leftOut] : read
   const kept = rules ? all.filter(({ band }) => band !== null) : all
   const note = reused.length > 0 ? `${reused.length} read in the last ${RECENT_DAYS} days, not paid again.` : null

   return {
      kept,
      collected: companies
         ? {
              ...collected,
              status:
                 collected.status === 'PARTIAL' || companies.collected.status === 'PARTIAL'
                    ? ('PARTIAL' as const)
                    : ('DONE' as const),
              message: [collected.message, companies.collected.message].filter(Boolean).join(' ') || undefined,
           }
         : collected,
      note,
   }
}

const enrich = async (ctx: Context): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const { kept, collected, note } = await readPeople(ctx, people)
   const result = await keepItems(ctx, kept, people.length)

   return {
      ...result,
      status: collected.status,
      message: [collected.message, note].filter(Boolean).join(' ') || undefined,
   }
}

const SEEN_CHUNK = 1_000

// Drops people the owner already has, as the block says, or must not contact. Known people (picked by the owner or
// handed over by another workflow) are dropped only when they must not be contacted.
const notSeen = async (userId: string, people: PersonItem[], skip: SeenSkip) => {
   const seen = new Set<string>()

   for (const known of [false, true]) {
      const group = people.filter(item => item.known === known)
      const groupSkip = known
         ? {
              lists: false,
              profiles: false,
           }
         : skip

      for (let start = 0; start < group.length; start += SEEN_CHUNK) {
         const chunk = group.slice(start, start + SEEN_CHUNK).map(({ slug }) => slug)

         for (const slug of await WorkflowListService.seenAmong(userId, chunk, groupSkip)) {
            seen.add(slug)
         }
      }
   }

   return people.filter(({ slug }) => !seen.has(slug))
}

// Adds everyone it gets to the workflow's list: Qualified or Maybe after scoring, Unscored without it. What it got
// is also its output, so blocks after it see the same people.
const addToList = async (ctx: Context): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs))

   await keepItems(ctx, people, people.length)

   if (ctx.preview) {
      return {
         status: 'DONE',
         itemsIn: people.length,
         itemsOut: people.length,
         message: 'A preview adds nobody to the list.',
      }
   }

   const added = await WorkflowListService.addFromRun(
      ctx.run.userId,
      ctx.run.workflow.outputListId,
      ctx.run.id,
      people.map(item => ({
         slug: item.slug,
         url: item.url,
         name: item.name,
         headline: item.headline,
         location: item.location,
         state: item.band ?? 'UNSCORED',
         postUrl: item.signals[0]?.via ?? null,
         score: item.score,
         signals: item.signals,
         title: item.title,
         company: item.company,
         followers: item.followers,
         matched: item.matched,
         tags: item.tags,
         known: item.known,
      }))
   )

   const dropped = labelsCampaign(ctx)
      ? (
           await PeopleLabelService.label(
              ctx.run.userId,
              people.filter(({ slug }) => added.slugs.includes(slug)).map(labelOf),
              { build: true }
           )
        ).dropped
      : 0

   return addNote(
      {
         status: 'DONE',
         itemsIn: people.length,
         itemsOut: people.length,
         message: `${added.count} new in the list.`,
      },
      overflowOf(dropped)
   )
}

const markPosts = async (ctx: Context): Promise<StepResult> => {
   const posts = postsOf(ctx.inputs)
   const ids = posts.flatMap(({ postId }) => (postId ? [postId] : []))

   await keepItems(ctx, posts, posts.length)

   if (ctx.preview) {
      return {
         status: 'DONE',
         itemsIn: ids.length,
         itemsOut: posts.length,
         message: 'A preview leaves your posts as they are.',
      }
   }

   if (ctx.run.steps.some(step => step.id !== ctx.step.id && step.status !== 'DONE')) {
      return {
         status: 'DONE',
         itemsIn: ids.length,
         itemsOut: posts.length,
         message: 'The posts stay not done because the run did not finish fully.',
      }
   }

   const marked = await LinkedInPostService.setStatusMany(ctx.run.userId, ids, 'PROCESSED')

   return {
      status: 'DONE',
      itemsIn: ids.length,
      itemsOut: posts.length,
      message: `${marked} posts marked done.`,
   }
}

// Passes on the people who match its conditions; the rest are kept aside for an Else block after it.
const ifBlock = async (ctx: Context): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const conditions = conditionsOf(configOf(ctx.node))
   const passed = people.filter(item => matches(item, conditions))
   const passedSlugs = new Set(passed.map(({ slug }) => slug))

   await WorkflowRunService.replaceItems(
      elseKey(ctx, ctx.node.id),
      people.filter(({ slug }) => !passedSlugs.has(slug))
   )

   return keepItems(ctx, passed, people.length)
}

const elseBlock = async (ctx: Context): Promise<StepResult> => {
   const sources = parentsOf(ctx.graph, ctx.node.id).filter(id =>
      ctx.graph.nodes.some(node => node.id === id && ELSE_SOURCES.has(node.type))
   )
   const rest = await WorkflowRunService.items(
      ctx.run.id,
      sources.map(id => elseKey(ctx, id))
   )
   const people = mergeBySlug(peopleOf(rest))

   return keepItems(ctx, [...people, ...rest.filter(({ kind }) => kind !== 'profile')], rest.length)
}

// Passes on one batch per round; the engine starts the next round while batches are left.
const forEach = async (ctx: Context): Promise<StepResult> => {
   const size = numberIn(configOf(ctx.node), 'batchSize')
   const start = ctx.step.round * size
   const result = await keepItems(ctx, ctx.inputs.slice(start, start + size), ctx.inputs.length)

   return {
      ...result,
      message: `Batch ${ctx.step.round + 1} of ${Math.max(1, Math.ceil(ctx.inputs.length / size))}.`,
   }
}

const CSV_KEEP_DAYS = 90

const identity = (item: WorkflowItemData) => `${item.kind}:${item.slug}`

// Joins what its lines found: everything once, only what every line has, or only what the main line has and the
// others do not. People found on several lines keep every reason.
const merge = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const lines = await Promise.all(
      ctx.graph.edges
         .filter(({ to }) => to === ctx.node.id)
         .map(async edge => ({
            nodeId: edge.from,
            keys: new Set(
               (
                  await WorkflowRunService.items(ctx.run.id, [
                     {
                        nodeId: portKey(edge.from, portOfEdge(ctx.graph, edge)),
                        round: ctx.step.round,
                     },
                  ])
               ).map(identity)
            ),
         }))
   )
   const main = lines.find(({ nodeId }) => nodeId === config.main) ?? lines[0]
   const others = lines.filter(line => line !== main)
   const keep = (key: string) => {
      if (config.mode === 'every') {
         return lines.every(({ keys }) => keys.has(key))
      }

      if (config.mode === 'onlyMain') {
         return Boolean(main?.keys.has(key)) && !others.some(({ keys }) => keys.has(key))
      }

      return true
   }
   const kept = ctx.inputs.filter(item => keep(identity(item)))
   const people = mergeBySlug(peopleOf(kept))
   const rest = [...new Map(kept.filter(({ kind }) => kind !== 'profile').map(item => [identity(item), item])).values()]

   return keepItems(ctx, [...people, ...rest], ctx.inputs.length)
}

const exportCsv = async (ctx: Context): Promise<StepResult> => {
   await WorkflowRunService.replaceItems(ctx.at, ctx.inputs, new Date(Date.now() + CSV_KEEP_DAYS * DAY_MS))

   return {
      status: 'DONE',
      itemsIn: ctx.inputs.length,
      itemsOut: ctx.inputs.length,
      message: 'Ready to download from the run for 90 days.',
   }
}

// The run's result for whoever started it, of any kind (read through `WorkflowRunService.returned`).
const giveBack = (ctx: Context): Promise<StepResult> => keepItems(ctx, ctx.inputs, ctx.inputs.length)

const sendApi = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)

   await keepItems(ctx, ctx.inputs, ctx.inputs.length)

   if (ctx.preview) {
      return {
         status: 'DONE',
         itemsIn: ctx.inputs.length,
         itemsOut: ctx.inputs.length,
         message: 'A preview sends nothing.',
      }
   }

   const event = await runEvent(ctx)
   const sent = await sendPages(
      {
         url: textIn(config, 'url'),
         secret: textIn(config, 'secret'),
         post: ctx.deps.post,
      },
      {
         workflowId: ctx.run.workflowId,
         runId: ctx.run.id,
         ...(event && { event }),
      },
      ctx.inputs
   )

   return {
      status: sent.failed > 0 ? 'PARTIAL' : 'DONE',
      itemsIn: ctx.inputs.length,
      itemsOut: ctx.inputs.length,
      message:
         sent.failed > 0
            ? `Your address did not accept ${sent.failed} of ${sent.pages} requests: ${sent.error ?? 'no answer'}.`
            : `Sent in ${sent.pages} requests.`,
   }
}

// What a block that keeps its finds says it kept.
const keptNote = ({ people, companies, posts, jobs, skipped }: Kept) => {
   const parts = [
      people > 0 ? `${people} people` : null,
      companies > 0 ? `${companies} companies` : null,
      posts > 0 ? `${posts} posts` : null,
      jobs > 0 ? `${jobs} jobs` : null,
   ].filter(Boolean)

   return [
      parts.length > 0 ? `Kept ${parts.join(', ')} in your lists.` : null,
      skipped > 0 ? `${skipped} left out because you removed them or they are on Do not contact.` : null,
   ]
      .filter(Boolean)
      .join(' ')
}

const addNote = (result: StepResult, ...notes: (string | null | undefined)[]): StepResult => ({
   ...result,
   message: [result.message, ...notes].filter(Boolean).join(' ') || undefined,
})

// A block that finds people, companies, posts or jobs keeps them in the owner's lists under the workflow's name when its
// box is ticked (.plan/workflow-collect-blocks.md). It runs when the step has everything, so a step still waiting for
// its requests keeps nothing yet.
const withKeep =
   (run: Executor): Executor =>
   async ctx => {
      const result = await run(ctx)

      if (!keeps(ctx)) {
         return result
      }

      const kept = await CollectKeepService.keep(
         ctx.run.userId,
         ctx.run.workflow.campaign?.label ?? keepLabelOf(ctx.run.workflow.name),
         await WorkflowRunService.items(ctx.run.id, [ctx.at])
      )

      return addNote(result, keptNote(kept))
   }

const LINK_NOUNS = {
   profile: 'LinkedIn profile',
   company: 'LinkedIn company',
   post: 'LinkedIn post',
} as const

// The links pasted in the block, read as one kind. One that is not that kind is dropped and counted.
const pastedLinks = (ctx: Context, kind: keyof typeof LINK_NOUNS) => {
   const urls = wordsIn(configOf(ctx.node), 'links')
   const links = [...new Map(linksOf(urls, kind).map(link => [link.slug, link])).values()]

   return {
      links,
      note:
         links.length < urls.length
            ? `${urls.length - links.length} links were not ${LINK_NOUNS[kind]} links and were skipped.`
            : null,
   }
}

// People from pasted links. They are "known": a workflow that asks for them by name is not stopped by lists. Anyone on
// Do not contact is left out before anything is paid.
const pastedPeople = async (ctx: Context) => {
   const { links, note } = pastedLinks(ctx, 'profile')
   const blocked = await CollectKeepService.blocked(
      ctx.run.userId,
      links.map(({ slug }) => slug)
   )

   return {
      people: links
         .filter(({ slug }) => !blocked.has(slug))
         .map(link =>
            person({
               ...link,
               known: true,
            })
         ),
      notes: [note, blocked.size > 0 ? `${blocked.size} people are on Do not contact and were skipped.` : null],
   }
}

const pastedPosts = async (ctx: Context) => {
   const { links, note } = pastedLinks(ctx, 'post')
   const posts: PostItem[] = await Promise.all(
      links.map(async link => ({
         kind: 'post' as const,
         slug: link.slug,
         url: await sendableUrl({
            id: null,
            url: link.url,
            expandedUrl: null,
         }),
         postId: null,
      }))
   )

   return {
      posts,
      note,
   }
}

const pastedCompanies = (ctx: Context) => {
   const { links, note } = pastedLinks(ctx, 'company')
   const companies: CompanyItem[] = links.map(link => ({
      kind: 'company',
      ...link,
      name: null,
      hiring: [],
   }))

   return {
      companies,
      note,
   }
}

const COMPANY_BATCH = 25

// The company of each person's current job: read when it has not been in the last 30 days (a paid read, shown in the estimate), then
// put on the person (industry, size band, website domain) and the person is scored again, so the ideal customer's industry and company
// size count. Only people who still qualify are looked at, so nobody is paid for twice. A preview reads nothing and only uses what
// was read before.
const withCompanies = async (
   ctx: Context,
   people: PersonItem[],
   rules: Awaited<ReturnType<typeof rulesOf>> | null,
   thresholds: ReturnType<typeof thresholdsOf>
) => {
   const { run, at } = ctx
   const candidates = rules ? people.filter(({ band }) => band !== null) : people
   const snapshots = await PersonSnapshotService.recent(
      run.userId,
      candidates.map(({ slug }) => slug)
   )
   const companyOf = (item: PersonItem) => {
      const snapshot = snapshots.get(item.slug)

      return snapshot ? (profileFacts(snapshot).companySlug?.toLowerCase() ?? null) : null
   }
   const slugs = [...new Set(candidates.flatMap(item => companyOf(item) ?? []))]
   const remembered = await CollectKeepService.rememberedCompanies(run.userId, slugs)
   const toRead = ctx.preview ? [] : slugs.filter(slug => !remembered.has(slug))
   const batches = Array.from({ length: Math.ceil(toRead.length / COMPANY_BATCH) }, (_, index) =>
      toRead.slice(index * COMPANY_BATCH, (index + 1) * COMPANY_BATCH)
   )
   const collected = await collectEach(
      ctx,
      batches.map((batch, index) => ({
         inputKey: `person-companies-${index}`,
         slug: 'companies',
         params: companiesLinksParams(
            batch.map(slug => `https://www.linkedin.com/company/${encodeURIComponent(slug)}`)
         ),
         use: async (rows: Row[]) => {
            for (const company of companiesFrom(rows)) {
               if (company.preview) {
                  await CollectKeepService.keepCompanyPage(run.userId, company.slug, company.preview)
               }
            }
         },
      }))
   )
   const pages = await CollectKeepService.rememberedCompanies(run.userId, slugs)
   const updated = candidates.map(item => {
      const page = pages.get(companyOf(item) ?? '')

      return page
         ? {
              ...item,
              companyIndustry: page.industry,
              companySize: page.employeeRange,
              companyDomain: domainOfWebsite(page.website),
           }
         : item
   })
   const scored = rules ? rescorePeople(updated, rules, thresholds) : updated

   await WorkflowRunService.putItems(at, scored)

   return {
      collected,
      read: pages.size,
      kept: scored,
      leftOut: people.filter(({ slug }) => !candidates.some(item => item.slug === slug)),
   }
}

// Company pages: one read in the last 30 days is used again (unless the block reads again), the rest are read in batches.
const readCompanyPages = async (ctx: Context, companies: CompanyItem[]) => {
   const remembered =
      keeps(ctx) && !rereads(ctx)
         ? await CollectKeepService.rememberedCompanies(
              ctx.run.userId,
              companies.map(({ slug }) => slug)
           )
         : new Map()
   const toRead = companies.filter(({ slug }) => !remembered.has(slug))
   const batches = Array.from({ length: Math.ceil(toRead.length / COMPANY_BATCH) }, (_, index) =>
      toRead.slice(index * COMPANY_BATCH, (index + 1) * COMPANY_BATCH)
   )

   await WorkflowRunService.seedItems(
      ctx.at,
      companies.flatMap(company => {
         const preview = remembered.get(company.slug)

         return preview
            ? [
                 {
                    ...company,
                    name: preview.name ?? null,
                    preview,
                 },
              ]
            : []
      })
   )

   const result = await collectEach(
      ctx,
      batches.map((batch, index) => ({
         inputKey: `companies-${index}`,
         slug: 'companies',
         params: companiesLinksParams(batch.map(({ url }) => url)),
         use: async rows => {
            await WorkflowRunService.seedItems(ctx.at, companiesFrom(rows))
         },
      }))
   )

   return addNote(
      result,
      remembered.size > 0 ? `${remembered.size} read in the last ${COMPANY_REMEMBER_DAYS} days, not paid again.` : null
   )
}

const companiesFromLinks = async (ctx: Context): Promise<StepResult> => {
   const { companies, note } = pastedCompanies(ctx)

   return addNote(await readCompanyPages(ctx, companies), note)
}

const searchCompanies = (ctx: Context) => {
   const config = configOf(ctx.node)

   return collectEach(ctx, [
      remembering(ctx, {
         inputKey: 'search',
         slug: 'companies',
         params: searchCompaniesParams({
            query: textIn(config, 'query'),
            locations: wordsIn(config, 'locations'),
            companySize: wordsIn(config, 'companySize'),
            industries: wordsIn(config, 'industries'),
            howMany: numberIn(config, 'howMany'),
         }),
         map: companiesFrom,
         save: seed(ctx),
      }),
   ])
}

const searchJobs = (ctx: Context) => {
   const config = configOf(ctx.node)

   return collectEach(ctx, [
      remembering(ctx, {
         inputKey: 'search',
         slug: 'jobs',
         params: jobPostingsParams({
            jobTitles: textIn(config, 'jobTitles'),
            howMany: numberIn(config, 'howMany'),
            locations: textIn(config, 'locations'),
            companies: wordsIn(config, 'companies'),
            workplaceType: wordsIn(config, 'workplaceType'),
            employmentType: wordsIn(config, 'employmentType'),
            experienceLevel: wordsIn(config, 'experienceLevel'),
            salary: wordsIn(config, 'salary'),
            postedWithin: textIn(config, 'postedWithin'),
            sortBy: textIn(config, 'sortBy'),
            industries: wordsIn(config, 'industries'),
            easyApply: config.easyApply === true,
            fewApplicants: config.fewApplicants === true,
         }),
         map: jobPostingsFrom,
         save: seed(ctx),
      }),
   ])
}

// The links a block takes that may be a profile, a company or a post: each is read as the first kind it fits.
const POSTS_LINK_KINDS = ['post', 'profile', 'company'] as const

const postsFromLinks = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const urls = wordsIn(config, 'links')
   const links = [
      ...new Map(
         urls.flatMap(url =>
            POSTS_LINK_KINDS.flatMap(kind => {
               const link = parseLinkedInUrl(url, kind)

               return link ? [[`${kind}:${link.slug}`, link] as const] : []
            }).slice(0, 1)
         )
      ).entries(),
   ]
   const settings = {
      howMany: numberIn(config, 'howMany'),
      postedWithin: textIn(config, 'postedWithin'),
      includeReposts: config.includeReposts === true,
      includeQuotePosts: config.includeQuotePosts === true,
   }
   const requests = await Promise.all(
      links.map(async ([inputKey, link]) =>
         remembering(ctx, {
            inputKey,
            slug: 'posts',
            params: postsOfParams(
               await sendableUrl({
                  id: null,
                  url: link.url,
                  expandedUrl: null,
               }),
               settings
            ),
            map: postsFrom,
            save: seed(ctx),
         })
      )
   )
   const result = await collectEach(ctx, requests)

   return addNote(
      result,
      links.length < urls.length
         ? `${urls.length - links.length} links were not LinkedIn profile, company or post links and were skipped.`
         : null
   )
}

const EMAIL_BATCH = 25

// Work emails of the people that reach the block and of the people whose links are pasted. An email found in the last 90 days (or
// that the person already carries) is used again; only a person an email was found for is passed on.
const emailsFromLinks = async (ctx: Context): Promise<StepResult> => {
   const pasted = await pastedPeople(ctx)
   const reachingAll = mergeBySlug(peopleOf(ctx.inputs))
   const blocked = await CollectKeepService.blocked(
      ctx.run.userId,
      reachingAll.map(({ slug }) => slug)
   )
   const people = mergeBySlug([...reachingAll.filter(({ slug }) => !blocked.has(slug)), ...pasted.people])
   const notes = [
      ...pasted.notes,
      blocked.size > 0 ? `${blocked.size} people are on Do not contact and were skipped.` : null,
   ]
   const known = keeps(ctx)
      ? await CollectKeepService.knownEmails(
           ctx.run.userId,
           people.map(({ slug }) => slug)
        )
      : new Map<string, string>()
   const carried = new Map(people.flatMap(({ slug, email }) => (email ? [[slug, email] as const] : [])))
   const toAsk = people.filter(({ slug }) => !known.has(slug) && !carried.has(slug))
   const batches = Array.from({ length: Math.ceil(toAsk.length / EMAIL_BATCH) }, (_, index) =>
      toAsk.slice(index * EMAIL_BATCH, (index + 1) * EMAIL_BATCH)
   )

   await WorkflowRunService.seedItems(
      ctx.at,
      people.flatMap(item => {
         const email = known.get(item.slug) ?? carried.get(item.slug)

         return email
            ? [
                 {
                    ...item,
                    email,
                 },
              ]
            : []
      })
   )

   const result = await collectEach(
      ctx,
      batches.map((batch, index) => ({
         inputKey: `batch-${index}`,
         slug: 'emails',
         params: emailsParams(batch),
         use: async rows => {
            const found = emailsFrom(rows)

            await WorkflowRunService.seedItems(
               ctx.at,
               batch.flatMap(item => {
                  const email = found.get(item.slug)

                  return email
                     ? [
                          {
                             ...item,
                             email,
                          },
                       ]
                     : []
               })
            )
         },
      }))
   )
   const missing = people.length - result.itemsOut

   return addNote(
      result,
      ...notes,
      known.size > 0 ? `${known.size} emails found in the last ${EMAIL_REMEMBER_DAYS} days, not paid for again.` : null,
      carried.size > 0 ? `${carried.size} people already had an email.` : null,
      missing > 0 ? `No email was found for ${missing} of ${people.length} people.` : null
   )
}

// A link of any LinkedIn page, such as an Ad Library search.
const linkedInPages = (urls: string[]) =>
   urls.filter(url => {
      try {
         const { protocol, hostname } = new URL(url)

         return protocol === 'https:' && (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com'))
      } catch {
         return false
      }
   })

const adsFromLinks = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const urls = wordsIn(config, 'links')
   const links = [...new Set(linkedInPages(urls))]
   const result = await collectEach(
      ctx,
      links.map(url => ({
         inputKey: `link:${url}`,
         slug: 'ads-library',
         params: adsParams(url, numberIn(config, 'howMany')),
         use: async rows => {
            await WorkflowRunService.seedItems(ctx.at, adsFrom(rows))
         },
      }))
   )

   return addNote(
      result,
      links.length < urls.length
         ? `${urls.length - links.length} links were not LinkedIn links and were skipped.`
         : null
   )
}

// Blocks that take what they work on from pasted links run their usual work on those items.
const fromPastedPeople =
   (run: Executor): Executor =>
   async ctx => {
      const { people, notes } = await pastedPeople(ctx)

      return addNote(
         await run({
            ...ctx,
            inputs: people,
         }),
         ...notes
      )
   }

const fromPastedPosts =
   (run: Executor): Executor =>
   async ctx => {
      const { posts, note } = await pastedPosts(ctx)

      return addNote(
         await run({
            ...ctx,
            inputs: posts,
         }),
         note
      )
   }

const fromPastedCompanies =
   (run: Executor): Executor =>
   async ctx => {
      const { companies, note } = pastedCompanies(ctx)

      return addNote(
         await run({
            ...ctx,
            inputs: companies,
         }),
         note
      )
   }

// Pasted links of either kind: a profile link is a person, a company link a company, anything else is dropped.
const pastedPeopleAndCompanies = (urls: string[]) => {
   const people: PersonItem[] = []
   const companies: CompanyItem[] = []

   for (const url of urls) {
      const profileLink = parseLinkedInUrl(url, 'profile')
      const companyLink = profileLink ? null : parseLinkedInUrl(url, 'company')

      if (profileLink) {
         people.push(
            person({
               ...profileLink,
               known: true,
            })
         )
      } else if (companyLink) {
         companies.push({
            kind: 'company',
            ...companyLink,
            name: null,
            hiring: [],
         })
      }
   }

   return {
      people,
      companies,
      dropped: urls.length - people.length - companies.length,
   }
}

// Chooses the new people this read pays for. The first pass records the people it cut under the block's Else key; a later
// pass (after Waiting) reads that record back, so the cut is decided once.
const limitedPeople = async (ctx: Context, people: PersonItem[], limit: number) => {
   const recorded = peopleOf(await WorkflowRunService.items(ctx.run.id, [elseKey(ctx, ctx.node.id)]))

   if (recorded.length > 0) {
      return {
         passed: withoutSlugs(
            people,
            recorded.map(({ slug }) => slug)
         ),
         stored: undefined,
         cut: recorded,
      }
   }

   const stored = await PersonSnapshotService.recent(
      ctx.run.userId,
      people.filter(({ enriched }) => !enriched).map(({ slug }) => slug)
   )
   const cut = cutOf(people, new Set(stored.keys()), limit)

   await WorkflowRunService.replaceItems(
      elseKey(ctx, ctx.node.id),
      aside(cut, 'readLimit', 'Over the read limit of this run.')
   )

   return {
      passed: withoutSlugs(
         people,
         cut.map(({ slug }) => slug)
      ),
      stored,
      cut,
   }
}

// Reads the full details of the people and companies that reach it and of the links pasted in it. Posts become their
// authors; companies it does not read, and anything else, pass through. The output is written once, when both reads
// are done, because the engine runs a step again until its requests have finished.
const readFull = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const pasted = pastedPeopleAndCompanies(wordsIn(config, 'links'))
   const blocked = await CollectKeepService.blocked(
      ctx.run.userId,
      pasted.people.map(({ slug }) => slug)
   )
   const authors = postsOf(ctx.inputs).flatMap(({ author }) => {
      const link = author ? parseLinkedInUrl(author, 'profile') : null

      return link ? [person(link)] : []
   })
   const people = mergeBySlug([
      ...peopleOf(ctx.inputs),
      ...authors,
      ...pasted.people.filter(({ slug }) => !blocked.has(slug)),
   ])
   const readsCompanies = config.readCompanies !== false
   const companies = [
      ...new Map(
         [...(readsCompanies ? companiesOf(ctx.inputs) : []), ...pasted.companies].map(company => [
            company.slug,
            company,
         ])
      ).values(),
   ]
   const passThrough = ctx.inputs.filter(
      item => item.kind !== 'profile' && item.kind !== 'post' && (item.kind !== 'company' || !readsCompanies)
   )
   const settled = async <T>(work: () => Promise<T>) => {
      try {
         return await work()
      } catch (error) {
         if (error instanceof Waiting) {
            return error
         }

         throw error
      }
   }

   const limit = numberIn(config, 'readLimit')
   const limited = limit > 0 ? await limitedPeople(ctx, people, limit) : null

   // Both reads are started before the step waits for either.
   const read = await settled(() => readPeople(ctx, limited?.passed ?? people, limited?.stored))

   // A company that already has its page, from a search, is not read again.
   await WorkflowRunService.seedItems(
      ctx.at,
      companies.filter(({ preview }) => preview)
   )

   const pages = await settled(() =>
      readCompanyPages(
         ctx,
         companies.filter(({ preview }) => !preview)
      )
   )

   if (read instanceof Waiting || pages instanceof Waiting) {
      throw new Waiting()
   }
   const kept = [...read.kept, ...companiesOf(await WorkflowRunService.items(ctx.run.id, [ctx.at])), ...passThrough]
   const result = await keepItems(ctx, kept, people.length + companies.length)

   return addNote(
      {
         ...result,
         status: read.collected.status === 'PARTIAL' || pages.status === 'PARTIAL' ? 'PARTIAL' : 'DONE',
         message: [read.collected.message, pages.message].filter(Boolean).join(' ') || undefined,
      },
      read.note,
      pasted.dropped > 0
         ? `${pasted.dropped} links were not LinkedIn profile or company links and were skipped.`
         : null,
      blocked.size > 0 ? `${blocked.size} people are on Do not contact and were skipped.` : null,
      limited && limited.cut.length > 0
         ? `${limited.cut.length} people were over the read limit of ${limit} and went to Else.`
         : null
   )
}

const engagedBy = (slug: 'profile-comments' | 'profile-reactions') => (ctx: Context) => {
   const config = configOf(ctx.node)
   const settings = {
      howMany: numberIn(config, 'howMany'),
      postedWithin: textIn(config, 'postedWithin'),
   }

   return collectEach(
      ctx,
      peopleOf(ctx.inputs).map(item =>
         remembering(ctx, {
            inputKey: item.slug,
            slug,
            params: engagedParams(item, settings),
            map: postsFrom,
            save: seed(ctx),
         })
      )
   )
}

export const EXECUTORS: Record<GraphNode['type'], Executor> = {
   'trigger.manual': async () => DONE,
   'trigger.schedule': async () => DONE,
   'trigger.api': async () => DONE,
   'trigger.workflow': afterWorkflow,
   'trigger.taskEvent': eventTrigger,
   'trigger.messageArrived': eventTrigger,
   'trigger.hook': hookTrigger,
   'trigger.approved': approvedTrigger,
   'input.posts': inputPosts,
   'input.profiles': inputProfiles,
   'input.companies': inputCompanies,
   'collect.commenters': ctx => engagement(ctx, 'commenters'),
   'collect.reactors': ctx => engagement(ctx, 'reactors'),
   'collect.findPosts': withKeep(findPosts),
   'collect.postsOfPeople': ctx => postsOfEach(ctx, peopleOf(ctx.inputs), true),
   'collect.postsOfCompanies': ctx => postsOfEach(ctx, companiesOf(ctx.inputs), false),
   'collect.engagedPosts': engagedPosts,
   'collect.employees': withKeep(employees),
   'collect.jobs': jobs,
   'collect.domainLookup': withKeep(domainLookup),
   'collect.searchPeople': withKeep(searchPeople),
   'collect.profile': withKeep(readFull),
   'collect.profilesFromLinks': withKeep(fromPastedPeople(enrich)),
   'collect.searchCompanies': withKeep(searchCompanies),
   'collect.companiesFromLinks': withKeep(companiesFromLinks),
   'collect.postsFromLinks': withKeep(postsFromLinks),
   'collect.employeesFromLinks': withKeep(fromPastedCompanies(employees)),
   'collect.searchJobs': withKeep(searchJobs),
   'collect.emailsFromLinks': withKeep(emailsFromLinks),
   'collect.commentersFromLinks': withKeep(fromPastedPosts(ctx => engagement(ctx, 'commenters'))),
   'collect.reactorsFromLinks': withKeep(fromPastedPosts(ctx => engagement(ctx, 'reactors'))),
   'collect.profileCommentsFromLinks': withKeep(fromPastedPeople(engagedBy('profile-comments'))),
   'collect.profileReactionsFromLinks': withKeep(fromPastedPeople(engagedBy('profile-reactions'))),
   'collect.adsFromLinks': adsFromLinks,
   'process.dedupe': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const posts = postsOf(ctx.inputs)
      const config = configOf(ctx.node)
      const skip = {
         lists: config.skipListed !== false,
         profiles: config.skipProfiles !== false,
      }
      const status =
         config.skipDone === false
            ? new Map<string, string>()
            : await LinkedInPostService.statusBySlug(
                 ctx.run.userId,
                 posts.map(({ slug }) => slug)
              )
      const done = posts.filter(({ slug }) => status.get(slug) === 'PROCESSED')
      // A post that is not in the owner's posts was not kept by Find posts, so it cannot be recognised.
      const unknown = config.skipDone === false ? 0 : posts.filter(({ slug }) => !status.has(slug)).length
      const other = ctx.inputs.filter(({ kind }) => kind !== 'profile' && kind !== 'post')

      // What was left out as processed is kept for an Else block after this one, with the reason.
      await WorkflowRunService.replaceItems(
         elseKey(ctx, ctx.node.id),
         done.map(post => ({
            ...post,
            result: {
               action: 'dedupe',
               status: 'SKIPPED',
               account: null,
               at: null,
               reason: 'Already processed.',
            },
         }))
      )

      const label = textIn(config, 'skipCompanyLabel')
      const customers = label === '' ? new Set<string>() : await ColleaguesService.labelled(ctx.run.userId, label)
      const fresh = (await notSeen(ctx.run.userId, people, skip)).filter(
         ({ company }) => !customers.has(company?.trim().toLowerCase() ?? '')
      )
      const result = await keepItems(
         ctx,
         [...fresh, ...posts.filter(post => !done.includes(post)), ...other],
         ctx.inputs.length
      )

      return {
         ...result,
         ...(done.length + unknown > 0 && {
            message: [
               done.length > 0 ? `${done.length} posts already processed went to Else.` : undefined,
               unknown > 0 ? 'Turn on Keep in Find posts to remember posts.' : undefined,
            ]
               .filter(Boolean)
               .join(' '),
         }),
      }
   },
   'process.filter': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const config = configOf(ctx.node)
      const kept = filterPeople(people, {
         minFollowers: numberIn(config, 'minFollowers'),
         signal: config.signal === 'commented' ? 'commented' : 'any',
         headlineWords: wordsIn(config, 'headlineWords'),
      })

      return keepItems(ctx, kept, people.length)
   },
   'process.topN': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const config = configOf(ctx.node)
      const valueOf = (item: PersonItem) => (config.by === 'followers' ? item.followers : item.score) ?? -1
      const best = [...people].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, numberIn(config, 'count'))

      return keepItems(ctx, best, people.length)
   },
   'process.merge': merge,
   'process.room': fitToRoom,
   'process.bestPer': bestPerCompany,
   'process.classify': classifyItems,
   'process.pattern': findThePattern,
   'collect.changes': detectChanges,
   'process.messageMood': messageMood,
   'process.write': writeWordsOnPosts,
   'process.tag': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const config = configOf(ctx.node)
      const tags = wordsIn(config, 'tags')
      const prefix = textIn(config, 'replacePrefix')
      const tagged = people.map(item => ({
         ...item,
         tags: [
            ...new Set([...(prefix === '' ? item.tags : item.tags.filter(tag => !tag.startsWith(prefix))), ...tags]),
         ],
      }))
      const result = await keepItems(ctx, tagged, people.length)

      if (!labelsCampaign(ctx)) {
         return result
      }

      const { dropped, withoutRow } = await PeopleLabelService.label(ctx.run.userId, tagged.map(labelOf), EXISTING_ROWS)

      return addNote(
         result,
         withoutRow > 0 ? `${withoutRow} people have no row yet; they are labelled when they are listed.` : null,
         overflowOf(dropped)
      )
   },
   'score.icp': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const rules = await rulesOf(ctx.run.userId, ctx.node)
      const { kept } = scorePeople(people, rules, thresholdsOf(ctx.run, ctx.node))

      return keepItems(ctx, kept, people.length)
   },
   'score.signals': scoreSignals,
   'score.company': scoreCompanies,
   'logic.if': ifBlock,
   'logic.ifEvent': ifEvent,
   'logic.ifPerson': ifPerson,
   'logic.split': splitPeople,
   'logic.approve': askMeFirst,
   'collect.chat': getChat,
   'logic.else': elseBlock,
   'logic.forEach': forEach,
   'logic.runWorkflow': runWorkflow,
   'logic.wait': wait,
   'logic.personWait': personWait,
   'logic.spaceOut': spaceOut,
   'logic.taskResult': taskResult,
   'logic.retry': retry,
   'logic.stop': stop,
   'account.select': selectAccounts,
   'account.visitProfile': visitProfile,
   'account.visitCompany': visitCompany,
   'account.writePost': writePost,
   'account.getConnections': getConnections,
   'account.getRequests': getRequests,
   'account.getConversations': getConversations,
   'account.getNotifications': getNotifications,
   'account.getViewers': getViewers,
   'account.getFeed': getFeed,
   'account.getMutual': getMutual,
   'account.answerRequests': answerRequests,
   'account.sendInvite': sendInvites,
   'account.withdrawInvite': withdrawInvites,
   'account.sendMessage': sendMessages,
   'account.replyToConversation': replyToConversations,
   'account.removeConnection': removeConnections,
   'account.reactToPost': reactToPosts,
   'account.commentOnPost': commentOnPosts,
   'output.list': addToList,
   'output.markPosts': markPosts,
   'output.csv': exportCsv,
   'output.sendApi': sendApi,
   'output.return': giveBack,
   'output.doNotContact': stopContacting,
}
