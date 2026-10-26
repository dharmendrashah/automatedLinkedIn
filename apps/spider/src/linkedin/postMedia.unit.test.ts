import { describe, expect, it } from 'vitest'

import { parseDocumentDialog, parseEditorDialog, parsePostComposer } from './postComposer'
import { composerMarkup } from './postFixture'
import { documentMarkup, editorMarkup } from './postMediaFixture'

describe('parseEditorDialog', () => {
   it('should say the dialog is not open on a page that has none, and on the composer alone', () => {
      expect(parseEditorDialog('<html></html>')).toEqual({
         open: false,
         ready: false,
         refused: false,
         nextIndex: -1,
      })
      expect(parseEditorDialog(composerMarkup()).open).toBe(false)
   })

   it('should say it is ready once Next is not greyed, and where Next sits among the buttons of the page', () => {
      expect(parseEditorDialog(editorMarkup({ nextDisabled: true }))).toMatchObject({
         open: true,
         ready: false,
         refused: false,
      })
      expect(parseEditorDialog(editorMarkup())).toEqual({
         open: true,
         ready: true,
         refused: false,
         nextIndex: 4,
      })
   })

   it('should say LinkedIn refused the file, from its own words', () => {
      expect(
         parseEditorDialog(
            editorMarkup({
               refused: true,
               nextDisabled: true,
            })
         )
      ).toMatchObject({
         open: true,
         refused: true,
         ready: false,
      })
   })
})

describe('parseDocumentDialog', () => {
   it('should say it is open, and whether Done can be pressed once a file was chosen', () => {
      expect(parseDocumentDialog(documentMarkup())).toEqual({
         open: true,
         ready: true,
         refused: false,
         doneIndex: -1,
      })
      expect(parseDocumentDialog(documentMarkup({ doneDisabled: true }))).toMatchObject({
         open: true,
         ready: false,
      })
      expect(parseDocumentDialog(documentMarkup({ chosen: false }))).toMatchObject({
         open: true,
         ready: false,
      })
   })

   it('should find Done by its words when it has no name of its own, and say where it is among the dialog buttons', () => {
      const ready = parseDocumentDialog(documentMarkup({ plain: true }))

      expect(ready).toMatchObject({
         open: true,
         ready: true,
      })
      expect(ready.doneIndex).toBeGreaterThanOrEqual(0)
      expect(
         parseDocumentDialog(
            documentMarkup({
               plain: true,
               doneDisabled: true,
            })
         ).ready
      ).toBe(false)
   })

   it('should say it is not open on another page, and that LinkedIn refused the file', () => {
      expect(parseDocumentDialog(composerMarkup()).open).toBe(false)
      expect(parseDocumentDialog(documentMarkup({ refused: true })).refused).toBe(true)
   })
})

describe('parsePostComposer and the media of a post', () => {
   it('should know whether the composer shows a file ready to post', () => {
      expect(parsePostComposer(composerMarkup()).attachment).toBe(false)
      expect(parsePostComposer(composerMarkup({ attached: true })).attachment).toBe(true)
   })

   it('should let Post come alive with an empty box, which only an attached file does, on the layout with no remove button', () => {
      const bare = parsePostComposer(
         composerMarkup({
            plain: true,
            disabled: true,
         })
      )
      const attached = parsePostComposer(
         composerMarkup({
            plain: true,
            attached: true,
         })
      )

      expect(bare).toMatchObject({
         typed: '',
         canPost: false,
      })
      expect(attached).toMatchObject({
         typed: '',
         canPost: true,
      })
   })
})
