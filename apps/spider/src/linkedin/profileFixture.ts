// Profile markup as the real pages have it (recorded 2026-10-24), with made-up people and text, for the tests of everything that reads
// it. Only what the readers rely on is here: the stable markers (`data-view-name`, `data-testid`, `componentkey` prefixes, address
// patterns) and the order of the paragraphs, never the generated class names.

const ME = 'https://www.linkedin.com/in/sample-person'
const PIC = 'https://media.licdn.com/dms/image/v2/sample'

export type FixtureTopCard = {
   name: string
   verified?: boolean
   pronouns?: string
   headline: string
   places?: string
   location?: string
   connections?: string
}

export const topCardMarkup = ({ name, verified, pronouns, headline, places, location, connections }: FixtureTopCard) =>
   `<div data-view-name="profile-top-card"><section componentkey="com.linkedin.sdui.profile.card.refSampleTopcard">
<div role="button"><figure data-view-name="image"><img alt="Cover photo" src="${PIC}/profile-displaybackgroundimage-shrink_350_1400/x"></figure></div>
<a href="${ME}/?isSelfProfile=true" componentkey="topcard-logo-image-referencekey" data-view-name="profile-top-card-member-photo"><div aria-label="Profile photo"><figure data-view-name="image"><img src="${PIC}/profile-displayphoto-shrink_100_100/x"></figure></div></a>
<div><div><div><div>
<div data-view-name="profile-top-card-verified-badge" data-display-contents="true"><div><h2>${name}</h2>${verified ? '<span role="img" aria-label="Verified"></span>' : ''}</div></div>
${pronouns ? `<p>${pronouns}</p>` : ''}
<div data-view-name="tg-entrypoint-selfviewtopcard"><div><a href="https://www.linkedin.com/trust/verification/" data-view-name="tg-entrypoint-verify-cta"><div><p>Verify in 2 minutes </p></div></a></div></div>
</div><p>${headline}</p>${places ? `<p>${places}</p>` : ''}
<div><p>${location ?? ''}</p><p>·</p><p><a href="${ME}/overlay/contact-info/">Contact info</a></p></div></div></div>
${connections ? `<div><a href="https://www.linkedin.com/mynetwork/invite-connect/connections/" data-view-name="profile-top-card-view-all-connections"><p>${connections} connections</p></a></div>` : ''}
</div></section></div>`

export const aboutMarkup = (text: string) =>
   `<div data-view-name="profile-card-about"><section><h2>About</h2><span data-testid="expandable-text-box">${text}<button data-testid="expandable-text-button">…<span>more</span></button></span></section></div>`

const insight = (name: string, text: string, extra = '') =>
   `<a href="https://www.linkedin.com/analytics/${name}/" data-view-name="insights-${name}"><div><p>${text}</p><p>Something to do.</p>${extra}</div></a>`

// The card shows each link twice, once for each layout of the page.
export const insightsMarkup = (views: string, impressions: string, search: string) => {
   const links = `${insight('wvmp', views)}${insight('content-impressions', impressions, '<p>Past 7 days</p>')}${insight('search-appearances', search)}`

   return `<div data-view-name="profile-card-insights"><section><h2>Analytics</h2>${links}<hr role="presentation">${links}</section></div>`
}

export const activityMarkup = (followers: string) =>
   `<div data-view-name="profile-card-recent-activity"><section><h2>Activity</h2><a href="https://www.linkedin.com/feed/followers/">${followers}</a></section></div>`

export type FixtureJob = {
   title: string
   company: string
   type?: string
   dates: string
   duration?: string
   location?: string
   mode?: string
   description?: string
   skills?: string
   // Paragraphs after the header that are not part of it (a note from LinkedIn, one skill on its own line).
   notes?: string[]
}

const job = (item: FixtureJob, index: number) =>
   `<div componentkey="entity-collection-item-${index}"><a href="https://www.linkedin.com/company/${100 + index}/"><figure><img alt="${item.company} logo" src="${PIC}/company-logo_100_100/${index}"></figure></a>
<a href="${ME}/details/experience/edit/forms/position/${index}/"><div><div><div><p>${item.title}</p><p>${item.company}${item.type ? ` · ${item.type}` : ''}</p></div></div><p>${item.dates}${item.duration ? ` · ${item.duration}` : ''}</p>${
      item.location ? `<p>${item.location}${item.mode ? ` · ${item.mode}` : ''}</p>` : ''
   }</div></a>${(item.notes ?? []).map(note => `<p>${note}</p>`).join('')}
${item.description ? `<div><p><span data-testid="expandable-text-box">${item.description}<button data-testid="expandable-text-button">…<span>more</span></button></span></p></div>` : ''}
${item.skills ? `<a href="${ME}/overlay/${index}/skill-associations-details/">${item.skills}</a>` : ''}</div>`

export const experienceMarkup = (jobs: FixtureJob[]) =>
   `<div data-view-name="profile-card-experience"><section><h2>Experience</h2>${jobs.map(job).join('<hr role="presentation">')}</section></div>`

export type FixtureSchool = { school: string; degree?: string; dates?: string }

export const educationPage = (schools: FixtureSchool[]) =>
   `<section aria-label="Primary content"><div data-testid="profile_EducationDetailsSection_sample-person"><div><p>Education</p></div>${schools
      .map(
         ({ school, degree, dates }, index) =>
            `<div><a href="${ME}/details/education/edit/forms/${index}/"><div><div><p>${school}</p>${degree ? `<p>${degree}</p>` : ''}</div>${dates ? `<p>${dates}</p>` : ''}</div></a></div>`
      )
      .join('')}</div></section>`

export const skillsPage = (skills: Array<{ name: string; usedAt?: string }>) =>
   `<section aria-label="Primary content"><nav><ul><li><button aria-current="true"><span>All</span></button></li></ul></nav><div data-testid="lazy-column">${skills
      .map(
         ({ name, usedAt }, index) =>
            `<div componentkey="com.linkedin.sdui.profile.skillRow${index}"><div><p><span>${name}</span></p>${
               usedAt ? `<div role="list"><div role="listitem"><p><span>${usedAt}</span></p></div></div>` : ''
            }</div><a href="${ME}/details/skills/edit/forms/${index}/">Edit</a></div><div componentkey="com.linkedin.sdui.profile.skillDivider"><hr role="presentation"></div>`
      )
      .join('')}</div></section>`

export type FixtureInterest = {
   name: string
   kind?: 'company' | 'group' | 'school' | 'newsletter' | 'person'
   followers: string
   // For a person: the degree ("2nd") and the headline, shown between the name and the followers.
   degree?: string
   headline?: string
}

const KIND_PATH = {
   company: 'company',
   group: 'groups',
   school: 'school',
   newsletter: 'newsletters',
   person: 'in',
} as const

// A company, group, school or newsletter: its name twice (the accessible name, then the name), then how many follow it.
const pageItem = (name: string, followers: string) =>
   `<div><p><span><span>${name}, Company</span><span>${name}</span></span></p></div><p>${followers}</p>`

// A newsletter: the name, a description, how often it is published, and a link to who publishes it inside the card (recorded 2026-10-24).
const newsletterItem = (name: string, frequency: string) =>
   `<div><p><span><span>${name}, Newsletter</span><span>${name}</span></span></p></div><div><p><span>A short description.</span></p></div><p>${frequency}</p><a href="https://www.linkedin.com/company/sample-publisher/"><div><figure><img alt="" src="${PIC}/logo/publisher"></figure><p>Sample Publisher</p></div></a>`

// A member: the name as a link with the degree after it, then the headline, then the followers (recorded 2026-10-24).
const memberItem = (name: string, slug: string, followers: string, degree = '2nd', headline = 'Writer at Examples') =>
   `<div><p><span><a href="https://www.linkedin.com/in/${slug}/">${name}<span aria-label="Top Voice" role="img"></span></a></span></p><p>· ${degree}</p></div><p>${headline}</p><p>${followers}</p>`

// One chip's page: the chips (each a radio holding a checkbox and its label), then the items of the selected chip.
export const interestsPage = (chips: string[], items: FixtureInterest[]) =>
   `<section aria-label="Primary content"><p>Interests</p>${chips
      .map(
         (chip, index) =>
            `<div role="radio"><input id="chip-${index}" type="checkbox"${index === 0 ? ' checked=""' : ''}><label for="chip-${index}">${chip}</label></div>`
      )
      .join('')}<div data-testid="lazy-column">${items
      .map(({ name, kind = 'company', followers, degree, headline }, index) => {
         const slug = name.toLowerCase().replace(/\W+/g, '-')
         const text =
            kind === 'person'
               ? memberItem(name, slug, followers, degree, headline)
               : kind === 'newsletter'
                 ? newsletterItem(name, followers)
                 : pageItem(name, followers)

         return `<div><a href="https://www.linkedin.com/${KIND_PATH[kind]}/${slug}/"><div><figure><img alt="" src="${PIC}/logo/${index}"></figure><div>${text}</div></div></a><div><button aria-label="Following, click to unfollow ${name}">Following</button></div><hr role="presentation"></div>`
      })
      .join('')}</div></section>`

export type FixturePerson = { name: string; degree: string; headline: string; slug: string }

export const peopleYouMayKnowMarkup = (people: FixturePerson[]) =>
   `<div data-view-name="profile-card-pymk-recommendation-from-school"><section><h2>People you may know</h2><p>From your school</p>${people
      .map(
         ({ name, degree, headline, slug }) =>
            `<div><a href="https://www.linkedin.com/in/${slug}/"><div><figure data-view-name="image"><img alt="" src="${PIC}/profile-displayphoto-scale_100_100/${slug}"></figure><div><a href="https://www.linkedin.com/in/${slug}/"><p>${name}</p></a><p>· ${degree}</p><p>${headline}</p></div></div></a><div data-view-name="edge-creation-connect-action"><a href="/preload/custom-invite/?vanityName=${slug}">Connect</a></div></div><hr role="presentation">`
      )
      .join('')}</section></div>`

export type FixturePage = {
   name: string
   what: string
   followers: string
   slug: string
   kind?: 'company' | 'showcase'
   mutual?: string
}

export const pagesYouMightLikeMarkup = (pages: FixturePage[]) =>
   `<div data-view-name="profile-card-company-recommendation"><section><h2>You might like</h2><p>Pages for you</p>${pages
      .map(
         ({ name, what, followers, slug, kind = 'company', mutual }) =>
            `<div data-view-name="company-recommendation-card-impression"><div><a href="https://www.linkedin.com/${kind}/${slug}/"><figure data-view-name="image"><img alt="" src="${PIC}/company-logo_100_100/${slug}"></figure></a><a aria-label="View ${name} page" href="https://www.linkedin.com/${kind}/${slug}/"><p>${name}</p></a><p>${what}</p><p>${followers}</p>${mutual ? `<a href="${ME}/"><p>${mutual}</p></a>` : ''}<div data-view-name="edge-creation-follow-action"><button aria-label="Follow ${name}">Follow</button></div></div></div><hr role="presentation">`
      )
      .join('')}</section></div>`

export type FixturePost = {
   // Raw markup, so a test can put links inside it.
   text: string
   // Left out for a company, which has none.
   headline?: string | null
   age: string
   author?: string
   // The line after the name: "• You" for the account's own post, "• 2nd" for someone else's; none for a company.
   degree?: string | null
   // The account reposted it: the original author is `author`.
   repost?: boolean
   // The numbers on the buttons; none shows as an empty (zero-width) text.
   reactions?: number
   comments?: number
   reposts?: number
   impressions?: number
   image?: string
}

const ZERO = '\u200b'

// A post of the activity page (recorded 2026-10-24): the header (a row for who reposted it, a row for who wrote it), the text, the
// picture if any, the row of buttons, then, for the account's own posts, the impressions with the link to their analytics.
const postItem = ({
   text,
   headline = 'Founder at Sampleworks',
   age,
   author = 'Sample Person',
   degree = '• You',
   repost,
   reactions,
   comments,
   reposts,
   impressions,
   image,
}: FixturePost) =>
   `<div role="listitem"><div componentkey="post"><h2><span>Feed post</span></h2>${
      repost
         ? `<div><div><a href="${ME}/"><figure><img src="${PIC}/profile-displayphoto-shrink_100_100/reposter"></figure></a></div><div><p><span>reposted this</span><a aria-label="View Sample Person’s profile" href="${ME}/"><strong><span>Sample Person</span></strong></a></p></div></div><hr role="presentation">`
         : ''
   }<div><div><a href="${ME}/"><figure><img alt="View ${author}’s profile" src="${PIC}/profile-displayphoto-shrink_100_100/me"></figure></a></div><div><div><a href="${ME}/"><div><div><p><span>${author}</span></p>${degree ? `<p><span>${degree}</span></p>` : ''}</div></div></a></div>${headline ? `<div><p><span>${headline}</span></p></div>` : ''}<div><p><span>${age}</span></p></div></div></div><button aria-label="Open control menu for post"><span></span></button><p><span data-testid="expandable-text-box">${text}</span></p>${
      image
         ? `<div><a href="${ME}/recent-activity/all/"><figure><img alt="View image" src="${image}"></figure></a></div>`
         : ''
   }<div><a href="${ME}/recent-activity/all/"><div aria-label="Switch to different account"><figure><img src="${PIC}/profile-displayphoto-shrink_100_100/me"></figure></div></a><div><div><div><div><button aria-label="Reaction button state: no reaction"><span><span>${reactions ?? ZERO}</span></span></button></div><button aria-label="Open reactions menu"><span></span></button></div><button aria-label="Comment"><span><span>${comments ?? ZERO}</span></span></button><button aria-label="Repost"><span><span>${reposts ?? ZERO}</span></span></button><a aria-label="Send" href="${ME}/recent-activity/all/"><span>${ZERO}</span></a></div></div></div></div>${
      impressions === undefined
         ? ''
         : `<div><div><p>${impressions} impressions</p><div><a href="https://www.linkedin.com/analytics/post-summary/urn:li:activity:1/"><p><span>View analytics</span></p></a></div></div></div>`
   }</div>`

export const postsPage = (kind: 'All' | 'Comments', posts: FixturePost[]) =>
   `<section aria-label="Primary content"><div role="list" data-testid="ProfileRecentActivity${kind}-sample-person">${posts
      .map(postItem)
      .join('')}</div></section>`

// A comment item: the post that was commented on (its author, headline, age and text), then the account's own comment.
export const commentsPage = (comments: Array<{ post: string; comment: string; age: string }>) =>
   `<section aria-label="Primary content"><div role="list" data-testid="ProfileRecentActivityComments-sample-person">${comments
      .map(
         ({ post, comment, age }) =>
            `<div role="listitem"><div><h2><span>Feed post</span></h2><p>Sample Personcommented</p><p>Other Person</p><p>• 1st</p><p>Writer at Examples</p><p>2yr</p><p><span data-testid="expandable-text-box">${post}</span></p><div><p>Sample Person You</p><p>Founder at Sampleworks</p><p>${age}</p><p><span data-testid="expandable-text-box">${comment}</span></p></div></div></div>`
      )
      .join('')}</div></section>`

export type FixtureProject = {
   name: string
   dates?: string
   description?: string
   skills?: string
   // The line as the page writes it, in its language ("Associated with Sampleworks").
   associated?: string
}

// The projects page (recorded 2026-10-24): each project is a block with a link to its edit form that holds the name and the dates,
// then its text, the link to its skills, and the company it belongs to as a logo and a line.
export const projectsPage = (projects: FixtureProject[]) =>
   `<section aria-label="Primary content"><div data-testid="lazy-column"><div><button aria-label="Navigate back"><span></span></button><p>Projects</p><a aria-label="Add a new project" href="${ME}/edit/forms/project/new/"><span></span></a></div>${projects
      .map(
         ({ name, dates, description, skills, associated }, index) =>
            `<div componentkey="project-${index}"><a href="${ME}/details/projects/edit/forms/${index}/"><div aria-label="Edit project ${name}"><p><span data-testid="expandable-text-box">${name}</span></p>${dates ? `<p>${dates}</p>` : ''}</div></a>${
               description
                  ? `<p><span data-testid="expandable-text-box">${description}<button data-testid="expandable-text-button">…<span>more</span></button></span></p>`
                  : ''
            }${skills ? `<p><a href="${ME}/overlay/${index}/skill-associations-details/">${skills}</a></p>` : ''}${
               associated
                  ? `<div><figure><img src="${PIC}/company-logo_100_100/p${index}"></figure><div><p>${associated}</p></div></div>`
                  : ''
            }<a aria-label="Edit project ${name}" href="${ME}/details/projects/edit/forms/${index}/"></a></div>`
      )
      .join('')}</div></section>`

// The languages page: a row holds the language and its level as paragraphs, and, next to them, the link to its edit form.
export const languagesPage = (languages: Array<{ name: string; level?: string }>) =>
   `<section aria-label="Primary content"><div data-testid="lazy-column"><div><p>Languages</p><a aria-label="Add new language" href="${ME}/details/languages/edit/forms/new/"><span></span></a></div><div>${languages
      .map(
         ({ name, level }, index) =>
            `<div><div><div><p>${name}</p>${level ? `<p>${level}</p>` : ''}</div></div><div><a aria-label="Edit language" href="${ME}/details/languages/edit/forms/${index}/"><span></span></a></div></div>`
      )
      .join('<hr role="presentation">')}</div></div></section>`

export type FixtureRecommendation = {
   name: string
   slug: string
   // Left out when the page shows no degree (someone out of the network).
   degree?: string | null
   headline?: string
   relationship?: string
   text: string
}

// The page of recommendations, received or given: each card is a link with the picture, the name, the degree, the headline and the
// line that tells how the two know each other, then the text of the recommendation.
export const recommendationsPage = (cards: FixtureRecommendation[]) =>
   `<section aria-label="Primary content"><div data-testid="lazy-column"><div><p>Recommendations</p></div><div>${cards
      .map(
         ({ name, slug, degree = '1st', headline, relationship, text }) =>
            `<div><div><a href="https://www.linkedin.com/in/${slug}/"><div><figure><img alt="" src="${PIC}/profile-displayphoto-shrink_100_100/${slug}"></figure><div><div><div><p><span><a href="https://www.linkedin.com/in/${slug}/">${name}<span aria-label="Verified" role="img"></span></a></span></p>${degree ? `<p>\u00b7 ${degree}</p>` : ''}</div>${headline ? `<p>${headline}</p>` : ''}${relationship ? `<p>${relationship}</p>` : ''}</div></div></div></a><button aria-label="Edit"><span></span></button></div><div>${text ? `<p><span data-testid="expandable-text-box">${text}</span></p>` : ''}</div></div>`
      )
      .join('<hr role="presentation">')}</div></div></section>`

export const servicesMarkup = (services: string[]) =>
   `<div data-view-name="profile-card-services"><section><div><h2>Services</h2><a data-view-name="services-edit-button" aria-label="Edit services" href="${ME}/opportunities/services/edit"><span></span></a></div><div>${services
      .map(service => `<p>${service}</p>`)
      .join(
         ''
      )}</div><hr role="presentation"><a data-view-name="services-see-all-services-button" href="https://www.linkedin.com/services/page/1/"><span><span>Show all</span></span></a></section></div>`

// The box the account sees at the top of its own page: the first line says it is open to work and for whom, the second what for, in
// a list of boxes that also holds the offers to hire and to volunteer.
export const openToWorkMarkup = (audience: string, titles: string) =>
   `<section data-testid="carousel"><ul data-testid="carousel-children-container"><li data-testid="carousel-child-container"><div><a href="${ME}/"><div><div><p><span><strong>Open to work \u00b7 ${audience}</strong></span></p></div><div><p><span>${titles}</span></p></div><div><p><span>Show details</span></p></div></div></a><button data-view-name="profile-edit-open-to" aria-label="Edit"><span></span></button></div></li><li data-testid="carousel-child-container"><div><a href="${ME}/opportunities/hiring-opportunities/onboarding/"><div><p><strong>Share that you\u2019re hiring</strong>and attract candidates.</p><div><p><span>Get started</span></p></div></div></a></div></li></ul></section>`

// The profile page as drawn: the top card and the cards below it, each as the page marks it.
export const profilePage = (...cards: string[]) =>
   `<html lang="en"><body><div id="root"><section aria-label="Primary content">${cards.join('')}</section></div></body></html>`
