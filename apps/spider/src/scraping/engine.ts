import {
   type ActionParam,
   type ExtractedRecord,
   type ScrapeTaskCommand,
   type ScraperAction,
   type ScraperActionType,
   type SessionCookie,
} from '../types'

import { ObjectNotFoundError, type ObjectStore, sessionKey } from '../storage/store'
import { type BrowserDriver, type BrowserSession } from './driver'
import { TaskError } from './errors'
import { type HostPolicy } from './policy'
import { type HostRateLimiter } from './rateLimiter'
import { type RobotsGuard } from './robots'
import { parseSessionCookies } from './session'

export type EngineDeps = {
   driver: BrowserDriver
   policy: HostPolicy
   robots: Pick<RobotsGuard, 'check'>
   limiter: Pick<HostRateLimiter, 'wait' | 'requireAtLeast'>
   store: Pick<ObjectStore, 'get'>
   maxRecords: number
}

type RunState = {
   command: ScrapeTaskCommand
   session: BrowserSession
   records: ExtractedRecord[]
   page: URL | undefined
   sessionLoaded: boolean
}

export type RunOutcome = {
   records: ExtractedRecord[]
   // The cookies of allowed hosts when the task ends, for an account's session. Empty without an account.
   cookies: SessionCookie[]
}

type WithClick = ActionParam & { click_element: string }
type WithSelectors = ActionParam & { selectors: NonNullable<ActionParam['selectors']> }

const hasClick = (params: ActionParam): params is WithClick => Boolean(params.click_element)
const hasSelectors = (params: ActionParam): params is WithSelectors => Boolean(params.selectors)

const failure = (step: number, name: string, error: unknown) =>
   error instanceof TaskError
      ? error
      : new TaskError(`Step ${step} (${name}) failed: ${error instanceof Error ? error.message : 'unknown error'}`)

// Runs the typed action list against a browser, refusing anything the policy, robots.txt or the rate limit forbids.
export class ScrapeEngine {
   private readonly handlers: Record<ScraperActionType, (action: ScraperAction, state: RunState) => Promise<void>> = {
      login: (action, state) => this.login(action, state),
      navigate: (action, state) => this.navigate(action, state),
      interaction: (action, state) => this.interact(action, state),
      extract: (action, state) => this.extract(action, state),
   }

   public constructor(private readonly deps: EngineDeps) {}

   public async run(command: ScrapeTaskCommand): Promise<RunOutcome> {
      // Refuse before a browser is opened.
      this.deps.policy.assertAllowedUrl(command.target_url)

      const session = await this.deps.driver.open(command.proxy ? { proxy: command.proxy } : {})
      const state: RunState = {
         command,
         session,
         records: [],
         page: undefined,
         sessionLoaded: false,
      }

      try {
         // An account continues from the session its last task left behind.
         if (command.account_id) {
            await this.loadSession(state, false)
         }

         for (const action of [...command.actions].sort((a, b) => a.step - b.step)) {
            await this.handlers[action.action](action, state)
         }

         return {
            records: state.records,
            cookies: await this.sessionCookies(state),
         }
      } finally {
         await session.close().catch(() => undefined)
      }
   }

   private async sessionCookies({ command, session }: RunState) {
      if (!command.account_id) {
         return []
      }

      return (await session.cookies()).filter(({ domain }) => this.deps.policy.allowsCookieDomain(domain))
   }

   private async login(action: ScraperAction, state: RunState) {
      if (!action.params.use_session_cookies) {
         throw new TaskError(
            'login needs session cookies (use_session_cookies: true); spider does not type credentials'
         )
      }

      await this.loadSession(state)
   }

   private async navigate(action: ScraperAction, state: RunState) {
      const { params, step } = action

      if (params.use_session_cookies) {
         await this.loadSession(state)
      }

      const url = this.deps.policy.assertAllowedUrl(params.url ?? state.command.target_url)

      await this.allowByRobots(url)
      await this.deps.limiter.wait(url.hostname)

      const landed = await this.inBrowser(step, 'navigate', () =>
         state.session.goto(url.href, params.wait_for_selector)
      )

      state.page = await this.arrivedAt(landed, url)
   }

   private async interact(action: ScraperAction, state: RunState) {
      const { params, step } = action
      const page = this.requirePage(state, step)

      if (!hasClick(params)) {
         throw new TaskError(`Step ${step} needs click_element`)
      }

      await this.deps.limiter.wait(page.hostname)

      const landed = await this.inBrowser(step, 'interaction', () =>
         state.session.click(params.click_element, params.wait_for_selector)
      )

      state.page = await this.arrivedAt(landed, page)
   }

   private async extract(action: ScraperAction, state: RunState) {
      const { params, step } = action

      this.requirePage(state, step)

      if (!hasSelectors(params)) {
         throw new TaskError(`Step ${step} needs selectors`)
      }

      const remaining = this.deps.maxRecords - state.records.length

      if (remaining <= 0) {
         return
      }

      const found = await this.inBrowser(step, 'extract', () => state.session.extract(params.selectors, remaining))

      state.records.push(...found.slice(0, remaining))
   }

   private requirePage(state: RunState, step: number) {
      if (!state.page) {
         throw new TaskError(`Step ${step} needs a page first: add a navigate step before it`)
      }

      return state.page
   }

   // The browser may end up somewhere else (redirect, click). That place must be allowed too.
   private async arrivedAt(landed: string, from: URL) {
      const page = this.deps.policy.assertAllowedUrl(landed)

      if (page.href !== from.href) {
         await this.allowByRobots(page)
      }

      return page
   }

   private async allowByRobots(url: URL) {
      // An operator decision for this host (SPIDER_ROBOTS_EXEMPT_HOSTS). The rate limit still applies.
      if (this.deps.policy.exemptsRobots(url.hostname)) {
         return
      }

      const { allowed, crawlDelayMs } = await this.deps.robots.check(url)

      if (!allowed) {
         throw new TaskError(`robots.txt for ${url.hostname} does not allow ${url.pathname}`)
      }

      if (crawlDelayMs) {
         this.deps.limiter.requireAtLeast(url.hostname, crawlDelayMs)
      }
   }

   // The previous session of the account comes first, then the key a client may seed a new account with.
   private async loadSession(state: RunState, required = true) {
      if (state.sessionLoaded) {
         return
      }

      const { account_id: account, auth_session_key: seed } = state.command
      const keys = [account && sessionKey(account), seed].filter((key): key is string => Boolean(key))

      let text: string | undefined

      for (const key of keys) {
         try {
            text = await this.deps.store.get(key)

            break
         } catch (error) {
            if (!(error instanceof ObjectNotFoundError)) {
               throw error
            }
         }
      }

      if (text === undefined) {
         if (required) {
            throw new TaskError('The stored session was not found')
         }

         return
      }

      const cookies = parseSessionCookies(text).filter(({ domain }) => this.deps.policy.allowsCookieDomain(domain))

      if (cookies.length === 0) {
         throw new TaskError('The stored session has no cookies for an allowed host')
      }

      await state.session.addCookies(cookies)

      state.sessionLoaded = true
   }

   private async inBrowser<T>(step: number, name: string, work: () => Promise<T>) {
      try {
         return await work()
      } catch (error) {
         throw failure(step, name, error)
      }
   }
}
