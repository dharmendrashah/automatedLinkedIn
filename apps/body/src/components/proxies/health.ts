import { AlertTriangle, Clock, Loader2, type LucideIcon, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'

import { type Proxy } from './types'

import { type Tone } from '../../lib/tone'

export type Health = Proxy['health']
export type HealthLevel = Health['level']
export type HealthIssue = Health['issues'][number]

// How each overall health looks and reads. The same words and icon are used on a card, in the table and in the drawer.
export const levelInfo: Record<HealthLevel, { label: string; tone: Tone; icon: LucideIcon; explanation: string }> = {
   HEALTHY: {
      label: 'Healthy',
      tone: 'success',
      icon: ShieldCheck,
      explanation: 'It works, its address is clean, it is quick and it is in the right place.',
   },
   WATCH: {
      label: 'Keep an eye',
      tone: 'warning',
      icon: AlertTriangle,
      explanation: 'It works, but something is not ideal. You can keep using it.',
   },
   RISK: {
      label: 'At risk',
      tone: 'danger',
      icon: ShieldAlert,
      explanation: 'Something here could get your LinkedIn account noticed. We suggest swapping it.',
   },
   ACCEPTED: {
      label: 'Risk accepted',
      tone: 'neutral',
      icon: ShieldOff,
      explanation: 'You chose to keep using it despite its problems. We will tell you if something new comes up.',
   },
   CHECKING: {
      label: 'Checking',
      tone: 'info',
      icon: Loader2,
      explanation: 'We are testing it right now.',
   },
   PAUSED: {
      label: 'Paused',
      tone: 'neutral',
      icon: Clock,
      explanation: 'It is not being used.',
   },
}

// What each problem means, in a sentence a person can act on.
export const issueInfo: Record<HealthIssue, { title: string; phrase: string; because: (proxy: Proxy) => string }> = {
   NOT_RESPONDING: {
      title: 'Not responding',
      phrase: 'it does not respond',
      because: () =>
         'We could not connect through it. It may be switched off, or its address, port or password may be wrong.',
   },
   BLACKLISTED: {
      title: 'Blacklisted address',
      phrase: 'its address is blacklisted',
      because: proxy =>
         `Many people reported this address${proxy.abuseReasons.length > 0 ? ` for ${proxy.abuseReasons.join(', ')}` : ''}. AbuseIPDB, a public list of abusive addresses, advises blocking it, so LinkedIn may treat your account with suspicion.`,
   },
   BOT_DETECTED: {
      title: 'Detected as a bot',
      phrase: 'websites took it for a bot',
      because: () => 'A website took the browser for a program instead of a person when it ran through this proxy.',
   },
   DIFFERENT_COUNTRY: {
      title: 'Different country',
      phrase: 'it is in a different country',
      because: proxy =>
         `It appears in ${proxy.detectedCountry ?? 'another country'}, unlike this account's other proxies. LinkedIn may notice the account jumping between countries.`,
   },
   SUSPICIOUS: {
      title: 'Some reports',
      phrase: 'its address has some abuse reports',
      because: () => 'A few people reported this address for abuse. It is not blacklisted, but it is worth watching.',
   },
   SLOW: {
      title: 'Slow',
      phrase: 'it is slow',
      because: proxy =>
         `It answered in ${((proxy.latencyMs ?? 0) / 1000).toFixed(1)} seconds. Pages can load slowly or time out.`,
   },
   STALE: {
      title: 'Not tested lately',
      phrase: 'it was not tested lately',
      because: () => 'It has not been tested for more than two days, so this picture may be out of date.',
   },
   REPUTATION_UNAVAILABLE: {
      title: 'Reputation not checked',
      phrase: 'its reputation could not be checked',
      because: () => 'We could not check whether this address has been reported. This is usually temporary.',
   },
}
