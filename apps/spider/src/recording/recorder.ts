import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type ObjectStore } from '../storage/store'
import { maskHeaders, maskText, maskUrl } from './masking'

export type RecordingMode = 'off' | 'failures' | 'always'

export type LogSource = 'browser' | 'spider' | 'engine'

export type LogLevel = 'info' | 'warn' | 'error'

export type StepCall = 'goto' | 'click' | 'fill' | 'exists' | 'extract' | 'cookies' | 'addCookies'

// One thing the spider did in the browser. `t` is the time in milliseconds since the run started, when it finished.
export type StepEntry = {
   n: number
   t: number
   call: StepCall
   durationMs: number
   ok: boolean
   selector?: string
   // goto: the address that was asked for, which is all there is when the page never loaded.
   target?: string
   urlBefore?: string
   urlAfter?: string
   // fill: how many characters were typed, never which. exists: whether the element showed up. extract: records read.
   length?: number
   found?: boolean
   count?: number
   error?: string
   screenshot?: string
}

export type NetworkInput = {
   method: string
   url: string
   resourceType: string
   requestHeaders: Record<string, string>
   status: number | null
   responseHeaders: Record<string, string>
   // Response text, only for pages and fetch/XHR. Cut and masked here, so callers can pass it as it came.
   body?: string
   durationMs?: number
   failure?: string
}

type NetworkEntry = Omit<NetworkInput, 'body'> & {
   t: number
   body?: string
   bodyTruncated?: boolean
   bodyDropped?: boolean
}

type LogEntry = {
   t: number
   source: LogSource
   level: LogLevel
   message: string
}

// What the browser driver sees of a recorder.
export interface RunRecorder {
   // Where Playwright writes the video; undefined when video is off.
   readonly videoDir: string | undefined
   log: (source: LogSource, level: LogLevel, message: string) => void
   network: (entry: NetworkInput) => void
   // A response capture still running; finish waits for it.
   track: (work: Promise<unknown>) => void
   settle: () => Promise<void>
}

export type RecorderOptions = {
   kind: 'validate' | 'task'
   id: string
   mode: Exclude<RecordingMode, 'off'>
   video: boolean
   store: Pick<ObjectStore, 'put' | 'upload'>
   now?: () => number
   tmpRoot?: string
   maxVideoBytes?: number
}

const MAX_ENTRIES = 500
const MAX_BODY_BYTES = 64 * 1024
const MAX_TOTAL_BODY_BYTES = 2 * 1024 * 1024
const MAX_SCREENSHOTS = 40
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
// A secret shorter than this would blank out ordinary words.
const MIN_SECRET_LENGTH = 4

const stamp = (time: number) => `${new Date(time).toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`

// Collects what one run did and, when the run is over, saves it to the bucket. Nothing in here may fail the run:
// `finish` catches every error, and the temporary folder always goes.
export class Recorder implements RunRecorder {
   public readonly videoDir: string | undefined

   private readonly steps: StepEntry[] = []

   private readonly requests: NetworkEntry[] = []

   private readonly logs: LogEntry[] = []

   private readonly screenshots: string[] = []

   private readonly notes: string[] = []

   private readonly secrets = new Set<string>()

   private readonly pending = new Set<Promise<unknown>>()

   private failureHtml: string | undefined

   private bodyBytes = 0

   private readonly startedAt: number

   private constructor(
      private readonly options: RecorderOptions,
      public readonly dir: string
   ) {
      this.startedAt = this.clock()
      this.videoDir = options.video ? dir : undefined
   }

   public static async start(options: RecorderOptions) {
      const dir = await mkdtemp(join(options.tmpRoot ?? tmpdir(), 'spider-recording-'))

      return new Recorder(options, dir)
   }

   private clock() {
      return (this.options.now ?? Date.now)()
   }

   private elapsed() {
      return this.clock() - this.startedAt
   }

   public addSecret(value: string) {
      if (value.length >= MIN_SECRET_LENGTH) {
         this.secrets.add(value)
      }
   }

   public log(source: LogSource, level: LogLevel, message: string) {
      if (this.logs.length < MAX_ENTRIES) {
         this.logs.push({
            t: this.elapsed(),
            source,
            level,
            message: maskText(message),
         })
      }
   }

   public network({ body, ...entry }: NetworkInput) {
      if (this.requests.length >= MAX_ENTRIES) {
         return
      }

      const masked: NetworkEntry = {
         ...entry,
         t: this.elapsed(),
         url: maskUrl(entry.url),
         requestHeaders: maskHeaders(entry.requestHeaders),
         responseHeaders: maskHeaders(entry.responseHeaders),
      }

      if (body !== undefined) {
         if (this.bodyBytes >= MAX_TOTAL_BODY_BYTES) {
            masked.bodyDropped = true
         } else {
            masked.body = body.slice(0, MAX_BODY_BYTES)
            masked.bodyTruncated = body.length > MAX_BODY_BYTES
            this.bodyBytes += masked.body.length
         }
      }

      this.requests.push(masked)
   }

   public addStep(step: Omit<StepEntry, 'n' | 't'>) {
      const entry: StepEntry = {
         ...step,
         n: this.steps.length + 1,
         t: this.elapsed(),
      }

      this.steps.push(entry)

      return entry
   }

   public async saveScreenshot(name: string, png: Buffer) {
      if (this.screenshots.length >= MAX_SCREENSHOTS) {
         return false
      }

      await mkdir(join(this.dir, 'screenshots'), { recursive: true })
      await writeFile(join(this.dir, 'screenshots', name), png)
      this.screenshots.push(name)

      return true
   }

   // Kept once: the first failure is the one that explains the run.
   public saveFailureHtml(html: string) {
      this.failureHtml ??= html
   }

   public track(work: Promise<unknown>) {
      this.pending.add(work)
      void work.finally(() => this.pending.delete(work)).catch(() => undefined)
   }

   public async settle() {
      await Promise.allSettled([...this.pending])
   }

   private redact(text: string) {
      let result = text

      for (const secret of this.secrets) {
         result = result.split(secret).join('[redacted]')
      }

      return result
   }

   private async videoFile() {
      if (!this.options.video) {
         return undefined
      }

      const [name] = (await readdir(this.dir)).filter(file => file.endsWith('.webm'))

      if (!name) {
         return undefined
      }

      const path = join(this.dir, name)
      const { size } = await stat(path)

      if (size > (this.options.maxVideoBytes ?? MAX_VIDEO_BYTES)) {
         this.notes.push('The video was left out because it is too large.')

         return undefined
      }

      return path
   }

   // Saves the recording and resolves to its prefix in the bucket, or undefined when nothing was kept (mode
   // `failures` and the run went well) or saving failed. Always removes the temporary folder.
   public async finish({ failed, verdict }: { failed: boolean; verdict?: string }) {
      try {
         await this.settle()

         if (this.options.mode === 'failures' && !failed) {
            return undefined
         }

         const { store, kind, id } = this.options
         const prefix = `recordings/${kind}/${id}/${stamp(this.startedAt)}`
         const video = await this.videoFile()
         const save = (file: string, value: unknown) =>
            store.put(`${prefix}/${file}`, this.redact(JSON.stringify(value)), 'application/json')

         await save('timeline.json', {
            kind,
            id,
            startedAt: new Date(this.startedAt).toISOString(),
            durationMs: this.elapsed(),
            outcome: failed ? 'failed' : 'ok',
            ...(verdict && { verdict }),
            video: Boolean(video),
            screenshots: this.screenshots,
            notes: this.notes,
            steps: this.steps,
         })
         await save('network.json', this.requests)
         await save('logs.json', this.logs)

         if (this.failureHtml !== undefined) {
            await store.put(`${prefix}/failure.html`, this.redact(this.failureHtml), 'text/plain')
         }

         for (const name of this.screenshots) {
            await store.upload(`${prefix}/screenshots/${name}`, join(this.dir, 'screenshots', name), 'image/png')
         }

         if (video) {
            await store.upload(`${prefix}/video.webm`, video, 'video/webm')
         }

         return prefix
      } catch (error) {
         console.error(`Could not save the recording of ${this.options.id}: ${maskText((error as Error).message)}`)

         return undefined
      } finally {
         await rm(this.dir, {
            recursive: true,
            force: true,
         }).catch(() => undefined)
      }
   }
}
