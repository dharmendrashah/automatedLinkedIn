// Markup of the dialogs that take the files of a post, kept to what the reader looks at, as recorded on 2026-10-26: "Editor" for
// photos and a video, "Share a document" for a document. A composer dialog comes first in the page, with buttons of its own, so
// the order of the buttons is the page's.
const COMPOSER_BEHIND = `<dialog data-testid="dialog" open aria-labelledby="dialog-header"><h2 id="dialog-header">0 notifications</h2>
<button type="button" aria-label="Show Emoji Picker"></button><button type="button" data-view-name="share-post" disabled><span>Post</span></button></dialog>`

type Editor = {
   // "Upload from computer" is still "Loading".
   loading?: boolean
   // The Next button is greyed (the upload has not finished).
   nextDisabled?: boolean
   // LinkedIn refused the file.
   refused?: boolean
}

export const editorMarkup = ({ loading = false, nextDisabled = false, refused = false }: Editor = {}) =>
   `<html><body>${COMPOSER_BEHIND}<dialog data-testid="dialog" open aria-labelledby="dialog-header"><h2 id="dialog-header">Editor</h2>
${
   refused
      ? '<div><p>Something went wrong</p><p>File(s) not supported. Upload a supported content type.</p><button type="button"><span>Try again</span></button></div>'
      : `<button type="button"${loading ? ' disabled="" aria-busy="true"' : ''}><span>${loading ? 'Loading' : 'Upload from computer'}</span></button>`
}
<button type="button"><span>Back</span></button><button type="button"${nextDisabled ? ' disabled=""' : ''}><span>Next</span></button></dialog></body></html>`

type Document = {
   // The title field and the file's pages are drawn once a file was chosen.
   chosen?: boolean
   doneDisabled?: boolean
   refused?: boolean
}

export const documentMarkup = ({ chosen = true, doneDisabled = false, refused = false }: Document = {}) =>
   `<html><body>${COMPOSER_BEHIND}<dialog data-testid="dialog" open aria-labelledby="dialog-header"><h2 id="dialog-header">Share a document</h2>
${
   refused
      ? '<div><p>Something went wrong</p><p>File(s) not supported.</p></div>'
      : chosen
        ? '<input type="text" placeholder="Add a descriptive title to your document"><div data-view-name="media-document-share-remove-preview" role="button"></div>'
        : '<button type="button"><span>Choose file</span></button>'
}
<button type="button" data-view-name="media-document-share-cancel"><span>Back</span></button><button type="button" data-view-name="media-document-share-confirm"${doneDisabled || !chosen ? ' disabled=""' : ''}><span>Done</span></button></dialog></body></html>`
