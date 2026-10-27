// Connection-request markup as the real page has it (the rows on /mynetwork/invitation-manager/ and the preview on /mynetwork/grow/,
// recorded 2026-10-27 on one account), with made-up people and text, for tests of everything that reads it. Only what the readers
// rely on is here.

export type FixtureInvitation = {
   id: string
   slug: string
   name: string
   headline?: string
   mutual?: string
   // The lines of what the sender wrote; the page cuts them behind "show more".
   note?: string[]
   // The sender's picture; none draws the placeholder the page uses for a person without one.
   photo?: string
   badge?: 'Verified' | 'Premium'
   // The page draws the name tag empty, which the reader cannot use.
   nameless?: boolean
}

const PROFILE = 'https://www.linkedin.com/in/'

const noteMarkup = (first: string, lines: string[]) =>
   `<div componentkey="note-${first}"><p><span data-testid="expandable-text-box">${lines.join('<br>')}<button data-testid="expandable-text-button" type="button"><span>…</span><span>show more</span></button></span></p>
<p><a href="/messaging/compose/?profileUrn=urn%3Ali%3Afsd_profile%3AACoAAfixture"><strong>Reply to ${first}</strong></a></p><button aria-label="Show more actions" type="button"></button></div>`

export const invitationRow = ({
   id,
   slug,
   name,
   headline,
   mutual,
   note,
   photo,
   badge,
   nameless,
}: FixtureInvitation) => {
   const [first = name] = name.split(' ')

   return `<div role="listitem" componentkey="urn:li:invitation:${id}" aria-label=""><div>
<a href="${PROFILE}${slug}/"><div aria-label="${name}’s profile picture"><figure><svg></svg>${photo ? `<img src="${photo}">` : ''}</figure></div></a>
<div><div><p><a aria-label="View ${name}’s profile" href="${PROFILE}${slug}/"><strong>${nameless ? '' : name}${badge ? `<span></span><span role="img" aria-label="${badge}"><svg></svg></span>` : ''}</strong></a><span></span> wants to connect</p>
${headline ? `<div><figure><svg></svg><img src="https://media.licdn.com/dms/image/v2/fixture/company-logo_100"></figure><div><p><span>${headline}</span></p></div></div>` : ''}
${mutual ? `<div><figure><svg></svg><img src="https://media.licdn.com/dms/image/v2/fixture/profile-displayphoto"></figure><div><p><span>${mutual}</span></p></div></div>` : ''}</div></div>
<div><div><button componentkey="ignore-${id}" aria-label="Ignore an invitation to connect from ${name}" type="button"><span><span>Ignore</span></span></button></div>
<div><button componentkey="accept-${id}" aria-label="Accept ${name}’s invitation" type="button"><span><span>Accept</span></span></button></div></div></div>
${note ? noteMarkup(first, note) : ''}</div>`
}

type Page = {
   // The number in the "All (N)" chip above the list; none leaves the chips out.
   all?: number
   // Anything else the page holds, such as the card that confirms an answer.
   extra?: string
}

export const invitationsPage = (rows: FixtureInvitation[], { all, extra = '' }: Page = {}) =>
   `<html><body>${all === undefined ? '' : `<div><button><span>All (${all})</span></button><button><span>Verified (${all})</span></button></div>`}${extra}<div role="list" data-testid="lazy-column">${rows.map(invitationRow).join('')}</div></body></html>`
