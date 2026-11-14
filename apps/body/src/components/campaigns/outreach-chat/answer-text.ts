import type { Form, StepId } from './steps'

// The user's answer in plain words, as it reads in the thread.
export const answerText = (id: StepId, form: Form, context: { icpName: string | null; suggested: number }) => {
   switch (id) {
      case 'name':
         return form.name
      case 'phrases':
         return form.phrases.join(', ')
      case 'customer':
         return form.icpId === ''
            ? `${form.titles.join(', ')}${form.locations.length > 0 ? ` in ${form.locations.join(', ')}` : ''}`
            : `Saved: ${context.icpName ?? 'my ideal customer'}`
      case 'accounts':
         return form.accountMode === 'all'
            ? 'Every signed-in account'
            : `${form.accountIds.length} ${form.accountIds.length === 1 ? 'account' : 'accounts'} picked`
      case 'note':
         return form.note === '' ? 'No note' : form.note
      case 'message':
         return form.message
      case 'warmUp': {
         const parts = [
            form.reactions ? 'React to their posts' : '',
            form.comments === 'texts' ? 'Comment with my texts' : '',
         ]

         return parts.filter(Boolean).join(' and ') || 'No warm-up'
      }
      case 'when':
         return `${form.time}, ${form.timeZone}`
      case 'handOff':
         return form.handOffUrl === '' ? 'The file only' : form.handOffUrl
      case 'posts':
         return `${form.postsPerDay ?? context.suggested} a day`
   }
}
