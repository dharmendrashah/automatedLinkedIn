import { describeError } from '../../browsing/errors'
import { handsOf } from '../../browsing/hands'
import { createReader } from '../../browsing/reader'
import { compactHtml } from '../../browsing/snapshot'
import {
   POST_AUDIENCE_CHIP,
   POST_BUTTON,
   POST_COMMENTS_CHIP,
   POST_COMMENT_OPTIONS,
   POST_COMPOSE_PATH,
   POST_DIALOG_BUTTON,
   POST_DOCUMENT_DONE,
   POST_DOCUMENT_INPUT,
   POST_DOCUMENT_LINK,
   POST_DOCUMENT_TITLE,
   POST_EDITOR,
   POST_FEED_PATH,
   POST_MEDIA_BUTTON,
   POST_MORE_TYPES,
   POST_OPTION,
   POST_PHOTO_INPUT,
   POST_START,
   POST_VIDEO_INPUT,
} from '../../linkedin/markup'
import { PACE } from '../../linkedin/pace'
import {
   parseDocumentDialog,
   parseEditorDialog,
   parsePostComposer,
   parsePostOptions,
   parsePostResult,
} from '../../linkedin/postComposer'
import { SignedOut, createSession } from '../../linkedin/session'
import { type TaskContext, VisitError } from '../defineTask'
import { type Fetched } from '../uploads'

type Context = Pick<
   TaskContext,
   'browser' | 'visit' | 'pause' | 'log' | 'warn' | 'attach' | 'markAttempt' | 'postFiles'
>

// How the page names who a post goes to, for each audience a run can ask for.
export const AUDIENCES = {
   ANYONE: 'Anyone',
   CONNECTIONS: 'Connections only',
} as const

// The same for who may comment.
export const COMMENTERS = {
   ANYONE: 'Anyone',
   CONNECTIONS: 'Connections only',
   OFF: 'Off',
} as const

export type Audience = keyof typeof AUDIENCES
export type Commenters = keyof typeof COMMENTERS

// A file of the post, told by where brain keeps it and what it is.
export type PostFile = {
   id: string
   name: string
   kind: 'PHOTOS' | 'VIDEO' | 'DOCUMENT'
}

export type PostInput = {
   // The words of the post, with a link typed in them when it has one (LinkedIn draws the preview card by itself). May be empty
   // when there are files.
   text: string
   // Up to ten photos, or one video, or one document.
   files: PostFile[]
   audience: Audience
   comments: Commenters
}

// POSTED: the page said the post went and gave its address. POSTED_NO_LINK: it said so and gave none. UNKNOWN: Post was pressed and
// the page never said (nothing is typed again for it). NO_COMPOSER: the page offered no place to write. WRONG_AUDIENCE and
// WRONG_COMMENTS: the account's settings are not the ones asked for and could not be changed, so nothing was typed. FAILED: nothing
// was posted (NO_FILES: they could not be fetched; ATTACH: the page took none; UPLOAD: LinkedIn never finished taking them;
// FILE_REFUSED: LinkedIn said a file is not supported). SIGNED_OUT: LinkedIn asked for a sign-in.
export type PostResult =
   | { outcome: 'POSTED'; link: string }
   | { outcome: 'POSTED_NO_LINK' | 'UNKNOWN' | 'NO_COMPOSER' | 'SIGNED_OUT' | 'WRONG_COMMENTS' }
   | { outcome: 'WRONG_AUDIENCE'; found: string }
   | {
        outcome: 'FAILED'
        why: 'TYPING' | 'POST_DISABLED' | 'POST_NOT_CLICKED' | 'NO_FILES' | 'ATTACH' | 'UPLOAD' | 'FILE_REFUSED'
     }

type Deps = {
   random?: () => number
   now?: () => number
}

// How many times the page is looked at for the box (it draws a grey skeleton first), for the Post button to come alive once the
// words are in, and for the message that says the post went, which showed about two seconds after Post in the recording.
const READY_LOOKS = 20
// Looks at the compose address before "Start a post" is pressed, and after the first press before the feed is tried.
const QUICK_LOOKS = 6
const START_LOOKS = 8
const ENABLE_LOOKS = 8
const RESULT_LOOKS = 15
// Looks that go on once the page said the post went, for its address to show.
const LINK_LOOKS = 3
// How many looks at a dialog for its file input to be there, and at its Next or Done for the upload to finish: the files of a post
// are at most 20 MB, so about two minutes is generous.
const DIALOG_LOOKS = 10
const UPLOAD_LOOKS = 80
// The title LinkedIn takes for a document is at most this many characters.
const TITLE_MAX = 58
// How long the post just made stays open before the run leaves it.
const LOOK_AT_POST_MS = 10_000

const PAUSES = {
   open: [1500, 3500],
   click: [600, 1400],
   typed: [800, 2000],
   // The preview card LinkedIn draws once a link is in the words.
   preview: [2500, 4500],
   sent: [1200, 2400],
   look: [900, 1600],
} as const

const LINK_IN_WORDS = /https?:\/\//i

// Words as the box holds them, compared without any space: a new line may come back as a paragraph or a break.
const squash = (value: string) => value.replace(/\s+/g, '')

// Writes one post as the signed-in member does: opens the composer, checks who it posts to, clicks the box, types the words at a
// person's pace, presses Post and waits for LinkedIn to say it went (.plan/posting-send-task.md). The words never reach the log.
export const sendPost = async (
   context: Context,
   baseUrl: string,
   input: PostInput,
   { random = Math.random, now = Date.now }: Deps = {}
): Promise<PostResult> => {
   const { browser, visit, pause, log, warn, attach, markAttempt } = context
   const hands = handsOf(browser)
   const reader = createReader({
      hands,
      pause,
      random,
      now,
      pace: PACE,
   })
   const session = createSession({
      browser,
      hands,
      visit,
      log,
      baseUrl,
   })

   // Empties the box of what was typed, so no draft of it stays on the account's page; it is no help when it cannot.
   const clearBox = async () => {
      await hands.press('ControlOrMeta+A')
      await hands.press('Delete')
   }

   // The page as it is once the box and the Post button are there; as it is after the last look when they never come.
   const settled = async (looks = READY_LOOKS) => {
      let html = await hands.html()

      for (let look = 0; look < looks && !parsePostComposer(html).present; look += 1) {
         await reader.wait(PAUSES.look)
         html = await hands.html()
      }

      return html
   }

   // LinkedIn can draw the feed on the compose address and never open the window (staging, 2026-10-26: a hydration error after the page
   // drew). A person presses "Start a post"; so does the task, here and then on the feed, before it says there is no composer.
   const openByStart = async () => {
      log('The composer did not open; pressing Start a post')

      // The box is covered while the window is still drawing (through a proxy it took 16 s, 2026-10-26), so a press that finds
      // nothing to press still waits here before the page is left.
      if (await hands.clickSelector(POST_START)) {
         await reader.wait(PAUSES.click)
      }

      const here = parsePostComposer(await settled(START_LOOKS))

      if (here.present) {
         return here
      }

      await session.acceptConsent(await session.open(`${baseUrl}${POST_FEED_PATH}`))
      await reader.wait(PAUSES.open)

      if (await hands.clickSelector(POST_START)) {
         await reader.wait(PAUSES.click)
      }

      return parsePostComposer(await settled())
   }

   // Whether the Post button comes alive once the words are typed (it is greyed until the page has taken them in).
   const postEnabled = async () => {
      for (let look = 0; look < ENABLE_LOOKS; look += 1) {
         if (parsePostComposer(await hands.html()).canPost) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // After Post was pressed: looks for the message that says the post went, and for its address. A look that cannot read the page
   // (it is moving to the feed) is a look lost, not the end.
   const confirm = async (): Promise<PostResult> => {
      await reader.wait(PAUSES.sent)

      let posted = false
      let linkLooks = LINK_LOOKS

      for (let look = 0; look < RESULT_LOOKS && linkLooks > 0; look += 1) {
         try {
            const result = parsePostResult(await hands.html())

            if (result.link) {
               return {
                  outcome: 'POSTED',
                  link: result.link,
               }
            }

            if (result.posted) {
               posted = true
               linkLooks -= 1
            }
         } catch {
            // Looked at the page while it moved.
         }

         await reader.wait(PAUSES.look)
      }

      return { outcome: posted ? 'POSTED_NO_LINK' : 'UNKNOWN' }
   }

   // Opens the pop-up of who can see the post and picks the row with the words asked for. The rows were only seen on video, so they
   // are found by their words; a pop-up with no such row is closed and its markup kept for study. The caller reads the result back.
   const pickAudience = async () => {
      await hands.clickSelector(POST_AUDIENCE_CHIP)
      await reader.wait(PAUSES.click)

      const html = await hands.html()
      const index = parsePostOptions(html).findIndex(
         label => label.toLowerCase() === AUDIENCES[input.audience].toLowerCase()
      )

      if (index >= 0 && (await hands.clickNth(POST_OPTION, index, ''))) {
         await reader.wait(PAUSES.click)

         return
      }

      log('The audience pop-up showed no row to pick')
      attach('audience-popup.html', compactHtml(html), 'text/html')
      await hands.press('Escape')
      await reader.wait(PAUSES.click)
   }

   // The same for who may comment, whose rows have names of their own.
   const pickComments = async () => {
      if (await hands.clickSelector(POST_COMMENTS_CHIP)) {
         await reader.wait(PAUSES.click)
         await hands.clickSelector(POST_COMMENT_OPTIONS[input.comments])
         await reader.wait(PAUSES.click)
      }
   }

   const is = (found: string, wanted: string) => found.toLowerCase() === wanted.toLowerCase()

   // A member looks at their post once it is up: it is opened, stays for a while, and the feed is opened again. Whatever goes wrong
   // here never changes the answer, since the post is already made.
   const lookAtPost = async (link: string) => {
      try {
         await session.open(link)
         log('Opened the post')
         await pause(LOOK_AT_POST_MS)
         await session.openFeed()
         log('Left the post')
      } catch (error) {
         warn(describeError(error, 'The post could not be opened to look at it'))
      }
   }

   let fetched: Fetched | undefined

   // Gives the files to the dialog that has just opened (LinkedIn adds the input a moment after it draws the dialog).
   const giveFiles = async (selector: string, paths: string[]) => {
      for (let look = 0; look < DIALOG_LOOKS; look += 1) {
         if (await hands.attachFiles(selector, paths)) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Whether the composer shows the files as attached once the dialog is closed.
   const shown = async () => {
      for (let look = 0; look < READY_LOOKS; look += 1) {
         if (parsePostComposer(await hands.html()).attachment) {
            return true
         }

         await reader.wait(PAUSES.look)
      }

      return false
   }

   // Photos or a video: the Media dialog takes them, and LinkedIn greys Next until the upload has finished, so Next is the answer.
   const attachMedia = async (kind: PostFile['kind'], paths: string[]): Promise<PostResult | undefined> => {
      if (!(await hands.clickSelector(POST_MEDIA_BUTTON))) {
         log('The page has no Media button')

         return {
            outcome: 'FAILED',
            why: 'ATTACH',
         }
      }

      await reader.wait(PAUSES.click)

      if (!(await giveFiles(kind === 'VIDEO' ? POST_VIDEO_INPUT : POST_PHOTO_INPUT, paths))) {
         log('The Media dialog offered no place to give files')

         return {
            outcome: 'FAILED',
            why: 'ATTACH',
         }
      }

      for (let look = 0; look < UPLOAD_LOOKS; look += 1) {
         const dialog = parseEditorDialog(await hands.html())

         if (dialog.refused) {
            log('LinkedIn did not take the files')

            return {
               outcome: 'FAILED',
               why: 'FILE_REFUSED',
            }
         }

         if (dialog.ready) {
            await reader.wait(PAUSES.click)

            return (await hands.clickNth(POST_DIALOG_BUTTON, dialog.nextIndex, '')) && (await shown())
               ? undefined
               : {
                    outcome: 'FAILED',
                    why: 'ATTACH',
                 }
         }

         await reader.wait(PAUSES.look)
      }

      log('The upload did not finish')

      return {
         outcome: 'FAILED',
         why: 'UPLOAD',
      }
   }

   // A document: its own dialog, reached through "Expand content types". It wants a title, which is made from the file's name.
   const attachDocument = async (file: PostFile, paths: string[]): Promise<PostResult | undefined> => {
      await hands.clickSelector(POST_MORE_TYPES)
      await reader.wait(PAUSES.click)

      if (!(await hands.clickSelector(POST_DOCUMENT_LINK))) {
         log('The page has no way to add a document')

         return {
            outcome: 'FAILED',
            why: 'ATTACH',
         }
      }

      await reader.wait(PAUSES.click)

      if (!(await giveFiles(POST_DOCUMENT_INPUT, paths))) {
         log('The document dialog offered no place to give a file')

         return {
            outcome: 'FAILED',
            why: 'ATTACH',
         }
      }

      for (let look = 0; look < UPLOAD_LOOKS; look += 1) {
         const dialog = parseDocumentDialog(await hands.html())

         if (dialog.refused) {
            log('LinkedIn did not take the document')

            return {
               outcome: 'FAILED',
               why: 'FILE_REFUSED',
            }
         }

         if (dialog.ready) {
            const title = file.name
               .replace(/\.[^.]*$/, '')
               .replace(/[_-]+/g, ' ')
               .trim()
               .slice(0, TITLE_MAX)

            if (title !== '' && (await hands.clickSelector(POST_DOCUMENT_TITLE))) {
               await hands.press('ControlOrMeta+A')
               await hands.typeKeys(title)
               await reader.wait(PAUSES.click)
            }

            return (await hands.clickSelector(POST_DOCUMENT_DONE)) && (await shown())
               ? undefined
               : {
                    outcome: 'FAILED',
                    why: 'ATTACH',
                 }
         }

         await reader.wait(PAUSES.look)
      }

      log('The upload did not finish')

      return {
         outcome: 'FAILED',
         why: 'UPLOAD',
      }
   }

   // Fetches the files of the run and gives them to LinkedIn; says why when it cannot.
   const attachFiles = async (): Promise<PostResult | undefined> => {
      const [first] = input.files

      if (!first) {
         return undefined
      }

      if (!context.postFiles) {
         log('The files cannot be fetched here')

         return {
            outcome: 'FAILED',
            why: 'NO_FILES',
         }
      }

      let got: Fetched

      try {
         got = await context.postFiles.fetch(
            input.files.map(({ id, name }) => ({
               id,
               name,
            }))
         )
         fetched = got
      } catch (error) {
         warn(describeError(error, 'The files could not be fetched'))

         return {
            outcome: 'FAILED',
            why: 'NO_FILES',
         }
      }

      log(`Fetched ${input.files.length} files`)

      return first.kind === 'DOCUMENT' ? attachDocument(first, got.paths) : attachMedia(first.kind, got.paths)
   }

   let pressed = false

   try {
      let loaded = true

      try {
         await session.acceptConsent(await session.open(`${baseUrl}${POST_COMPOSE_PATH}`))
         log('Opened the composer')
      } catch (error) {
         // LinkedIn answered the compose address with a 404 (staging, 2026-10-26): the window is opened from the feed instead.
         if (!(error instanceof VisitError && error.reason === 'load')) {
            throw error
         }

         loaded = false
         log('The compose address did not load')
      }

      await reader.wait(PAUSES.open)

      let composer = loaded ? parsePostComposer(await settled(QUICK_LOOKS)) : undefined

      if (!composer?.present) {
         composer = await openByStart()
      }

      if (!composer.present) {
         log('The page has no place to write a post')
         // A composer that is on screen but not read (the box or the Post button markup changed) can only be fixed from the page.
         attach('composer-missing.html', compactHtml(await hands.html()), 'text/html')

         return { outcome: 'NO_COMPOSER' }
      }

      // The account's settings are changed as a person would, and read back: a post never goes to a wider audience than asked for.
      if (!is(composer.audience, AUDIENCES[input.audience])) {
         await pickAudience()
         composer = parsePostComposer(await hands.html())

         if (!is(composer.audience, AUDIENCES[input.audience])) {
            log('The audience could not be changed to the one asked for')

            return {
               outcome: 'WRONG_AUDIENCE',
               found: composer.audience,
            }
         }
      }

      if (!is(composer.comments, COMMENTERS[input.comments])) {
         await pickComments()
         composer = parsePostComposer(await hands.html())

         if (!is(composer.comments, COMMENTERS[input.comments])) {
            log('Who may comment could not be changed to what was asked for')

            return { outcome: 'WRONG_COMMENTS' }
         }
      }

      // Asked before anything is typed: a command delivered again after Post may have been pressed writes nothing.
      if (!(await markAttempt())) {
         log('This post was started before')

         return { outcome: 'UNKNOWN' }
      }

      const failed = await attachFiles()

      if (failed) {
         return failed
      }

      if (input.text !== '') {
         await hands.clickSelector(POST_EDITOR)
         await reader.wait(PAUSES.click)

         if (
            !(await hands.typeKeys(input.text)) ||
            squash(parsePostComposer(await hands.html()).typed) !== squash(input.text)
         ) {
            await clearBox().catch(() => undefined)

            return {
               outcome: 'FAILED',
               why: 'TYPING',
            }
         }
      }

      await reader.wait(LINK_IN_WORDS.test(input.text) ? PAUSES.preview : PAUSES.typed)

      if (!(await postEnabled())) {
         log('The Post button stayed greyed')
         await clearBox().catch(() => undefined)

         return {
            outcome: 'FAILED',
            why: 'POST_DISABLED',
         }
      }

      // Pressed by its name, or by its place among the dialog buttons on the composer whose buttons have none (2026-10-27).
      const { postIndex } = parsePostComposer(await hands.html())

      if (
         !(postIndex >= 0
            ? await hands.clickNth(POST_DIALOG_BUTTON, postIndex, '')
            : await hands.clickSelector(POST_BUTTON))
      ) {
         log('The Post button could not be clicked')
         await clearBox().catch(() => undefined)

         return {
            outcome: 'FAILED',
            why: 'POST_NOT_CLICKED',
         }
      }

      pressed = true
      log('Pressed Post')

      const result = await confirm()

      if (result.outcome === 'POSTED') {
         await lookAtPost(result.link)
      }

      return result
   } catch (error) {
      if (error instanceof SignedOut) {
         return { outcome: 'SIGNED_OUT' }
      }

      // Once Post was pressed, whatever went wrong may have come after the post went.
      if (pressed) {
         warn(describeError(error, 'The page could not be read after Post'))

         return { outcome: 'UNKNOWN' }
      }

      throw error
   } finally {
      await fetched?.remove().catch(() => undefined)
   }
}
