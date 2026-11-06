import { describe, expect, it, vi } from 'vitest'

import { engageFileSchema } from '@automatedLinkedIn/contracts'

import {
   ACTIVITY,
   AUTHOR,
   COMPOSE_REPOST_INDEX,
   type PostState,
   commentIdOf,
   postDefaults,
   postPage,
} from '../../linkedin/engageFixture'
import {
   ENGAGE_BUTTONS,
   ENGAGE_EDITOR,
   ENGAGE_PICKER_CHOICE,
   ENGAGE_PICKER_OPEN,
   ENGAGE_REPLY_OPEN,
   ENGAGE_REPOST_MENU,
   ENGAGE_REPOST_OPEN,
   ENGAGE_STATE,
   ENGAGE_SUBMIT,
   POST_EDITOR,
} from '../../linkedin/markup'
import { VisitError } from '../defineTask'
import { createLinkedinEngage } from './index'

const BASE = 'https://www.linkedin.com'
const POST = `${BASE}/feed/update/urn:li:activity:${ACTIVITY}/`
const OTHER_POST = `${BASE}/feed/update/urn:li:activity:7000000000000000002/`
const SIGN_IN = `${BASE}/uas/login`
const RESTRICTED = `${BASE}/flagship-web/login/login-restriction`
const ID = '0b6f3c1e-5a2d-4c3b-9e8f-1a2b3c4d5e6f'
const REACTIONS = ['Like', 'Celebrate', 'Support', 'Love', 'Insightful', 'Funny']

type Options = {
   post?: Partial<PostState>
   lands?: string
   markAttemptAnswer?: boolean
   // false: Comment is pressed but the words never show on the page.
   submitShows?: boolean
   // An address that does not open.
   failOpen?: string
   // false: the reaction picker never opens.
   pickerOpens?: boolean
   // false: LinkedIn shows no "Repost successful" alert.
   repostShows?: boolean
   // true: a comment is stored cut short with "…more", as LinkedIn shows a long one.
   truncates?: boolean
   // The comment box is drawn only after the page has been looked at this many times.
   boxArrivesAfter?: number
   // false: the reply box never opens.
   replyOpens?: boolean
   // false: LinkedIn shows no reply after Reply was pressed.
   replyShows?: boolean
}

const setup = ({
   post = {},
   lands = POST,
   markAttemptAnswer = true,
   submitShows = true,
   failOpen,
   pickerOpens = true,
   repostShows = true,
   truncates = false,
   boxArrivesAfter,
   replyOpens = true,
   replyShows = true,
}: Options = {}) => {
   const state: PostState = {
      ...postDefaults,
      ...post,
      comments: [...(post.comments ?? [])],
   }
   const clicks: string[] = []
   const places: Array<[string, number]> = []
   const keys: string[] = []
   const waits: number[] = []
   const logged: string[] = []
   const attached: Record<string, string> = {}
   const markAttempt = vi.fn(async () => markAttemptAnswer)
   let looks = 0

   // What a press does on the page: the state of the post changes as LinkedIn's would.
   const press = (selector: string) => {
      if (selector === ENGAGE_STATE) {
         state.reaction = 'Like'

         return true
      }

      if (selector === ENGAGE_REPLY_OPEN) {
         if (replyOpens) {
            state.replyOpen = commentIdOf(0)
         }

         return true
      }

      if (selector === ENGAGE_REPOST_OPEN) {
         state.menu = true

         return true
      }

      if (selector === ENGAGE_PICKER_OPEN) {
         state.picker = pickerOpens

         return true
      }

      const choice = REACTIONS.find(name => selector === ENGAGE_PICKER_CHOICE(name))

      if (choice !== undefined) {
         if (!state.picker) {
            return false
         }

         state.reaction = choice
         state.picker = false

         return true
      }

      if (selector === ENGAGE_SUBMIT && state.words !== '') {
         if (submitShows) {
            state.comments.push(truncates ? `${state.words.slice(0, 60)}…more` : state.words)
         }

         state.words = ''

         return true
      }

      if (selector === POST_EDITOR) {
         return state.compose
      }

      return selector === ENGAGE_EDITOR ? state.box : false
   }

   const browser = {
      inspect: vi.fn(async () => ({ url: lands })),
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => lands),
      pageHtml: vi.fn(async () => {
         looks += 1

         if (boxArrivesAfter !== undefined && looks > boxArrivesAfter) {
            state.box = true
         }

         return postPage(state)
      }),
      clickNth: vi.fn(async (selector: string, index: number) => {
         places.push([selector, index])

         if (selector === ENGAGE_EDITOR && index === 1 && state.replyOpen !== undefined) {
            clicks.push(selector)

            return true
         }

         // A press on the first match of a control is a click, as it is when the control is brought into view first.
         if (index === 0 && selector !== ENGAGE_REPOST_MENU && selector !== ENGAGE_BUTTONS) {
            clicks.push(selector)

            return press(selector)
         }

         if (selector === ENGAGE_REPOST_MENU && state.menu && state.menuItems[index] !== undefined) {
            state.menu = false
            if (state.menuItems[index] === 'Repost instantly') {
               state.reposted = repostShows

               return true
            }
            state.compose = state.menuItems[index] === 'Repost with thoughts'

            return true
         }

         if (selector === ENGAGE_BUTTONS && state.compose && index === COMPOSE_REPOST_INDEX && state.words !== '') {
            state.reposted = repostShows
            state.compose = false

            return true
         }

         if (selector === ENGAGE_BUTTONS && state.replyOpen !== undefined && state.words !== '') {
            if (replyShows) {
               state.comments.push(state.words)
            }

            state.words = ''
            state.replyOpen = undefined

            return true
         }

         return false
      }),
      clickSelector: vi.fn(async (selector: string) => {
         clicks.push(selector)

         return press(selector)
      }),
      typeKeys: vi.fn(async (text: string) => {
         state.words = text

         return true
      }),
      press: vi.fn(async (key: string) => {
         keys.push(key)

         if (key === 'Delete') {
            state.words = ''
         }
      }),
      clearCookies: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => undefined),
   }
   const context = {
      browser,
      visit: vi.fn(async (url: string) => {
         if (url === failOpen) {
            throw new VisitError('load', 'The page did not open.')
         }

         return lands
      }),
      pause: vi.fn(async (ms: number) => {
         waits.push(ms)
      }),
      log: vi.fn((message: string) => {
         logged.push(message)
      }),
      warn: vi.fn((message: string) => {
         logged.push(message)
      }),
      attach: vi.fn((name: string, content: string) => {
         attached[name] = content
      }),
      markAttempt,
      screenshot: vi.fn(async () => undefined),
   }
   const run = (acts: Array<Record<string, unknown>>) =>
      createLinkedinEngage({ baseUrl: BASE }).run(context as never, { acts })

   return {
      state,
      clicks,
      places,
      keys,
      waits,
      logged,
      attached,
      markAttempt,
      run,
   }
}

// One act on the post, by default a Like on the post's own address.
const act = (fields: Record<string, unknown>) => ({
   id: ID,
   postUrl: POST,
   ...fields,
})

// The outcome of each act, read from the file the run attached (checked against the contract).
const outcomesOf = (attached: Record<string, string>) =>
   engageFileSchema.parse(JSON.parse(attached['engage.json'] ?? '{}')).acts.map(({ outcome }) => outcome)

describe('linkedin-engage repost instantly', () => {
   it('should press Repost instantly from the menu, once, type nothing, and say REPOSTED', async () => {
      const t = setup()

      const outcome = await t.run([act({ kind: 'repost_instant' })])

      expect(outcome).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
      })
      expect(t.places.filter(([selector]) => selector === ENGAGE_REPOST_MENU)).toEqual([[ENGAGE_REPOST_MENU, 1]])
      expect(t.places.some(([selector]) => selector === ENGAGE_BUTTONS)).toBe(false)
      expect(t.keys).toEqual([])
      expect(outcomesOf(t.attached)).toEqual(['REPOSTED'])
   })

   it('should not press Repost instantly when the command was delivered again', async () => {
      const t = setup({ markAttemptAnswer: false })

      await t.run([act({ kind: 'repost_instant' })])

      expect(t.places.some(([selector]) => selector === ENGAGE_REPOST_MENU)).toBe(false)
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })

   it('should say NOT_TRIED and ask for no attempt when the menu has no Repost instantly item', async () => {
      const t = setup({ post: { menuItems: ['Repost with thoughts'] } })

      await t.run([act({ kind: 'repost_instant' })])

      expect(t.places.some(([selector]) => selector === ENGAGE_REPOST_MENU)).toBe(false)
      expect(t.markAttempt).not.toHaveBeenCalled()
      expect(outcomesOf(t.attached)).toEqual(['NOT_TRIED'])
   })

   it('should say UNKNOWN when no repost alert shows after Repost instantly', async () => {
      const t = setup({ repostShows: false })

      await t.run([act({ kind: 'repost_instant' })])

      expect(t.places).toContainEqual([ENGAGE_REPOST_MENU, 1])
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })
})

describe('linkedin-engage comment on a comment', () => {
   const reply = (fields: Record<string, unknown> = {}) =>
      act({
         kind: 'comment_reply',
         commentId: commentIdOf(0),
         text: 'Thanks for sharing',
         ...fields,
      })
   const commented = { comments: ['Good read'] }

   it('should press Reply on the comment, type the words after its mention, press Reply once, and say REPLIED without logging the words', async () => {
      const t = setup({ post: commented })

      const outcome = await t.run([reply()])

      expect(outcome).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
      })
      expect(t.clicks.filter(selector => selector === ENGAGE_REPLY_OPEN)).toHaveLength(1)
      expect(t.places.filter(([selector]) => selector === ENGAGE_BUTTONS)).toHaveLength(1)
      expect(t.state.comments).toEqual(['Good read', 'Thanks for sharing'])
      expect(outcomesOf(t.attached)).toEqual(['REPLIED'])
      expect(t.logged.join(' ')).not.toContain('Thanks for sharing')
   })

   it('should say COMMENT_GONE and press nothing when the comment is not on the post', async () => {
      const t = setup({ post: commented })

      await t.run([reply({ commentId: commentIdOf(5) })])

      expect(t.clicks).toEqual([])
      expect(t.markAttempt).not.toHaveBeenCalled()
      expect(outcomesOf(t.attached)).toEqual(['COMMENT_GONE'])
   })

   it('should say UNKNOWN, press Reply no more, and clear the box when the command was delivered again', async () => {
      const t = setup({
         post: commented,
         markAttemptAnswer: false,
      })

      await t.run([reply()])

      expect(t.places.some(([selector]) => selector === ENGAGE_BUTTONS)).toBe(false)
      expect(t.keys).toContain('Delete')
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })

   it('should say UNKNOWN when no reply shows after Reply was pressed', async () => {
      const t = setup({
         post: commented,
         replyShows: false,
      })

      await t.run([reply()])

      expect(t.places.filter(([selector]) => selector === ENGAGE_BUTTONS)).toHaveLength(1)
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })

   it('should say NOT_TRIED and press nothing when another reply box is already open on the post', async () => {
      const t = setup({
         post: {
            comments: ['Good read'],
            replyOpen: commentIdOf(0),
         },
      })

      await t.run([reply()])

      expect(t.clicks).toEqual([])
      expect(outcomesOf(t.attached)).toEqual(['NOT_TRIED'])
   })

   it('should say NOT_TRIED and type nothing when the reply box does not open', async () => {
      const t = setup({
         post: commented,
         replyOpens: false,
      })

      await t.run([reply()])

      expect(t.state.words).toBe('')
      expect(t.places.some(([selector]) => selector === ENGAGE_BUTTONS)).toBe(false)
      expect(outcomesOf(t.attached)).toEqual(['NOT_TRIED'])
   })
})

describe('linkedin-engage when the comment box draws late', () => {
   it('should wait for the comment box to draw, then say COMMENTED', async () => {
      const t = setup({
         post: { box: false },
         boxArrivesAfter: 2,
      })

      await t.run([
         act({
            kind: 'comment',
            text: 'Good read',
         }),
      ])

      expect(outcomesOf(t.attached)).toEqual(['COMMENTED'])
   })
})

describe('linkedin-engage on a share address', () => {
   const SHARE = `${BASE}/posts/ada-example_engines-share-7000000000000009-AbCd/?utm_source=share`

   it('should open the share address, take the post key from the page, and react to that post', async () => {
      const t = setup()

      await t.run([
         {
            id: ID,
            postUrl: SHARE,
            kind: 'react',
            reaction: 'like',
         },
      ])

      expect(outcomesOf(t.attached)).toEqual(['REACTED'])
   })

   it('should say POST_GONE and press nothing when the share address lands on the feed, not a post', async () => {
      const t = setup({ lands: `${BASE}/feed/` })

      await t.run([
         {
            id: ID,
            postUrl: SHARE,
            kind: 'react',
            reaction: 'like',
         },
      ])

      expect(t.clicks).toEqual([])
      expect(outcomesOf(t.attached)).toEqual(['POST_GONE'])
   })
})

describe('linkedin-engage', () => {
   it('should press the reaction control once for a Like, and say DONE with the outcome in the file', async () => {
      const t = setup()

      const outcome = await t.run([
         act({
            kind: 'react',
            reaction: 'like',
         }),
      ])

      expect(outcome).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         commitSession: true,
      })
      expect(t.clicks.filter(selector => selector === ENGAGE_STATE)).toHaveLength(1)
      expect(outcomesOf(t.attached)).toEqual(['REACTED'])
   })

   it('should open the picker and press the chosen reaction when it is not Like', async () => {
      const t = setup()

      await t.run([
         act({
            kind: 'react',
            reaction: 'insightful',
         }),
      ])

      expect(t.clicks).toEqual([ENGAGE_PICKER_OPEN, ENGAGE_PICKER_CHOICE('Insightful')])
      expect(outcomesOf(t.attached)).toEqual(['REACTED'])
   })

   it('should press nothing, and not ask for the attempt, when the post already shows a reaction', async () => {
      const t = setup({ post: { reaction: 'Love' } })

      await t.run([
         act({
            kind: 'react',
            reaction: 'like',
         }),
      ])

      expect(t.clicks).toEqual([])
      expect(t.markAttempt).not.toHaveBeenCalled()
      expect(outcomesOf(t.attached)).toEqual(['ALREADY_REACTED'])
   })

   it('should say POST_GONE and press nothing when the address shows a post by someone else', async () => {
      const t = setup({ post: { author: 'Someone Else' } })

      await t.run([
         act({
            kind: 'react',
            reaction: 'like',
            authorName: AUTHOR,
         }),
      ])

      expect(t.clicks).toEqual([])
      expect(outcomesOf(t.attached)).toEqual(['POST_GONE'])
   })

   it('should type the words, press Comment once and say COMMENTED, and keep the words out of the log and the file', async () => {
      const t = setup()

      await t.run([
         act({
            kind: 'comment',
            text: 'Good read on this',
         }),
      ])

      expect(t.clicks.filter(selector => selector === ENGAGE_SUBMIT)).toHaveLength(1)
      expect(t.state.comments).toEqual(['Good read on this'])
      expect(outcomesOf(t.attached)).toEqual(['COMMENTED'])
      expect(t.logged.join(' ')).not.toContain('Good read')
      expect(t.attached['engage.json']).not.toContain('Good read')
   })

   it('should not press Comment when the command was delivered again, and clear the box', async () => {
      const t = setup({ markAttemptAnswer: false })

      await t.run([
         act({
            kind: 'comment',
            text: 'Good read',
         }),
      ])

      expect(t.clicks).not.toContain(ENGAGE_SUBMIT)
      expect(t.keys).toEqual(['ControlOrMeta+A', 'Delete'])
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })

   it('should say UNKNOWN when the comment does not show after Comment was pressed', async () => {
      const t = setup({ submitShows: false })

      await t.run([
         act({
            kind: 'comment',
            text: 'Good read',
         }),
      ])

      expect(t.clicks.filter(selector => selector === ENGAGE_SUBMIT)).toHaveLength(1)
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })

   it('should say COMMENTS_OFF and type nothing when the post has no comment box', async () => {
      const t = setup({ post: { box: false } })

      await t.run([
         act({
            kind: 'comment',
            text: 'Good read',
         }),
      ])

      expect(t.clicks).toEqual([])
      expect(outcomesOf(t.attached)).toEqual(['COMMENTS_OFF'])
   })

   it('should answer SIGNED_OUT and press nothing when the address leads to a sign-in page', async () => {
      const t = setup({ lands: SIGN_IN })

      const outcome = await t.run([
         act({
            kind: 'react',
            reaction: 'like',
         }),
      ])

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
      })
      expect(t.clicks).toEqual([])
   })

   it('should answer RESTRICTED when LinkedIn restricts the account', async () => {
      const t = setup({ lands: RESTRICTED })

      const outcome = await t.run([
         act({
            kind: 'react',
            reaction: 'like',
         }),
      ])

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: 'RESTRICTED',
      })
   })

   it('should answer FAILED with NONE_DONE when no act is done', async () => {
      const t = setup({ post: { box: false } })

      const outcome = await t.run([
         act({
            kind: 'comment',
            text: 'Good read',
         }),
      ])

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: 'NONE_DONE',
      })
   })

   it('should go on after a post that did not open, and wait 20 to 45 seconds between two acts', async () => {
      const t = setup({ failOpen: OTHER_POST })

      const outcome = await t.run([
         act({
            id: '1d2c3b4a-0000-4000-8000-000000000001',
            postUrl: OTHER_POST,
            kind: 'react',
            reaction: 'like',
         }),
         act({
            kind: 'react',
            reaction: 'like',
         }),
      ])

      expect(outcome).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'PARTIAL',
      })
      expect(outcomesOf(t.attached)).toEqual(['NOT_TRIED', 'REACTED'])
      expect(t.waits.some(ms => ms >= 20000 && ms <= 45000)).toBe(true)
   })

   it('should wait 2 to 5 seconds after an act before the run leaves it', async () => {
      const t = setup()

      await t.run([
         act({
            kind: 'react',
            reaction: 'like',
         }),
      ])

      expect(t.waits.at(-1)).toBeGreaterThanOrEqual(2000)
      expect(t.waits.at(-1)).toBeLessThanOrEqual(5000)
   })

   it('should repost with thoughts through the menu item, once, and say REPOSTED, never pressing Repost instantly', async () => {
      const t = setup()

      const outcome = await t.run([
         act({
            kind: 'repost',
            text: 'Worth a read',
         }),
      ])

      expect(outcome).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
      })
      expect(t.clicks.filter(selector => selector === ENGAGE_REPOST_OPEN)).toHaveLength(1)
      expect(t.places.filter(([selector]) => selector === ENGAGE_REPOST_MENU || selector === ENGAGE_BUTTONS)).toEqual([
         [ENGAGE_REPOST_MENU, 0],
         [ENGAGE_BUTTONS, COMPOSE_REPOST_INDEX],
      ])
      expect(outcomesOf(t.attached)).toEqual(['REPOSTED'])
      expect(t.logged.join(' ')).not.toContain('Worth a read')
   })

   it('should not press Repost when the command was delivered again, and clear the compose box', async () => {
      const t = setup({ markAttemptAnswer: false })

      await t.run([
         act({
            kind: 'repost',
            text: 'Worth a read',
         }),
      ])

      expect(t.places.some(([selector]) => selector === ENGAGE_BUTTONS)).toBe(false)
      expect(t.keys).toEqual(['ControlOrMeta+A', 'Delete'])
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })

   it('should not repost when the menu has no Repost with thoughts item', async () => {
      const t = setup({ post: { menuItems: ['Repost instantly'] } })

      await t.run([
         act({
            kind: 'repost',
            text: 'Worth a read',
         }),
      ])

      expect(t.places.filter(([selector]) => selector === ENGAGE_REPOST_MENU || selector === ENGAGE_BUTTONS)).toEqual(
         []
      )
      expect(t.markAttempt).not.toHaveBeenCalled()
      expect(outcomesOf(t.attached)).toEqual(['NOT_TRIED'])
   })

   it('should say UNKNOWN when no repost alert shows after Repost was pressed', async () => {
      const t = setup({ repostShows: false })

      await t.run([
         act({
            kind: 'repost',
            text: 'Worth a read',
         }),
      ])

      expect(t.places).toContainEqual([ENGAGE_BUTTONS, COMPOSE_REPOST_INDEX])
      expect(outcomesOf(t.attached)).toEqual(['UNKNOWN'])
   })

   it('should press nothing and not ask for the attempt when the reaction picker does not open', async () => {
      const t = setup({ pickerOpens: false })

      await t.run([
         act({
            kind: 'react',
            reaction: 'insightful',
         }),
      ])

      expect(t.clicks).toEqual([ENGAGE_PICKER_OPEN])
      expect(t.markAttempt).not.toHaveBeenCalled()
      expect(outcomesOf(t.attached)).toEqual(['NOT_TRIED'])
   })

   it('should count a long comment that LinkedIn cut short as posted', async () => {
      const t = setup({ truncates: true })
      const long = 'This is a long comment that goes on well past the point where LinkedIn cuts it short'

      await t.run([
         act({
            kind: 'comment',
            text: long,
         }),
      ])

      expect(outcomesOf(t.attached)).toEqual(['COMMENTED'])
   })
})
