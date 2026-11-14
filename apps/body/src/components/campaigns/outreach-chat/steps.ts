import { type OutreachAnswers, capacityOf, outreachAnswersSchema } from '@automatedLinkedIn/contracts'

// The questions of the campaign chat, in order: a name, whether it runs outreach, then the ten outreach questions. Review is the
// last step (.plan/campaign-outreach-chat-onboarding.md, .plan/campaign-create-in-chat.md).
export const STEPS = [
   {
      id: 'name',
      required: true,
      question: 'What should we call this campaign?',
      hint: '1 to 60 characters. The people it finds get a label made from it.',
      path: 'name',
   },
   {
      id: 'kind',
      required: true,
      question: 'Should this campaign run outreach?',
      hint: 'Yes: we build six workflows for you, all switched off. No: an empty campaign, and you add your own workflows later.',
      path: 'outreach',
   },
   {
      id: 'phrases',
      required: true,
      question: 'What problem do you solve?',
      hint: 'Words people use when they post about it. 1 to 5 phrases.',
      path: 'phrases',
   },
   {
      id: 'customer',
      required: true,
      question: 'Who is your ideal customer?',
      hint: 'Job titles are enough. Or use one you saved.',
      path: 'customer',
   },
   {
      id: 'accounts',
      required: false,
      question: 'Which accounts should send?',
      hint: 'Only signed-in accounts can send.',
      path: 'accounts',
   },
   {
      id: 'note',
      required: false,
      question: 'Want a connection note?',
      hint: 'Up to 200 characters. {first_name} works. Only the best-scored people carry it.',
      path: 'note',
   },
   {
      id: 'message',
      required: true,
      question: 'What is the first message?',
      hint: 'Sent to people who accept, after a wait, if you have not talked before.',
      path: 'message',
   },
   {
      id: 'warmUp',
      required: false,
      question: 'How should the account warm them up?',
      hint: 'While an invite is pending, the account reacts to their posts. A comment waits for your approval.',
      path: 'warmUp',
   },
   {
      id: 'when',
      required: false,
      question: 'When should it run each day?',
      hint: 'A time and a time zone.',
      path: 'when',
   },
   {
      id: 'handOff',
      required: false,
      question: 'Should the hand-off also go to a web address?',
      hint: 'The hand-off is a daily file of the people to follow up by hand.',
      path: 'handOffUrl',
   },
   {
      id: 'posts',
      required: false,
      question: 'How many posts a day should it look at?',
      hint: 'A whole number from 1 to 50.',
      path: 'postsPerDay',
   },
] as const

export type StepId = (typeof STEPS)[number]['id']

export type Form = {
   name: string
   // True once "Yes" is chosen. "No" makes an empty campaign and ends the chat, so it is never stored.
   outreach: boolean
   phrases: string[]
   titles: string[]
   locations: string[]
   icpId: string
   accountMode: 'all' | 'pick'
   accountIds: string[]
   note: string
   message: string
   reactions: boolean
   comments: 'off' | 'texts'
   texts: string
   time: string
   timeZone: string
   handOffUrl: string
   postsPerDay: number | null
}

export const emptyForm = (timeZone: string): Form => ({
   name: '',
   outreach: false,
   phrases: [],
   titles: [],
   locations: [],
   icpId: '',
   accountMode: 'all',
   accountIds: [],
   note: '',
   message: '',
   reactions: true,
   comments: 'off',
   texts: '',
   time: '09:00',
   timeZone,
   handOffUrl: '',
   postsPerDay: null,
})

export const answersOf = (form: Form, suggested: number): OutreachAnswers => ({
   name: form.name,
   phrases: form.phrases,
   customer: {
      icpId: form.icpId,
      includeTitles: form.titles,
      locations: form.locations,
   },
   accounts: {
      mode: form.accountMode,
      ids: form.accountIds,
   },
   note: form.note,
   message: form.message,
   warmUp: {
      reactions: form.reactions,
      comments: form.comments,
      texts: form.texts
         .split('\n')
         .map(line => line.trim())
         .filter(Boolean),
   },
   when: {
      time: form.time,
      timeZone: form.timeZone,
   },
   handOffUrl: form.handOffUrl,
   postsPerDay: form.postsPerDay ?? suggested,
})

const FIELDS: Record<StepId, Array<keyof Form>> = {
   name: ['name'],
   kind: ['outreach'],
   phrases: ['phrases'],
   customer: ['icpId', 'titles', 'locations'],
   accounts: ['accountMode', 'accountIds'],
   note: ['note'],
   message: ['message'],
   warmUp: ['reactions', 'comments', 'texts'],
   when: ['time', 'timeZone'],
   handOff: ['handOffUrl'],
   posts: ['postsPerDay'],
}

// "Use default": puts one step's fields back to how a new chat starts.
export const resetStep = (form: Form, id: StepId, timeZone: string): Form => ({
   ...form,
   ...Object.fromEntries(FIELDS[id].map(key => [key, emptyForm(timeZone)[key]])),
})

// The accounts that will send, and the posts a day we suggest for them.
export const suggestedPostsOf = (form: Form, signedInIds: string[]) => {
   const used = form.accountMode === 'pick' ? signedInIds.filter(id => form.accountIds.includes(id)) : signedInIds

   return {
      used: used.length,
      suggested: capacityOf(used.length, 1).suggestedPosts,
   }
}

// Drops a saved ideal customer or an account that no longer exists, so stored answers never name what the backend cannot find.
// A list that is still loading or failed is null and drops nothing.
export const reconcile = (form: Form, lists: { accountIds: string[] | null; icpIds: string[] | null }): Form => {
   const { accountIds, icpIds } = lists
   const keptAccounts = accountIds ? form.accountIds.filter(id => accountIds.includes(id)) : form.accountIds
   const keptIcp = icpIds && !icpIds.includes(form.icpId) ? '' : form.icpId

   return keptAccounts.length === form.accountIds.length && keptIcp === form.icpId
      ? form
      : { ...form, accountIds: keptAccounts, icpId: keptIcp }
}

export const isTimeZone = (timeZone: string) => {
   try {
      new Intl.DateTimeFormat('en', { timeZone })

      return true
   } catch {
      return false
   }
}

// "" or "abc" is not a number of posts; 0 and 51 are left for the schema to refuse.
export const parsePosts = (text: string) => {
   const value = text.trim() === '' ? Number.NaN : Number(text)

   return Number.isInteger(value) ? value : null
}

// What is wrong with one step's own answer. The schema is the source of truth; its issues are filtered by the step they belong
// to, so an empty later step never adds a problem here.
export const stepProblems = (id: StepId, form: Form, suggested: number) => {
   if (id === 'kind') {
      return form.outreach ? [] : ['Choose yes or no.']
   }

   const step = STEPS.find(each => each.id === id)
   const parsed = outreachAnswersSchema.safeParse(answersOf(form, suggested))
   const found = parsed.success
      ? []
      : parsed.error.issues.filter(({ path }) => path[0] === step?.path).map(({ message }) => message)

   if (id === 'when' && !isTimeZone(form.timeZone)) {
      found.push('Use a time zone like Asia/Kolkata.')
   }

   return [...new Set(found)]
}

// Done steps are the ones answered or skipped. The next one is the first not done.
export const nextStep = (done: StepId[]) => STEPS.find(({ id }) => !done.includes(id))?.id ?? null

// "Step 3 of 11": the step in front of the user (Review is the eleventh), and how much is done.
export const progressOf = (done: StepId[]) => {
   const total = STEPS.length + 1
   const at = STEPS.findIndex(({ id }) => !done.includes(id))

   return {
      done: done.length,
      current: at === -1 ? total : at + 1,
      total,
      percent: Math.round((done.length / total) * 100),
   }
}
