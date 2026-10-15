import { type ProbeFacts, type ProbeReading } from '../../scraping/driver'
import { type PageReading } from './readers'

const FIELDS: Array<{ key: Exclude<keyof ProbeFacts, 'webdriver'>; label: string }> = [
   {
      key: 'userAgent',
      label: 'User agent',
   },
   {
      key: 'platform',
      label: 'Platform',
   },
   {
      key: 'language',
      label: 'Language',
   },
   {
      key: 'languages',
      label: 'Language list',
   },
   {
      key: 'timezone',
      label: 'Timezone',
   },
   {
      key: 'hardwareConcurrency',
      label: 'Processor cores',
   },
]

// A browser that spoofs only what the page's own script sees gives itself away in the places that script does not
// reach: a worker and an iframe read their own copy of the same values. The three must agree, and the browser must not
// say it is automated. A world that could not be read is never taken as a pass.
export const readProbe = ({ window: main, iframe, worker }: ProbeReading): PageReading => {
   const others = [iframe, worker].filter((facts): facts is ProbeFacts => facts !== undefined)

   const signals = [
      {
         name: 'Says it is automated (navigator.webdriver)',
         flagged: main.webdriver === true || iframe?.webdriver === true,
      },
      ...FIELDS.map(({ key, label }) => ({
         name: `${label} is the same in the page, an iframe and a worker`,
         flagged: others.some(facts => facts[key] !== main[key]),
      })),
   ]

   const flagged = signals.some(signal => signal.flagged)

   if (!flagged && others.length < 2) {
      return {
         verdict: 'UNKNOWN',
         headline: 'The iframe or the worker could not be read.',
         signals,
      }
   }

   return {
      verdict: flagged ? 'BOT' : 'HUMAN',
      headline: flagged ? 'The browser disagrees with itself.' : 'The page, an iframe and a worker agree.',
      signals,
   }
}
