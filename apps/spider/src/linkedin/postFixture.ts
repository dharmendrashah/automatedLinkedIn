// Markup of LinkedIn's post composer and of what it shows after a post, kept to the parts the reader looks at, as recorded on
// 2026-10-25 (.plan/posting-send-task.md). Class names are left out: they are generated and change.
type Composer = {
   // The text of the box; none leaves it empty.
   typed?: string[]
   audience?: string
   // Who may comment, as the chip names it.
   comments?: string
   // The rows of the pop-up that is open (who can see the post), as the page lists them; none means no pop-up.
   popup?: string[]
   // The Post button is greyed and says it is busy (it was just pressed).
   busy?: boolean
   // A file is attached and shown with its remove button.
   attached?: boolean
   // The Post button is greyed because nothing was typed.
   disabled?: boolean
   // No box at all (the page is still drawing, or LinkedIn offers no composer).
   noEditor?: boolean
   // The variant seen on one account on 2026-10-27: the buttons carry no data-view-name, so Post is found by its words.
   plain?: boolean
}

export const composerMarkup = ({
   typed = [],
   audience = 'Connections only',
   comments = 'Anyone',
   popup = [],
   attached = false,
   busy = false,
   disabled = false,
   noEditor = false,
   plain = false,
}: Composer = {}) =>
   `<html><body><dialog data-testid="dialog" open><div data-sdui-screen="com.linkedin.sdui.flagshipnav.sharing.ShareCompose">
<div role="button" tabindex="0" data-view-name="share-view-actor-list"><div aria-label="Dharmendra Soni"><p><span>Dharmendra Soni</span></p></div></div>
<div role="button" tabindex="0"><div aria-label="Post to ${audience}"><p><span>Post to ${audience}</span></p></div></div>
<div role="button" tabindex="0" data-view-name="share-view-comment-controls-list"><div aria-label="Comments: ${comments}"><p><span>Comments: ${comments}</span></p></div></div>
${
   noEditor
      ? ''
      : `<div data-testid="ui-core-tiptap-text-editor-wrapper"><div contenteditable="true" role="textbox" class="tiptap ProseMirror" componentkey="ShareBox_textEditor">${
           typed.length > 0 ? typed.map(line => `<p>${line}</p>`).join('') : '<p class="is-empty"><br></p>'
        }</div></div>`
}
${attached ? (plain ? '<figure><img src="blob:https://www.linkedin.com/x"></figure>' : '<figure data-view-name="image"></figure><button type="button" data-view-name="share-detour-preview-remove" aria-label="Close"></button>') : ''}
<div id="ShareBoxlinkPreview" componentkey="ShareBoxlinkPreview"></div>
<button type="button" aria-label="Show Emoji Picker" data-view-name="comment-emoji-picker"></button>
<button type="button" aria-label="Media" data-view-name="share-sharebox-bottom-bar-media"></button>
<button type="button"${plain ? ' componentkey="acdd9111-867c-4406-a0e1-6a30738b69f6"' : ' data-view-name="share-post"'}${busy || disabled ? ' disabled=""' : ''}${busy ? ' aria-busy="true"' : ''}><span>${
      busy ? '<div></div>' : '<span>Post</span>'
   }</span></button>
${
   popup.length > 0
      ? `<div popover="manual">${popup
           .map(
              label =>
                 `<div role="radio" aria-checked="false"><div><p>${label}</p><p>${label} on or off LinkedIn</p></div></div>`
           )
           .join('')}</div>`
      : ''
}
</div></dialog></body></html>`

type Posted = {
   // The address behind "View post" in the window that says the post was successful (a share id).
   window?: string
   // The address behind "View post" in the toast at the bottom of the page (an activity id).
   toast?: string
}

// The feed once a post went: a window with a link to the post, a toast with another, and other people's posts, whose own links
// must never be taken for ours.
export const postedMarkup = ({ window, toast }: Posted = {}) =>
   `<html><body><dialog data-testid="dialog" open><div data-sdui-screen="com.linkedin.sdui.flagshipnav.sharing.SharingAfterPostNBADat"><div><p>Your post was successful</p>${
      window ? `<a tabindex="0" href="${window}"><p>View post</p></a>` : ''
   }</div></div><section><div role="alert"><div><p>Post successful.${
      toast ? `<a href="${toast}"><strong>View post</strong></a>` : ''
   }</p></div></div></section></dialog>
<main><article><a href="https://www.linkedin.com/feed/update/urn:li:activity:1111111111111111111/">Someone else's post</a></article></main></body></html>`

// The feed with no post made: other people's posts and nothing about ours.
export const feedMarkup = () =>
   `<html><body><main><article><a href="https://www.linkedin.com/feed/update/urn:li:activity:1111111111111111111/">View post</a></article></main></body></html>`
