// Labels the owner puts on profiles, companies, posts and people in lists.

export type LabelKind = 'profiles' | 'companies' | 'posts' | 'people'

export const LABEL_MAX = 20

const LABEL_LENGTH = 30

export const cleanLabel = (text: string) => text.trim().toLowerCase().slice(0, LABEL_LENGTH)

// The same label always gets the same soft color, so "fintech" looks alike on every page.
const TONES = [
   'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
   'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
   'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
   'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
   'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
   'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
   'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
   'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
] as const

export const toneOf = (label: string) => {
   let hash = 0

   for (const char of label) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0
   }

   return TONES[hash % TONES.length]
}

// What a bulk label change did, in one line for a toast.
export const labelledNote = ({ changed, full }: { changed: number; full: number }) =>
   [
      `${changed} ${changed === 1 ? 'item' : 'items'} changed.`,
      full > 0 ? `${full} already had ${LABEL_MAX} labels, so some were not added.` : '',
   ]
      .filter(Boolean)
      .join(' ')
