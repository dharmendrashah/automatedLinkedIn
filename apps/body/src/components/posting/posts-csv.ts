import type { PublicationState } from './publication'
import { stateText } from './publication'

// The latest posts as a spreadsheet for the owner's own report: one row per post, by client. Built in the browser from the list
// already on the page; nothing is sent anywhere.

type Row = {
   state: PublicationState
   words: string
   link: string | null
   scheduledAt: string | null
   postedAt: string | null
   createdAt: string
}

export const HEADER = ['Client', 'Account', 'State', 'Date', 'Link', 'Words']

// A cell that starts with = + - or @ would run as a formula in a spreadsheet; a quote in front keeps it text.
export const cell = (value: string) => {
   const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value

   return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const dateOf = (row: Row) => row.postedAt ?? row.scheduledAt ?? row.createdAt

export const postsCsv = (rows: Array<{ post: Row; client: string; account: string }>) =>
   [
      HEADER,
      ...rows.map(({ post, client, account }) => [
         client,
         account,
         stateText(post.state),
         dateOf(post),
         post.link ?? '',
         post.words.replace(/\s+/g, ' ').trim(),
      ]),
   ]
      .map(line => line.map(cell).join(','))
      .join('\r\n')

// Hands the file to the browser as a download; the text never leaves the page. The byte order mark lets a spreadsheet read accents.
export const downloadCsv = (name: string, text: string) => {
   const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }))
   const link = document.createElement('a')

   link.href = url
   link.download = name
   link.click()
   URL.revokeObjectURL(url)
}
