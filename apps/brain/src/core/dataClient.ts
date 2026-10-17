// HTTP client of the shared data service. Only the brain worker uses it; nothing it returns reaches the browser as is.

const API = 'https://api.mindcase.co'
const POLL_MS = 3_000
// How long a job may run before it is cancelled and counted as failed.
export const RESULT_TIMEOUT_MS = 10 * 60 * 1000
const RATE_WAIT_MS = 60_000
const RETRIES = 2

export type DataFailure = 'CONFIG' | 'BALANCE' | 'BAD_REQUEST' | 'UNAVAILABLE'

// `kind` decides what the engine does; the message is for logs, never for the browser.
export class DataServiceError extends Error {
   public readonly kind: DataFailure

   public constructor(kind: DataFailure, message: string) {
      super(message)
      this.kind = kind
   }
}

export type CollectOutcome = {
   jobId: string
   status: 'completed' | 'failed' | 'cancelled' | 'rejected_balance'
   rows: Record<string, unknown>[]
   costMicros: number
   error: string | null
}

type Json = Record<string, unknown>

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rejected_balance'])

const isTerminal = (status: unknown): status is CollectOutcome['status'] =>
   typeof status === 'string' && TERMINAL.has(status)

const rowsOf = (body: Json) =>
   Array.isArray(body.data) ? body.data.filter((row): row is Json => typeof row === 'object' && row !== null) : []

const text = (value: unknown) => (typeof value === 'string' ? value : null)

export type DataClientOptions = {
   key: string
   requestsPerMinute: number
   fetch?: typeof fetch
   sleep?: (ms: number) => Promise<void>
}

export class DataClient {
   private readonly key: string

   private readonly gapMs: number

   private readonly fetcher: typeof fetch

   private readonly sleep: (ms: number) => Promise<void>

   private nextAt = 0

   public constructor({ key, requestsPerMinute, fetch: fetcher = fetch, sleep }: DataClientOptions) {
      this.key = key
      this.gapMs = Math.ceil(60_000 / Math.max(1, requestsPerMinute))
      this.fetcher = fetcher
      this.sleep = sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
   }

   public async balanceMicros() {
      const body = await this.request('GET', '/v1/balance')

      return Math.round(Number(body.usd_remaining ?? 0) * 1_000_000)
   }

   // Starts a job without waiting for it; the caller saves the id and checks the job later.
   public async start(slug: string, params: Json) {
      const body = await this.request('POST', `/v1/data/linkedin/${slug}/run`, { params })
      const jobId = text(body.job_id)

      if (!jobId) {
         throw new DataServiceError('UNAVAILABLE', 'The data service did not return a job id')
      }

      return jobId
   }

   // The job's rows and real charge once it has ended; null while it runs.
   public async check(jobId: string): Promise<CollectOutcome | null> {
      const finished = await this.request('GET', `/v1/jobs/${jobId}/results`)

      if (!isTerminal(finished.status)) {
         return null
      }

      const job = await this.request('GET', `/v1/jobs/${jobId}`)
      const { status } = finished

      return {
         jobId,
         status,
         rows: status === 'completed' || status === 'rejected_balance' ? rowsOf(finished) : [],
         costMicros: Math.round(Number(job.usd_used ?? 0) * 1_000_000),
         error: text(finished.error) ?? text(job.error),
      }
   }

   public async cancel(jobId: string) {
      await this.request('DELETE', `/v1/jobs/${jobId}`)
   }

   // Starts a job and waits for it in place. Only for the opt-in live tests; the worker never waits.
   public async collect(slug: string, params: Json): Promise<CollectOutcome> {
      const jobId = await this.start(slug, params)
      const deadline = Date.now() + RESULT_TIMEOUT_MS

      while (Date.now() < deadline) {
         const outcome = await this.check(jobId)

         if (outcome) {
            return outcome
         }

         await this.sleep(POLL_MS)
      }

      await this.cancel(jobId).catch(() => undefined)

      throw new DataServiceError('UNAVAILABLE', `Job ${jobId} did not finish in time`)
   }

   // A job of this kind created at or after `since`, for a request whose answer was lost.
   public async findJob(slug: string, since: Date) {
      const body = await this.request('GET', '/v1/jobs?limit=20')
      const jobs = Array.isArray(body.jobs)
         ? body.jobs.filter((job): job is Json => typeof job === 'object' && job !== null)
         : []
      const match = jobs.find(
         job =>
            job.agent === `linkedin/${slug}` && new Date(text(job.created_at) ?? 0).getTime() >= since.getTime() - 5_000
      )

      return match ? text(match.id) : null
   }

   private async pace() {
      const wait = this.nextAt - Date.now()

      if (wait > 0) {
         await this.sleep(wait)
      }

      this.nextAt = Date.now() + this.gapMs
   }

   private async request(method: string, path: string, body?: Json, attempt = 0): Promise<Json> {
      if (!this.key) {
         throw new DataServiceError('CONFIG', 'No data service key is set')
      }

      await this.pace()

      let response: Response

      try {
         response = await this.fetcher(`${API}${path}`, {
            method,
            headers: {
               Authorization: `Bearer ${this.key}`,
               'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
         })
      } catch (error) {
         return this.retry(method, path, body, attempt, `network: ${error instanceof Error ? error.message : 'error'}`)
      }

      if (response.ok) {
         const parsed: unknown = await response.json().catch(() => ({}))

         return typeof parsed === 'object' && parsed !== null ? (parsed as Json) : {}
      }

      const detail = (await response.text().catch(() => '')).slice(0, 300)

      if (response.status === 401 || response.status === 403) {
         throw new DataServiceError('CONFIG', `Refused the key (${response.status})`)
      }

      if (response.status === 402) {
         throw new DataServiceError('BALANCE', 'The wallet has no balance')
      }

      if (response.status === 400 || response.status === 404 || response.status === 422) {
         throw new DataServiceError('BAD_REQUEST', `${response.status}: ${detail}`)
      }

      // Over the rate limit nothing was started, so even a start is safe to send again.
      if (response.status === 429 && attempt < RETRIES) {
         await this.sleep(RATE_WAIT_MS)

         return this.request(method, path, body, attempt + 1)
      }

      return this.retry(method, path, body, attempt, `${response.status}: ${detail}`)
   }

   private async retry(method: string, path: string, body: Json | undefined, attempt: number, reason: string) {
      // A start that may have reached the service is not sent again: the caller looks the job up instead.
      if (attempt >= RETRIES || method === 'POST') {
         throw new DataServiceError('UNAVAILABLE', reason)
      }

      await this.sleep(2_000 * (attempt + 1))

      return this.request(method, path, body, attempt + 1)
   }
}
