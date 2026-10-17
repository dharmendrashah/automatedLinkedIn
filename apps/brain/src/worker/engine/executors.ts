import { z } from 'zod'

import {
   type CompanyItem,
   type PersonItem,
   type PostItem,
   type WorkflowItemData,
   expandShortPostLink,
   isShortPostLink,
   mergeBySlug,
   parseLinkedInUrl,
   person,
   readItem,
} from 'core'

import {
   LinkedInCompanyService,
   LinkedInPostService,
   LinkedInProfileService,
   type SeenSkip,
   WorkflowListService,
   WorkflowRunService,
} from 'database'

import { ALL_CAP, type GraphNode } from '@automatedLinkedIn/contracts'

import {
   ENRICH_BATCH,
   commentersFrom,
   commentersParams,
   companiesFromDomains,
   domainParams,
   employeesFrom,
   employeesParams,
   engagedParams,
   findPostsParams,
   hiringFrom,
   jobsParams,
   postsFrom,
   postsOfParams,
   profilesFrom,
   profilesParams,
   reactorsFrom,
   reactorsParams,
   searchPeopleParams,
   searchedPeopleFrom,
} from '../data/operations'
import {
   type Context,
   DAY_MS,
   ELSE_SUFFIX,
   type StepResult,
   WALLET_LOW,
   collectEach,
   companiesOf,
   configOf,
   keepItems,
   numberIn,
   paidCall,
   parentsOf,
   peopleOf,
   postsOf,
   rulesOf,
   scoringNodeBefore,
   textIn,
   thresholdsOf,
   wordsIn,
} from './context'
import { sendPages } from './sendApi'
import { applyProfiles, conditionsOf, filterPeople, matches, scorePeople } from './steps'

const DONE: StepResult = {
   status: 'DONE',
   itemsIn: 0,
   itemsOut: 0,
}

const JOB_BATCH = 10

// What an API call sent, or what a finished workflow passed on.
const inputSchema = z.object({
   posts: z.array(z.string()).optional(),
   profiles: z.array(z.string()).optional(),
   companies: z.array(z.string()).optional(),
   people: z.array(z.unknown()).optional(),
})

const runInput = (ctx: Context) => inputSchema.safeParse(ctx.run.input).data ?? {}

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

const inputPosts = async (ctx: Context): Promise<StepResult> => {
   const sent = runInput(ctx).posts
   const posts = sent
      ? linksOf(sent, 'post').map(link => ({
           ...link,
           id: null,
           expandedUrl: null,
        }))
      : await LinkedInPostService.waiting(ctx.run.userId, numberIn(configOf(ctx.node), 'howMany'))
   const items: PostItem[] = await Promise.all(
      posts.map(async post => ({
         kind: 'post' as const,
         slug: post.slug,
         url: await sendableUrl(post),
         postId: post.id,
      }))
   )
   const result = await keepItems(ctx, items, 0)

   return {
      ...result,
      message: items.length === 0 ? 'No posts were waiting in your posts list.' : undefined,
   }
}

// People from /profiles, from the links set on the block, or from an API call. They are "known": being in
// /profiles does not stop them later.
const inputProfiles = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const links = runInput(ctx).profiles ?? wordsIn(config, 'links')
   const people =
      links.length > 0
         ? linksOf(links, 'profile').map(link =>
              person({
                 ...link,
                 known: true,
              })
           )
         : (await LinkedInProfileService.recent(ctx.run.userId, numberIn(config, 'howMany'))).map(profile =>
              person({
                 slug: profile.slug,
                 url: profile.url,
                 name: profile.fullName,
                 headline: profile.headline,
                 location: profile.location,
                 known: true,
              })
           )

   return keepItems(ctx, mergeBySlug(people), 0)
}

const inputCompanies = async (ctx: Context): Promise<StepResult> => {
   const sent = runInput(ctx).companies
   const companies: CompanyItem[] = sent
      ? linksOf(sent, 'company').map(link => ({
           kind: 'company',
           ...link,
           name: null,
           hiring: [],
        }))
      : (await LinkedInCompanyService.recent(ctx.run.userId, numberIn(configOf(ctx.node), 'howMany'))).map(company => ({
           kind: 'company',
           slug: company.slug,
           url: company.url,
           name: company.name,
           hiring: [],
        }))

   return keepItems(ctx, companies, 0)
}

// The people the workflow this one listens to kept. They are known: being in its list does not stop them here.
const afterWorkflow = async (ctx: Context): Promise<StepResult> => {
   const people = (runInput(ctx).people ?? []).flatMap(data => {
      const item = readItem(data)

      return item?.kind === 'profile'
         ? [
              {
                 ...item,
                 known: true,
                 score: null,
                 band: null,
                 matched: [],
              },
           ]
         : []
   })

   return keepItems(ctx, people, 0)
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

const savePosts = (ctx: Context) => async (rows: Record<string, unknown>[]) => {
   await WorkflowRunService.seedItems(ctx.at, postsFrom(rows))
}

const findPosts = (ctx: Context) => {
   const config = configOf(ctx.node)

   return collectEach(ctx, [
      {
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
         use: savePosts(ctx),
      },
   ])
}

const postsOfEach = (ctx: Context, sources: { slug: string; url: string }[]) => {
   const config = configOf(ctx.node)
   const settings = {
      howMany: numberIn(config, 'howMany'),
      postedWithin: textIn(config, 'postedWithin'),
      includeReposts: config.includeReposts === true,
   }

   return collectEach(
      ctx,
      sources.map(source => ({
         inputKey: source.slug,
         slug: 'posts',
         params: postsOfParams(source.url, settings),
         use: savePosts(ctx),
      }))
   )
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
      companiesOf(ctx.inputs).map(company => ({
         inputKey: company.slug,
         slug: 'company-employees',
         params: employeesParams(company, settings),
         use: async rows => {
            await WorkflowRunService.mergePeople(ctx.at, employeesFrom(rows, company))
         },
      }))
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
      {
         inputKey: 'lookup',
         slug: 'domain-lookup',
         params: domainParams(wordsIn(config, 'domains'), numberIn(config, 'howMany')),
         use: async rows => {
            await WorkflowRunService.seedItems(ctx.at, companiesFromDomains(rows))
         },
      },
   ])
}

const searchPeople = (ctx: Context) => {
   const config = configOf(ctx.node)

   return collectEach(ctx, [
      {
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
         }),
         use: async rows => {
            await WorkflowRunService.mergePeople(ctx.at, searchedPeopleFrom(rows).slice(0, numberIn(config, 'howMany')))
         },
      },
   ])
}

// Reads the full profile of everyone it gets who was not read yet. After a Score block they are scored again and
// the ones that no longer fit are dropped; without one they keep no score.
const enrich = async (ctx: Context): Promise<StepResult> => {
   const { run, node, graph, at } = ctx
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const scoring = scoringNodeBefore(graph, node.id)
   const rules = scoring ? await rulesOf(run.userId, scoring) : null
   const thresholds = thresholdsOf(run, scoring)
   const toRead = people.filter(({ enriched }) => !enriched).sort((a, b) => a.slug.localeCompare(b.slug))
   let stopped = false

   await WorkflowRunService.seedItems(at, people)

   for (let start = 0; start < toRead.length && !stopped; start += ENRICH_BATCH) {
      const batch = toRead.slice(start, start + ENRICH_BATCH)
      const outcome = await paidCall({
         ctx,
         inputKey: `batch-${start / ENRICH_BATCH}`,
         slug: 'profiles',
         params: profilesParams(batch),
         use: async rows => {
            await WorkflowRunService.putItems(at, applyProfiles(batch, profilesFrom(rows), rules, thresholds))
         },
      })

      stopped = outcome === 'stop'
   }

   const read = peopleOf(await WorkflowRunService.items(run.id, [at]))
   const kept = rules ? read.filter(({ band }) => band !== null) : read
   const result = await keepItems(ctx, kept, people.length)

   return stopped
      ? {
           ...result,
           status: 'PARTIAL',
           message: WALLET_LOW,
        }
      : result
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
         tags: item.tags,
         known: item.known,
      }))
   )

   return {
      status: 'DONE',
      itemsIn: people.length,
      itemsOut: people.length,
      message: `${added} new in the list.`,
   }
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

   const marked = await LinkedInPostService.markProcessed(ctx.run.userId, ids)

   return {
      status: 'DONE',
      itemsIn: ids.length,
      itemsOut: posts.length,
      message: `${marked} posts marked done.`,
   }
}

const elseKey = (ctx: Context, ifId: string) => ({
   ...ctx.at,
   nodeId: `${ifId}${ELSE_SUFFIX}`,
})

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
   const ifIds = parentsOf(ctx.graph, ctx.node.id).filter(id =>
      ctx.graph.nodes.some(node => node.id === id && node.type === 'logic.if')
   )
   const rest = peopleOf(
      await WorkflowRunService.items(
         ctx.run.id,
         ifIds.map(id => elseKey(ctx, id))
      )
   )

   return keepItems(ctx, mergeBySlug(rest), rest.length)
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
   const parents = parentsOf(ctx.graph, ctx.node.id)
   const lines = await Promise.all(
      parents.map(async nodeId => ({
         nodeId,
         keys: new Set(
            (
               await WorkflowRunService.items(ctx.run.id, [
                  {
                     nodeId,
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

   const sent = await sendPages(
      {
         url: textIn(config, 'url'),
         secret: textIn(config, 'secret'),
         post: ctx.deps.post,
      },
      {
         workflowId: ctx.run.workflowId,
         runId: ctx.run.id,
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

export const EXECUTORS: Record<GraphNode['type'], (ctx: Context) => Promise<StepResult>> = {
   'trigger.manual': async () => DONE,
   'trigger.schedule': async () => DONE,
   'trigger.api': async () => DONE,
   'trigger.workflow': afterWorkflow,
   'input.posts': inputPosts,
   'input.profiles': inputProfiles,
   'input.companies': inputCompanies,
   'collect.commenters': ctx => engagement(ctx, 'commenters'),
   'collect.reactors': ctx => engagement(ctx, 'reactors'),
   'collect.findPosts': findPosts,
   'collect.postsOfPeople': ctx => postsOfEach(ctx, peopleOf(ctx.inputs)),
   'collect.postsOfCompanies': ctx => postsOfEach(ctx, companiesOf(ctx.inputs)),
   'collect.engagedPosts': engagedPosts,
   'collect.employees': employees,
   'collect.jobs': jobs,
   'collect.domainLookup': domainLookup,
   'collect.searchPeople': searchPeople,
   'collect.profile': enrich,
   'process.dedupe': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const config = configOf(ctx.node)
      const skip = {
         lists: config.skipListed !== false,
         profiles: config.skipProfiles !== false,
      }

      return keepItems(ctx, await notSeen(ctx.run.userId, people, skip), people.length)
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
   'process.tag': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const tags = wordsIn(configOf(ctx.node), 'tags')
      const tagged = people.map(item => ({
         ...item,
         tags: [...new Set([...item.tags, ...tags])],
      }))

      return keepItems(ctx, tagged, people.length)
   },
   'score.icp': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const rules = await rulesOf(ctx.run.userId, ctx.node)
      const { kept } = scorePeople(people, rules, thresholdsOf(ctx.run, ctx.node))

      return keepItems(ctx, kept, people.length)
   },
   'logic.if': ifBlock,
   'logic.else': elseBlock,
   'logic.forEach': forEach,
   'output.list': addToList,
   'output.markPosts': markPosts,
   'output.csv': exportCsv,
   'output.sendApi': sendApi,
}
