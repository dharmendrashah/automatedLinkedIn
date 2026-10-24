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
}

const job = (item: FixtureJob, index: number) =>
   `<div componentkey="entity-collection-item-${index}"><a href="https://www.linkedin.com/company/${100 + index}/"><figure><img alt="${item.company} logo" src="${PIC}/company-logo_100_100/${index}"></figure></a>
<a href="${ME}/details/experience/edit/forms/position/${index}/"><div><div><div><p>${item.title}</p><p>${item.company}${item.type ? ` · ${item.type}` : ''}</p></div></div><p>${item.dates}${item.duration ? ` · ${item.duration}` : ''}</p>${
      item.location ? `<p>${item.location}${item.mode ? ` · ${item.mode}` : ''}</p>` : ''
   }</div></a>
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
}

const KIND_PATH = {
   company: 'company',
   group: 'groups',
   school: 'school',
   newsletter: 'newsletters',
   person: 'in',
} as const

// One chip's page: the chips (a checkbox and its label), then the items of the selected chip.
export const interestsPage = (chips: string[], items: FixtureInterest[]) =>
   `<section aria-label="Primary content"><p>Interests</p><div>${chips
      .map(
         (chip, index) =>
            `<div><div><input id="chip-${index}" type="checkbox"${index === 0 ? ' checked=""' : ''}><label for="chip-${index}">${chip}</label></div></div>`
      )
      .join('')}</div><div data-testid="lazy-column">${items
      .map(
         ({ name, kind = 'company', followers }, index) =>
            `<div><a href="https://www.linkedin.com/${KIND_PATH[kind]}/${name.toLowerCase().replace(/\W+/g, '-')}/"><div><figure><img alt="" src="${PIC}/logo/${index}"></figure><div><div><div><p><span><span>${name}, Company</span><span>${name}</span></span></p></div></div><p>${followers}</p></div></div></a><div><button aria-label="Following, click to unfollow ${name}">Following</button></div><hr role="presentation"></div>`
      )
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

export type FixturePost = { text: string; headline?: string; age: string; author?: string }

export const postsPage = (kind: 'All' | 'Comments', posts: FixturePost[]) =>
   `<section aria-label="Primary content"><div role="list" data-testid="ProfileRecentActivity${kind}-sample-person">${posts
      .map(
         ({ text, headline = 'Founder at Sampleworks', age, author = 'Sample Person' }) =>
            `<div role="listitem"><div><h2><span>Feed post</span></h2><div><a href="${ME}/"><figure><img alt="View ${author}’s profile" src="${PIC}/profile-displayphoto-shrink_100_100/me"></figure></a></div><div><a href="${ME}/"><div><div><p><span>${author}</span></p><p><span> • You</span></p></div></div></a><p><span>${headline}</span></p><p><span>${age}</span></p></div><p><span data-testid="expandable-text-box">${text}</span></p></div></div>`
      )
      .join('')}</div></section>`

// A comment item: the post that was commented on (its author, headline, age and text), then the account's own comment.
export const commentsPage = (comments: Array<{ post: string; comment: string; age: string }>) =>
   `<section aria-label="Primary content"><div role="list" data-testid="ProfileRecentActivityComments-sample-person">${comments
      .map(
         ({ post, comment, age }) =>
            `<div role="listitem"><div><h2><span>Feed post</span></h2><p>Sample Personcommented</p><p>Other Person</p><p>• 1st</p><p>Writer at Examples</p><p>2yr</p><p><span data-testid="expandable-text-box">${post}</span></p><div><p>Sample Person You</p><p>Founder at Sampleworks</p><p>${age}</p><p><span data-testid="expandable-text-box">${comment}</span></p></div></div></div>`
      )
      .join('')}</div></section>`

// The profile page as drawn: the top card and the cards below it, each as the page marks it.
export const profilePage = (...cards: string[]) =>
   `<html lang="en"><body><div id="root"><section aria-label="Primary content">${cards.join('')}</section></div></body></html>`
