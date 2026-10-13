import {
   AlertTriangle,
   CheckCircle2,
   CircleHelp,
   Gauge,
   Loader2,
   type LucideIcon,
   MapPin,
   ScanSearch,
   ShieldCheck,
   XCircle,
} from 'lucide-react'

import { type Proxy } from './types'

import { timeAgo } from '../../lib/time-ago'
import { type Tone } from '../../lib/tone'

export type CheckKey = 'connection' | 'reputation' | 'location' | 'browser'

export type Check = {
   key: CheckKey
   title: string
   // The result in one or two words.
   result: string
   // Why, in a sentence.
   reason: string
   tone: Tone
   // The kind of check; the state is the tone, the result word and the icon beside it.
   icon: LucideIcon
   stateIcon: LucideIcon
   // What the check is for, for someone who has never heard of it.
   about: string
}

const stateIcons: Record<Tone, LucideIcon> = {
   success: CheckCircle2,
   warning: AlertTriangle,
   danger: XCircle,
   info: Loader2,
   neutral: CircleHelp,
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const make = (
   key: CheckKey,
   title: string,
   icon: LucideIcon,
   about: string,
   tone: Tone,
   result: string,
   reason: string
): Check => ({
   key,
   title,
   icon,
   about,
   tone,
   result,
   reason,
   stateIcon: stateIcons[tone],
})

const ABOUT = {
   connection: 'Whether we can reach the internet through this proxy, and how fast it answers.',
   reputation:
      'Whether other people have reported this address for abuse, such as spam or hacking. Addresses with many reports end up on public blocklists.',
   location: 'The country this proxy appears to be in. LinkedIn expects an account to sign in from one familiar place.',
   browser: 'Whether a website thinks a real person is browsing when our browser goes out through this proxy.',
}

const connection = (proxy: Proxy): Check => {
   const about = ABOUT.connection

   if (proxy.status === 'PENDING') {
      return make('connection', 'Connection', Gauge, about, 'info', 'Testing', 'We are testing it right now.')
   }

   if (proxy.status === 'DISABLED') {
      return make('connection', 'Connection', Gauge, about, 'neutral', 'Paused', 'It is not being used.')
   }

   if (proxy.status === 'UNREACHABLE') {
      return make(
         'connection',
         'Connection',
         Gauge,
         about,
         'danger',
         'Not responding',
         'We could not connect through it.'
      )
   }

   if (proxy.health.issues.includes('SLOW')) {
      return make(
         'connection',
         'Connection',
         Gauge,
         about,
         'warning',
         'Works, but slow',
         `It answered in ${seconds(proxy.latencyMs ?? 0)}.`
      )
   }

   return make(
      'connection',
      'Connection',
      Gauge,
      about,
      'success',
      'Works',
      proxy.latencyMs === null ? 'It answered.' : `It answered in ${seconds(proxy.latencyMs)}.`
   )
}

const reputation = (proxy: Proxy): Check => {
   const about = ABOUT.reputation
   const reports = proxy.abuseReports ?? 0
   const reasons = proxy.abuseReasons.join(', ')

   switch (proxy.reputationState) {
      case 'BLACKLISTED':
         return make(
            'reputation',
            'Reputation',
            ShieldCheck,
            about,
            'danger',
            'Blacklisted',
            reasons ? `Reported ${reports} times for ${reasons}.` : `Reported ${reports} times.`
         )
      case 'SUSPICIOUS':
         return make(
            'reputation',
            'Reputation',
            ShieldCheck,
            about,
            'warning',
            'Some reports',
            reasons ? `Reported ${reports} times for ${reasons}.` : `Reported ${reports} times.`
         )
      case 'CLEAN':
         return make(
            'reputation',
            'Reputation',
            ShieldCheck,
            about,
            'success',
            'Clean',
            reports === 0 ? 'No reports in the last 90 days.' : 'Hardly any reports in the last 90 days.'
         )
      default:
         return proxy.health.issues.includes('REPUTATION_UNAVAILABLE')
            ? make(
                 'reputation',
                 'Reputation',
                 ShieldCheck,
                 about,
                 'warning',
                 'Could not check',
                 'We could not look this address up. This is usually temporary.'
              )
            : make(
                 'reputation',
                 'Reputation',
                 ShieldCheck,
                 about,
                 'neutral',
                 'Not checked',
                 proxy.status === 'UNREACHABLE' ? 'We cannot check it while it is not responding.' : 'Not checked yet.'
              )
   }
}

const location = (proxy: Proxy, otherProxies: number): Check => {
   const about = ABOUT.location
   const country = proxy.detectedCountry

   if (!country) {
      return make('location', 'Location', MapPin, about, 'neutral', 'Unknown', 'We have not seen where it is yet.')
   }

   if (proxy.health.issues.includes('DIFFERENT_COUNTRY')) {
      return make(
         'location',
         'Location',
         MapPin,
         about,
         'warning',
         'Different country',
         `It appears in ${country}, unlike this account's other proxies.`
      )
   }

   return make(
      'location',
      'Location',
      MapPin,
      about,
      'success',
      country,
      otherProxies > 0 ? "It matches this account's other proxies." : 'The country this account will appear from.'
   )
}

const browser = (proxy: Proxy): Check => {
   const about = ABOUT.browser
   const check = proxy.browserCheck

   if (!check) {
      return make(
         'browser',
         'Browser check',
         ScanSearch,
         about,
         'neutral',
         'Not tested yet',
         'Run a browser check to see how websites see it.'
      )
   }

   const when = `Checked ${timeAgo(check.checkedAt)}.`

   if (check.verdict === 'DETECTED') {
      return make('browser', 'Browser check', ScanSearch, about, 'danger', 'Detected as a bot', when)
   }

   if (check.verdict === 'NOT_DETECTED') {
      return make('browser', 'Browser check', ScanSearch, about, 'success', 'Looks human', when)
   }

   return make(
      'browser',
      'Browser check',
      ScanSearch,
      about,
      'neutral',
      'Could not tell',
      `${when} It was not conclusive.`
   )
}

// The four checks of one proxy, in the order a person reads them: does it work, is the address clean, is it in the
// right place, does a website take it for a person.
export const checksOf = (proxy: Proxy, otherProxies: number): Check[] => [
   connection(proxy),
   reputation(proxy),
   location(proxy, otherProxies),
   browser(proxy),
]
