import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { checkPages, pair } from './invitePages'

// Runs the invite readers over a folder of kept pages: a run's files (input.json, invites.json, no-connect-N.html) or any
// *.html. Reads local files only and prints slugs, never names (.plan/011-check-invite-pages-command.md).
// pnpm runs the script in the package folder, so a relative folder is read from where the command was typed.
const [given] = process.argv.slice(2)
const folder = given ? resolve(process.env.INIT_CWD ?? process.cwd(), given) : ''

if (!folder || !existsSync(folder)) {
   console.log('Give the folder of kept pages: pnpm --filter @automatedLinkedIn/spider check:invite-pages <folder>')
   process.exit(1)
}

const files = readdirSync(folder)
const withRun = files.includes('input.json') && files.includes('invites.json')
const paired = withRun
   ? pair(readFileSync(join(folder, 'input.json'), 'utf8'), readFileSync(join(folder, 'invites.json'), 'utf8'), files)
   : undefined

if (paired && 'error' in paired) {
   console.log(paired.error)
   process.exit(1)
}

const names = paired ? paired.pages : files.filter(file => file.endsWith('.html')).toSorted()
const rows = checkPages(
   names.map(name => ({
      name,
      html: readFileSync(join(folder, name), 'utf8'),
   })),
   paired?.people ?? []
)

console.table(rows)
console.log({
   total: rows.length,
   withMore: rows.filter(({ more }) => more > 0).length,
   withConnect: rows.filter(({ connects, menu }) => connects + menu > 0).length,
   undrawn: rows.filter(({ drawn }) => !drawn).length,
})
