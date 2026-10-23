// Messaging markup as the real page has it (recorded 2026-10-22), with made-up people and text, for tests of everything that
// reads it. Only what the readers rely on is here.

export type FixtureMessage = {
   id: string
   from: 'THEM' | 'ME'
   // Present on the first message of a group, with its time; the others of the group carry neither.
   name?: string
   profile?: string
   time?: string
   // The date heading shown above the first message of a day.
   day?: string
   text?: string
   image?: string
   // Where the picture comes from, when it has an address.
   imageSrc?: string
}

export type FixtureThread = {
   title: string
   profile?: string
   messages: FixtureMessage[]
   // The place to write a reply, as the page draws it; none when left out.
   composer?: {
      typed?: string
      sendDisabled?: boolean
      // Markup inside the box's form besides the text, such as what is attached and how far it is uploaded.
      extra?: string
   }
}

export type FixtureRow = {
   title: string
   when: string
   snippet: string
   unread?: boolean
   // The page keeps a row it has not drawn yet (or has drawn and dropped) as an empty item with no click target.
   placeholder?: boolean
}

const message = ({ id, from, name, profile, time, day, text, image, imageSrc }: FixtureMessage) =>
   `<li class="msg-s-message-list__event">${day ? `<time class="msg-s-message-list__time-heading"> ${day} </time>` : ''}
<div class="msg-s-event-listitem ${from === 'THEM' ? 'msg-s-event-listitem--other' : ''}" data-event-urn="urn:li:msg_message:(urn:li:fsd_profile:me,${id})" data-view-name="message-list-item">
${profile ? `<a href="${profile}" class="msg-s-event-listitem__link"><img class="msg-s-event-listitem__profile-picture" alt="${name ?? ''}"></a>` : ''}
${name ? `<div class="msg-s-message-group__meta"><a href="${profile ?? '#'}"><span class="msg-s-message-group__profile-link msg-s-message-group__name"> ${name} </span></a><time class="msg-s-message-group__timestamp"> ${time ?? ''} </time></div>` : ''}
<div class="msg-s-event-listitem__message-bubble"><div class="msg-s-event-listitem__actions-container"><button aria-label="Reply to this message">Reply</button></div>
${image ? `<img class="msg-s-event-message__image"${imageSrc ? ` src="${imageSrc}"` : ''} alt="${image}">` : ''}
${text === undefined ? '' : `<div class="msg-s-event-with-indicator"><div class="msg-s-event__content"><p class="msg-s-event-listitem__body"><!---->${text}<!----></p></div></div>`}
</div></div></li>`

const composerMarkup = (composer: FixtureThread['composer']) =>
   composer
      ? `<form class="msg-form msg-form--thread-footer-feature"><div class="msg-form__contenteditable t-14 notranslate" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Write a message…">${
           composer.typed ? `<p>${composer.typed}</p>` : '<p><br></p>'
        }</div>${composer.extra ?? ''}<footer class="msg-form__footer"><button class="msg-form__send-button artdeco-button artdeco-button--1"${
           composer.sendDisabled === false ? '' : ' disabled=""'
        } type="submit">Send</button></footer></form>`
      : ''

export const threadMarkup = ({ title, profile, messages, composer }: FixtureThread) =>
   `<div class="msg-thread"><div class="msg-title-bar">${
      profile ? `<a class="msg-thread__link-to-profile" href="${profile}">` : '<div>'
   }<h2 class="msg-entity-lockup__entity-title"> ${title} </h2>${profile ? '</a>' : '</div>'}</div>
<div class="msg-s-message-list msg-s-message-list--scroll-buffer"><ul class="msg-s-message-list-content"><li class="msg-s-message-list__top-of-list"></li>${messages
      .map(message)
      .join('')}</ul></div>${composerMarkup(composer)}</div>`

const row = ({ title, when, snippet, unread, placeholder }: FixtureRow) =>
   placeholder
      ? '<li class="ember-view msg-conversation-listitem msg-conversations-container__convo-item"></li>'
      : `<li class="ember-view msg-conversation-listitem msg-conversations-container__convo-item"><div class="msg-conversation-listitem__link" tabindex="0">
<div class="msg-conversation-card__content--selectable"><h3 class="msg-conversation-listitem__participant-names"><span> ${title} </span></h3>
<time class="msg-conversation-listitem__time-stamp"> ${when} </time>
<p class="msg-conversation-card__message-snippet${unread ? ' msg-conversation-card__message-snippet--unread' : ''}"> ${snippet} </p></div></div>
<button class="msg-thread-actions__control">Options</button></li>`

// `more` adds the beacon the page keeps at the bottom of the list while it can load more conversations.
export const inboxMarkup = (rows: FixtureRow[], more = false) =>
   `<ul class="msg-conversations-container__conversations-list">${rows.map(row).join('')}${
      more
         ? '<li><div data-test-msg-cross-pillar-visible-beacon=""></div><button>Load more conversations</button></li>'
         : ''
   }</ul>`
