import { type FixtureMessage, messageWindowMarkup, profileMarkup } from './messagingFixture'

// The window a profile's Message link opens for a free message to a member who is not a connection, as the real page has it (recorded
// 2026-11-03, tripti.verma, English; session-2026-11-03T08-44-40-796Z), and the whole compose page it led to in run 96db1845 (the same
// form in `div.msg-convo-wrapper.msg-thread`), with made-up people and text. Only what the readers rely on is here. The banner for a credit is made up (never seen) and marked so in the test that uses it.

export type FixtureInmail = {
   // Over the profile (the default), or the whole compose page.
   layout?: 'window' | 'page'
   // The profile address of the person the window is for, as the card links to it.
   profile?: string
   name?: string
   // What the banner says; none leaves it out.
   banner?: string | null
   subject?: boolean
   composer?: { typed?: string; sendDisabled?: boolean; extra?: string }
}

export const inmailWindowMarkup = ({
   layout = 'window',
   profile = '/in/ada-l/',
   name = 'Ada Lovelace',
   banner = 'Free message |',
   subject = true,
   composer = {},
}: FixtureInmail = {}) =>
   `${
      layout === 'page'
         ? '<div class="msg-convo-wrapper msg-thread msg-thread--pillar msg-compose-container"><header><h2> New message </h2></header>'
         : '<div class="msg-convo-wrapper msg-overlay-conversation-bubble msg-overlay-conversation-bubble--is-active msg-overlay-conversation-bubble--jumbo msg-overlay-conversation-bubble--inmail" role="dialog" aria-label="Messaging" data-view-name="message-overlay-conversation-bubble-item"><header class="msg-overlay-conversation-bubble-header premium-accent-bar"><h2 class="msg-overlay-bubble-header__title truncate"> New message </h2><button class="msg-overlay-bubble-header__control">Close your conversation</button></header>'
   }
<div class="msg-inmail-compose-form-v2"><div class="artdeco-entity-lockup msg-compose__inmail-compose-entity-lockup"><a href="${profile}"><img alt="${name}"></a><div class="artdeco-entity-lockup__content"><div class="msg-compose__occupation"> Founder </div></div></div>
<form class="msg-form msg-form--is-fully-expanded msg-form full-height">${
      banner === null
         ? ''
         : `<section class="msg-inmail-credits-display pv2 ph4"><p class="t-12">${banner}<strong><a href="https://www.linkedin.com/help/linkedin/answer/139">Why?</a></strong></p></section>`
   }
${subject ? '<div class="msg-form__subject"><input name="subject" placeholder="Subject (optional)" type="text"></div>' : ''}
<div class="msg-form__contenteditable t-14 notranslate" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Write a message…">${
      composer.typed ? `<p>${composer.typed}</p>` : '<p>&nbsp;<br></p>'
   }</div>
<input class="msg-form__attachment-upload-input hidden" accept="image/*" type="file"><input class="msg-form__attachment-upload-input hidden" accept="image/*,.ai,.psd,.pdf,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.xls,.xlsx,.txt,.eml,.mov,.mp4" type="file">${composer.extra ?? ''}
<footer class="msg-form__footer"><button class="msg-form__send-btn artdeco-button artdeco-button--circle"${
      composer.sendDisabled === false ? '' : ' disabled=""'
   } type="submit"><span class="artdeco-button__text"> Send </span></button></footer></form></div></div>`

// A profile with its own Message link, and the window when it is open: a window for a free message, or, for a person who is a
// connection, an ordinary conversation window (`ordinary`).
export const inmailProfileMarkup = ({
   messageLink = true,
   inmail,
   ordinary,
   extraWindow,
}: {
   messageLink?: boolean
   inmail?: FixtureInmail
   ordinary?: { title: string; messages?: FixtureMessage[]; blocked?: boolean }
   // A second window left open, for the same person or another.
   extraWindow?: FixtureInmail
} = {}) =>
   `${profileMarkup({ messageLink })}${inmail ? inmailWindowMarkup(inmail) : ''}${extraWindow ? inmailWindowMarkup(extraWindow) : ''}${
      ordinary
         ? messageWindowMarkup({
              title: ordinary.title,
              messages: ordinary.messages ?? [],
              ...(ordinary.blocked
                 ? { blocked: true }
                 : {
                      composer: {
                         typed: '',
                         sendDisabled: true,
                      },
                   }),
           })
         : ''
   }`
