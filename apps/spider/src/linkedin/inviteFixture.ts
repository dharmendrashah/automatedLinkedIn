// Structure-only markup for the invite readers (.plan/network-invites.md); no real names or text. Follows the recordings of
// 2026-10-30: the person's link three times (one absolute with a `lipi` query); a profile whose top card has only Follow, Message
// and More, with Connect a `role="menuitem"` link of the More menu; the window in a shadow root (added at the end of the body)
// as an artdeco modal with "Add a note" and "Send without a note" named by `aria-label`; the note window seen only on video
// ("Add a note to your invitation", the notes left this month, a box counting to 200, Cancel and a Send that waits for words).
// The pending button's label, the notices and the Sent list are not recorded.

const connect = (slug: string, name: string, member: string, href = `/preload/custom-invite/?vanityName=${slug}`) =>
   `<a href="${href}" componentkey="ConnectButtonstate:invitation:urn:li:member:${member}_connect" aria-label="Invite ${name} to connect"><span>Connect</span></a>`

// A profile with the person's own Connect links (sticky header, top card, an absolute copy), or with Connect only in the More menu
// (`own` false), and two people suggested beside it. `menuOpen` draws the More menu, with Connect in it unless `menuConnect` is false.
export const profileMarkup = ({
   slug = 'ada-lovelace',
   name = 'Ada Lovelace',
   own = true,
   pending = false,
   menuOpen = false,
   menuConnect = true,
}: {
   slug?: string
   name?: string
   own?: boolean
   pending?: boolean
   menuOpen?: boolean
   menuConnect?: boolean
} = {}) => `<main>
   <nav><ul><li><button aria-label="More" aria-expanded="false">More</button></li></ul></nav>
   <header>${own ? connect(slug, name, '736436677') : ''}</header>
   <section><h1>${name}</h1>
      ${own ? connect(slug, name, '736436677', `https://www.linkedin.com/preload/custom-invite/?vanityName=${slug}&amp;lipi=urn%3Ali%3Apage`) : ''}
      ${own ? connect(slug, name, '736436677') : ''}
      ${pending ? `<button aria-label="Pending, click to withdraw invitation sent to ${name}">Pending</button>` : ''}
      <a href="/messaging/compose/?profileUrn=x">Message</a>
      <button componentkey="top-card-more" aria-expanded="${menuOpen}" type="button"><span>More</span></button>
   </section>
   <aside>
      <a href="https://www.linkedin.com/in/grace-hopper/">Grace Hopper</a>${connect('grace-hopper', 'Grace Hopper', '1006887718')}
      <a href="https://www.linkedin.com/in/alan-turing/">Alan Turing</a>${connect('alan-turing', 'Alan Turing', '1159622602')}
      <button aria-label="Pending, click to withdraw invitation sent to Alan Turing">Pending</button>
   </aside>
   ${
      menuOpen
         ? `<div role="menu"><div role="menuitem">Save to PDF</div>${
              menuConnect
                 ? `<a href="/preload/custom-invite/?vanityName=${slug}" componentkey="ConnectButtonstate:invitation:urn:li:member:1011546170_connect" role="menuitem"><p>Connect</p></a>`
                 : ''
           }<a href="https://www.linkedin.com/in/${slug}/" role="menuitem">Report</a></div>`
         : ''
   }
   <div id="interop-outlet" data-testid="interop-shadowdom"></div>
</main>`

// The window the Connect click opens, as the content of the shadow root: the question and its two buttons, then the note window once
// Add a note is pressed, whose Send waits for words.
export const inviteDialogMarkup = ({
   note = false,
   typed = false,
   email = false,
   limit = false,
   upsell = false,
}: {
   note?: boolean
   typed?: boolean
   email?: boolean
   limit?: boolean
   upsell?: boolean
} = {}) => `<div data-test-modal="" role="dialog" class="artdeco-modal send-invite">
   <button aria-label="Dismiss"></button>
   ${limit ? '<p>You’ve reached the weekly invitation limit</p><button>Got it</button>' : ''}
   ${email ? '<label>Email</label><input type="email">' : ''}
   ${upsell ? '<h2>Personalize your invitations with Premium</h2><button>Try Premium</button>' : ''}
   ${
      note
         ? `<h2>Add a note to your invitation</h2><p>2 personalized invitations remaining for this month.</p><textarea name="message" placeholder="Ex: We know each other from…"></textarea><span>0/200</span><button>Cancel</button><button ${typed ? '' : 'disabled'}>Send</button>`
         : limit || upsell
           ? ''
           : '<h2>Add a note to your invitation?</h2><p>Personalize your invitation.</p><button aria-label="Add a note"><span>Add a note</span></button><button aria-label="Send without a note"><span>Send without a note</span></button>'
   }
</div>`

// The Sent list of "Manage invitations" (recorded 2026-10-30), one row per person: the photo and name link to the profile, and
// Withdraw is a link named after the person.
export const sentMarkup = (slugs: string[]) =>
   `<main><section><div data-testid="lazy-column">${slugs
      .map(
         slug =>
            `<div role="listitem" componentkey="auto-component-${slug}"><div><a href="https://www.linkedin.com/in/${slug}/"><figure><img alt="Person’s profile picture"></figure></a><div><p>Person</p><p><span>Sent 1 minute ago</span></p></div><div><a aria-disabled="false" href="https://www.linkedin.com/mynetwork/invitation-manager/sent/" componentkey="w-${slug}" aria-label="Withdraw invitation sent to Person"><span><span>Withdraw</span></span></a></div></div></div>`
      )
      .join('')}</div></section></main>`

// The window Withdraw opens: Cancel, and a Withdraw button named after the person. The ad windows of the page are dialogs too.
export const withdrawDialogMarkup = `<dialog data-testid="dialog" aria-labelledby="dialog-header" open=""><div data-testid="dialog-content"><h2 id="dialog-header">Withdraw invitation</h2><p>If you withdraw now, you won’t be able to resend to this person for up to 3 weeks.</p><button type="button">Cancel</button><button aria-label="Withdraw invitation sent to Person" type="button">Withdraw</button></div></dialog><dialog><p>Ad Options</p><button>Hide or report this ad</button></dialog>`
