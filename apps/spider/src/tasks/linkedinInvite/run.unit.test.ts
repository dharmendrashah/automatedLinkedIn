import { parse } from 'node-html-parser'
import { describe, expect, it, vi } from 'vitest'

import { invitesFileSchema } from '@automatedLinkedIn/contracts'

import { inviteDialogMarkup, profileMarkup, sentMarkup, withdrawDialogMarkup } from '../../linkedin/inviteFixture'
import {
   CONNECT_LINK,
   INVITE_BUTTON,
   INVITE_NOTE_BOX,
   SENT_ROW_WITHDRAW,
   WITHDRAW_DIALOG_BUTTON,
} from '../../linkedin/markup'
import { answerFor } from './answer'
import { runInvites } from './run'

const BASE = 'https://www.linkedin.com'
const ID_A = '0199a2b3-1c2d-7e3f-8a4b-5c6d7e8f9a0a'
const ID_B = '0199a2b3-1c2d-7e3f-8a4b-5c6d7e8f9a0b'
const ADA = {
   id: ID_A,
   slug: 'ada-lovelace',
   name: 'Ada Lovelace',
   note: 'Hi Ada, glad to connect.',
}
const GRACE = {
   id: ID_B,
   slug: 'grace-hopper',
   name: 'Grace Hopper',
}

type Dialog = 'none' | 'choice' | 'note' | 'upsell' | 'limit'

type Page = {
   // Slugs whose profile shows no Connect button anywhere, not even in its More menu, or an invite already pending.
   noConnect?: string[]
   // Slugs whose top card shows only More, with Connect in its menu (recorded 2026-10-30).
   menuOnly?: string[]
   pending?: string[]
   // The note's words do not land in the box, so Send stays greyed.
   typingLost?: boolean
   // Where a visit ends instead of the address asked for, by slug.
   lands?: Record<string, string>
   upsell?: boolean
   // After Send: LinkedIn answers the invite request at once and the page still shows Connect for a while (recorded 2026-10-30), it
   // answers with a refusal, no answer is heard and the page shows Pending, nothing happens, or LinkedIn shows its limit.
   afterSend?: 'answered' | 'refused' | 'pendingLater' | 'stays' | 'limit'
   // The first copy of the Connect link is out of view (the sticky header), so it cannot be pressed.
   headerHidden?: boolean
   // Connect sends at once, with no window.
   direct?: boolean
   attempted?: boolean
   sentRows?: string[]
   // How many rows of the Sent list draw at first; one more draws with each scroll.
   sentShown?: number
}

const wordsOf = (html: string, index: number) => {
   const button = parse(html).querySelectorAll(INVITE_BUTTON)[index]

   return button ? `${button.getAttribute('aria-label') ?? ''}|${button.text.trim()}` : ''
}

const setup = (page: Page = {}) => {
   const { noConnect = [], menuOnly = [], pending = [], lands = {}, afterSend = 'answered' } = page
   const invited = new Set<string>()
   const rows = new Set(page.sentRows ?? [])
   let at = ''
   let slug = ''
   let dialog: Dialog = 'none'
   let menuOpen = false
   let typed = false
   let withdrawing: string | undefined
   let shown = page.sentShown ?? Infinity
   let heard: number[] = []
   const calls: string[] = []
   const attached: Array<{ name: string; content: string }> = []
   const dialogHtml = () =>
      ({
         none: '',
         choice: inviteDialogMarkup(),
         note: inviteDialogMarkup({
            note: true,
            typed,
         }),
         upsell: inviteDialogMarkup({ upsell: true }),
         limit: inviteDialogMarkup({ limit: true }),
      })[dialog]
   const html = () => {
      if (at.includes('/invitation-manager/sent/')) {
         return `<html><body>${sentMarkup([...rows].slice(0, shown))}${withdrawing ? withdrawDialogMarkup : ''}</body></html>`
      }

      const name = slug === ADA.slug ? ADA.name : GRACE.name
      const shownPending = afterSend === 'pendingLater' && invited.has(slug)

      return `<html><body>${profileMarkup({
         slug,
         name,
         own: !noConnect.includes(slug) && !menuOnly.includes(slug) && !shownPending,
         pending: pending.includes(slug) || shownPending,
         menuOpen,
         menuConnect: !noConnect.includes(slug),
      })}${dialogHtml()}</body></html>`
   }
   const send = () => {
      calls.push(`send ${slug}`)
      dialog = afterSend === 'limit' ? 'limit' : afterSend === 'stays' ? dialog : 'none'

      if (afterSend === 'answered' || afterSend === 'refused') {
         heard.push(afterSend === 'answered' ? 200 : 403)
      }

      if (afterSend !== 'refused' && afterSend !== 'stays' && afterSend !== 'limit') {
         invited.add(slug)
      }
   }
   const browser = {
      pageHtml: vi.fn(async () => html()),
      inspect: vi.fn(async () => ({
         url: at,
         title: '',
         viewport: {
            width: 1280,
            height: 720,
         },
         scrollY: 0,
         links: [],
         controls: [],
         blocks: [],
      })),
      clickNth: vi.fn(async (selector: string, index: number) => {
         if (selector === CONNECT_LINK) {
            if (page.headerHidden && index === 0) {
               return false
            }

            calls.push(`connect ${slug}`)
            menuOpen = false

            if (page.direct) {
               send()
            } else {
               dialog = 'choice'
            }

            return true
         }

         if (selector === SENT_ROW_WITHDRAW) {
            calls.push(`withdraw ${index}`)
            withdrawing = [...rows][index]

            return true
         }

         if (selector === WITHDRAW_DIALOG_BUTTON && withdrawing) {
            const button = parse(html()).querySelectorAll(WITHDRAW_DIALOG_BUTTON)[index]

            if (button?.text.trim() === 'Withdraw') {
               calls.push('confirm withdraw')
               rows.delete(withdrawing)
               heard.push(200)
               withdrawing = undefined
            }

            return true
         }

         if (selector === INVITE_BUTTON) {
            const words = wordsOf(html(), index)

            if (words.endsWith('|Add a note')) {
               dialog = page.upsell ? 'upsell' : 'note'
            } else if (words.endsWith('|More')) {
               calls.push('more')
               menuOpen = true
            } else if (words.endsWith('|Send') && !typed) {
               // A greyed Send takes no click.
            } else if (words.endsWith('|Send without a note') || words.endsWith('|Send')) {
               send()
            }

            return words !== ''
         }

         return false
      }),
      watchAnswers: vi.fn(() => {
         heard = []

         return {
            statuses: () => [...heard],
            stop: vi.fn(),
         }
      }),
      clickSelector: vi.fn(async (selector: string) => {
         calls.push(selector === INVITE_NOTE_BOX ? 'click box' : `click ${selector}`)

         return true
      }),
      typeKeys: vi.fn(async (text: string) => {
         calls.push(`type ${text.length}`)
         typed = !page.typingLost
      }),
      press: vi.fn(async (key: string) => {
         calls.push(`key ${key}`)
         dialog = 'none'
         menuOpen = false
         withdrawing = undefined

         return ''
      }),
      scrollOver: vi.fn(async () => {
         shown += 1

         return true
      }),
      scrollBy: vi.fn(async () => true),
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => at),
   }
   const context = {
      browser: browser as never,
      visit: vi.fn(async (url: string) => {
         const [, asked = ''] = /\/in\/([^/]+)\//.exec(url) ?? []

         slug = asked
         at = lands[asked] ?? url
         dialog = 'none'
         menuOpen = false
         typed = false

         return at
      }),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn((name: string, content: string) =>
         attached.push({
            name,
            content,
         })
      ),
      markAttempt: vi.fn(async () => {
         calls.push('markAttempt')

         return !page.attempted
      }),
   }
   const run = (input: Parameters<typeof runInvites>[2]) =>
      runInvites(context, BASE, input, {
         random: () => 0,
         now: () => Date.UTC(2026, 9, 30, 12),
      })
   const file = () =>
      invitesFileSchema.parse(JSON.parse(attached.find(({ name }) => name === 'invites.json')?.content ?? '{}'))

   return {
      run,
      calls,
      context,
      attached,
      file,
   }
}

const both = {
   send: [ADA, GRACE],
   withdraw: [],
}

describe('runInvites', () => {
   it('should invite each person from their profile, with the note typed once, asking markAttempt once before the first Connect', async () => {
      const { run, calls, context, file } = setup()

      await expect(run(both)).resolves.toMatchObject({ outcome: 'DONE' })
      expect(context.visit).toHaveBeenNthCalledWith(1, `${BASE}/in/ada-lovelace/`)
      expect(calls.filter(call => call === 'markAttempt')).toHaveLength(1)
      expect(calls.indexOf('markAttempt')).toBe(calls.indexOf('connect ada-lovelace') - 1)
      expect(calls.filter(call => call.startsWith('send '))).toEqual(['send ada-lovelace', 'send grace-hopper'])
      expect(calls).toContain(`type ${ADA.note.length}`)
      expect(calls.filter(call => call.startsWith('type'))).toHaveLength(1)
      // The rest between two invites is the contract's (30 s at the least).
      expect(context.pause).toHaveBeenCalledWith(30_000)
      expect(file().sent).toEqual([
         {
            id: ID_A,
            outcome: 'SENT',
            memberId: '736436677',
         },
         {
            id: ID_B,
            outcome: 'SENT',
            memberId: '736436677',
         },
      ])
   })

   it('should press nothing for a profile with no Connect button or an invite already pending, and keep the page it could not read', async () => {
      const { run, calls, context, attached, file } = setup({
         noConnect: ['ada-lovelace'],
         pending: ['grace-hopper'],
      })

      await expect(run(both)).resolves.toMatchObject({ outcome: 'PARTIAL' })
      expect(context.markAttempt).not.toHaveBeenCalled()
      expect(calls.some(call => call.startsWith('connect'))).toBe(false)
      expect(attached.some(({ name }) => name.startsWith('no-connect'))).toBe(true)
      expect(file().sent.map(({ outcome }) => outcome)).toEqual(['NO_CONNECT', 'ALREADY_PENDING'])
   })

   it('should close the dialog, type and send nothing when LinkedIn gives no place for the note, and go on with the next', async () => {
      const { run, calls, file } = setup({ upsell: true })

      await expect(run(both)).resolves.toMatchObject({ outcome: 'PARTIAL' })
      expect(calls).toContain('key Escape')
      expect(calls.some(call => call.startsWith('type'))).toBe(false)
      expect(file().sent.map(({ outcome }) => outcome)).toEqual(['NOTE_REFUSED', 'SENT'])
   })

   it('should stop at an invite whose dialog stays open after Send and never open the next profile', async () => {
      const { run, context, file } = setup({ afterSend: 'stays' })

      await expect(run(both)).resolves.toMatchObject({ outcome: 'UNKNOWN' })
      expect(context.visit).toHaveBeenCalledTimes(1)
      expect(file().sent.map(({ outcome }) => outcome)).toEqual(['UNSURE', 'NOT_SENT'])
   })

   it('should take a refusal of the invite request as not sent and press nothing more', async () => {
      const { run, context, file } = setup({ afterSend: 'refused' })

      await expect(run(both)).resolves.toMatchObject({ outcome: 'PARTIAL' })
      expect(context.visit).toHaveBeenCalledTimes(1)
      expect(file().sent.map(({ outcome }) => outcome)).toEqual(['REFUSED', 'NOT_SENT'])
   })

   it('should take Pending on the profile as sent when no answer to the request was heard', async () => {
      const { run, file } = setup({ afterSend: 'pendingLater' })

      await run({
         send: [GRACE],
         withdraw: [],
      })
      expect(file().sent[0]?.outcome).toBe('SENT')
   })

   it('should press the next copy of the Connect link when the first is out of view, and take a send with no window by its answer', async () => {
      const hidden = setup({ headerHidden: true })

      await hidden.run({
         send: [GRACE],
         withdraw: [],
      })
      expect(hidden.file().sent[0]?.outcome).toBe('SENT')

      const direct = setup({ direct: true })

      await direct.run({
         send: [GRACE],
         withdraw: [],
      })
      expect(direct.file().sent[0]?.outcome).toBe('SENT')
      expect(direct.calls.filter(call => call.startsWith('send'))).toHaveLength(1)
   })

   it('should find Connect in the More menu when the top card has none, and send the note through it', async () => {
      const { run, calls, file } = setup({ menuOnly: ['ada-lovelace'] })

      await expect(
         run({
            send: [ADA],
            withdraw: [],
         })
      ).resolves.toMatchObject({ outcome: 'DONE' })
      expect(calls.indexOf('more')).toBeLessThan(calls.indexOf('markAttempt'))
      expect(calls.indexOf('markAttempt')).toBe(calls.indexOf('connect ada-lovelace') - 1)
      expect(calls).toContain(`type ${ADA.note.length}`)
      expect(file().sent[0]?.outcome).toBe('SENT')
   })

   it('should send nothing when Send stays greyed after the note was typed', async () => {
      const { run, calls, file } = setup({ typingLost: true })

      await run({
         send: [ADA],
         withdraw: [],
      })
      expect(calls.some(call => call.startsWith('send '))).toBe(false)
      expect(calls).toContain('key Escape')
      expect(file().sent[0]?.outcome).toBe('NOT_SENT')
   })

   it("should stop at LinkedIn's limit notice", async () => {
      const { run, context, file } = setup({ afterSend: 'limit' })

      await expect(run(both)).resolves.toMatchObject({ outcome: 'LIMIT_REACHED' })
      expect(context.visit).toHaveBeenCalledTimes(1)
      expect(file().sent[0]?.outcome).toBe('LIMIT_REACHED')
   })

   it('should press nothing for a command delivered again and call every invite unsure', async () => {
      const { run, calls, file } = setup({ attempted: true })

      await expect(run(both)).resolves.toMatchObject({ outcome: 'UNKNOWN' })
      expect(calls.some(call => call.startsWith('connect'))).toBe(false)
      expect(file().sent.map(({ outcome }) => outcome)).toEqual(['UNSURE', 'UNSURE'])
   })

   it('should answer signed out on a sign-in page, first or later, and keep what the first invite did', async () => {
      const first = setup({ lands: { 'ada-lovelace': `${BASE}/uas/login` } })

      await expect(first.run(both)).resolves.toMatchObject({ outcome: 'SIGNED_OUT' })
      expect(first.calls.some(call => call.startsWith('connect'))).toBe(false)

      const later = setup({ lands: { 'grace-hopper': `${BASE}/uas/login` } })

      await expect(later.run(both)).resolves.toMatchObject({ outcome: 'SIGNED_OUT' })
      expect(later.file().sent.map(({ outcome }) => outcome)).toEqual(['SENT', 'NOT_SENT'])
   })

   it('should say not available when the address leads away from a profile', async () => {
      const { run, file } = setup({ lands: { 'ada-lovelace': `${BASE}/feed/` } })

      await run({
         send: [ADA],
         withdraw: [],
      })
      expect(file().sent[0]?.outcome).toBe('NOT_AVAILABLE')
   })

   it('should scroll the Sent list to the row, withdraw only that person, and call one not on it not pending with the page kept', async () => {
      const { run, calls, file, attached } = setup({
         sentRows: ['brad-h', 'petra-h', 'ada-lovelace'],
         sentShown: 1,
      })

      await expect(
         run({
            send: [],
            withdraw: [
               {
                  id: ID_A,
                  slug: 'ada-lovelace',
                  name: 'Ada Lovelace',
               },
               {
                  id: ID_B,
                  slug: 'grace-hopper',
                  name: 'Grace Hopper',
               },
            ],
         })
      ).resolves.toMatchObject({ outcome: 'DONE' })
      expect(calls.filter(call => call.startsWith('withdraw '))).toEqual(['withdraw 2'])
      expect(calls.filter(call => call === 'confirm withdraw')).toHaveLength(1)
      expect(file().withdrawn.map(({ outcome }) => outcome)).toEqual(['WITHDRAWN', 'NOT_PENDING'])
      expect(attached.some(({ name }) => name.startsWith('sent-list'))).toBe(true)
   })
})

describe('answerFor', () => {
   it('should keep the session after a run that passed its check and never after an unclear one', () => {
      const run = {
         sent: [],
         withdrawn: [],
      }

      expect(
         answerFor({
            outcome: 'DONE',
            ...run,
         }).commitSession
      ).toBe(true)
      expect(
         answerFor({
            outcome: 'UNKNOWN',
            ...run,
         }).commitSession
      ).toBeUndefined()
      expect(
         answerFor({
            outcome: 'SIGNED_OUT',
            ...run,
         }).verdict
      ).toBe('SIGNED_OUT')
   })
})
