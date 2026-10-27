// Connections markup as the real page has it (the list on /mynetwork/invite-connect/connections/, recorded 2026-10-27 on one account),
// with made-up people and text, for tests of everything that reads it. Only what the readers rely on is here.

export type FixtureConnection = {
   slug: string
   name: string
   headline?: string
   // The line under the name, as the page writes it; none leaves it out.
   connected?: string
   // The member's picture; none draws the initials the page uses for a person without one.
   photo?: string
   // The member's number in the Message link.
   urn?: string
   // The row has no Message link (seen: none; kept to test a row that is missing a part).
   noMessage?: boolean
   // The batch of ten the row was loaded in (the page's own key carries it).
   batch?: number
   // The layout with no `data-view-name` at all (tripti.verma, 2026-10-27): absolute links, a bare Message link.
   plain?: boolean
}

const PROFILE = 'https://www.linkedin.com/in/'

const plainRow = ({
   slug,
   name,
   headline,
   connected,
   urn,
   noMessage,
   batch,
}: Required<Omit<FixtureConnection, 'photo' | 'plain'>>) =>
   `<div componentkey="ConnectionCard_${batch}-${slug}"><a tabindex="0" href="${PROFILE}${slug}/" componentkey="ConnectionCardProfileImage_${batch}-${slug}"><figure componentkey="ConnectionCardProfileImage_${batch}-${slug}"><span data-dynamic-icon-loading=""></span></figure></a><div><div><a tabindex="0" href="${PROFILE}${slug}/" componentkey="0a6f1c52-name-${slug}"><div componentkey="0a6f1c52-name-${slug}"><p>${name}</p>${headline ? `<div><p><span>${headline}</span></p></div>` : ''}</div></a>${connected ? `<p>${connected}</p>` : ''}</div></div><div><div><div data-display-contents="true">${noMessage ? '' : `<a aria-disabled="false" href="/messaging/compose/?profileUrn=urn%3Ali%3Afsd_profile%3A${urn}&amp;recipient=${urn}&amp;interop=msgOverlay" componentkey="53e6d420-message-${slug}" aria-label="Send a message to ${name}"><span><span>Message</span></span></a>`}</div><button type="button" componentkey="384c2311-menu-${slug}" aria-label="More actions for ${name}"><span><span data-dynamic-icon-loading=""></span></span></button></div></div></div>`

export const connectionRow = ({
   slug,
   name,
   headline = '',
   connected = 'Connected on October 27, 2026',
   photo,
   urn = 'ACoAAfixture',
   noMessage = false,
   batch = 0,
   plain = false,
}: FixtureConnection) =>
   plain
      ? plainRow({
           slug,
           name,
           headline,
           connected,
           urn,
           noMessage,
           batch,
        })
      : `<div data-view-name="connections-list"><div componentkey="ConnectionCard_${batch}-${slug}">
<a data-view-name="connections-profile" componentkey="ConnectionCardProfileImage_${batch}-${slug}" href="${PROFILE}${slug}/"><figure data-view-name="connections-profile"><svg></svg>${photo ? `<img src="${photo}">` : ''}</figure></a>
<div><div><a data-view-name="connections-profile" componentkey="name-${slug}" href="${PROFILE}${slug}/"><div componentkey="name-${slug}"><p>${name}</p>${headline ? `<div><p><span>${headline}</span></p></div>` : ''}</div></a>
${connected ? `<p>${connected}</p>` : ''}</div></div>
<div><div>${noMessage ? '' : `<div data-view-name="message-button"><a componentkey="message-${slug}" aria-label="Send a message to ${name}" href="/messaging/compose/?profileUrn=urn%3Ali%3Afsd_profile%3A${urn}"><span><span>Message</span></span></a></div>`}
<button data-view-name="connections-remove-connection-dropdown" componentkey="menu-${slug}" aria-label="More actions for ${name}" type="button"><span></span></button></div></div></div></div>`

type Page = {
   // The number in the heading ("115 connections"); none leaves the heading out.
   total?: number
   // Anything else the page holds, such as the menu or the dialog of a removal.
   extra?: string
}

export const connectionsPage = (rows: FixtureConnection[], { total, extra = '' }: Page = {}) =>
   `<html><body><div componentkey="ConnectionsPage_ConnectionsListHeader"><div>${total === undefined ? '' : `<p>${total} connection${total === 1 ? '' : 's'}</p>`}<div><p>Sort by:</p></div></div></div>${extra}<div data-testid="lazy-column">${rows.map(connectionRow).join('')}</div></body></html>`

// What the page draws after the three dots of a row are pressed, and after "Remove connection" is chosen (recorded 2026-10-27).
export const REMOVE_MENU =
   '<div role="menu"><div role="menuitem" data-view-name="connections-remove" componentkey="menu-item"><div><div><p>Remove connection</p></div></div></div></div>'

// The same without the attributes the second layout lacks. Its real menu and dialog were not seen (unverified), so this is only what
// the reader relies on: a menu item and dialog buttons that say their words.
export const PLAIN_REMOVE_MENU =
   '<div role="menu"><div role="menuitem" componentkey="menu-item"><div><div><p>Remove connection</p></div></div></div></div>'

export const removeDialog = (firstName: string, plain = false) =>
   `<dialog data-testid="dialog"><button aria-label="Dismiss"><span></span></button><div><div data-testid="dialog-content"><div><h2>Remove Connection</h2><hr role="presentation"><p>Are you sure you want to remove ${firstName} as a connection?</p><hr role="presentation"><div><button${plain ? '' : ' data-view-name="connections-cancel-removed"'}><span><span>Cancel</span></span></button><button${plain ? '' : ' data-view-name="connections-remove"'}><span><span>Remove connection</span></span></button></div></div></div></div></dialog>`
