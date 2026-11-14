import { CircleDashed, CirclePause, CirclePlay, Clock, type LucideIcon } from 'lucide-react'

import type { CampaignListState, CampaignRange } from '@automatedLinkedIn/contracts'

export const STATE_META: Record<CampaignListState, { label: string; icon: LucideIcon; className: string }> = {
   NO_WORKFLOWS: { label: 'No workflows yet', icon: CircleDashed, className: 'text-muted-foreground' },
   PAUSED: { label: 'Paused', icon: CirclePause, className: 'text-amber-600' },
   NOT_STARTED: { label: 'Not started', icon: Clock, className: 'text-muted-foreground' },
   RUNNING: { label: 'Running', icon: CirclePlay, className: 'text-emerald-600' },
}

// Invites sent before the window can be accepted inside it, so the shown rate stops at 100%.
export const acceptLabel = (rate: number | null) => (rate === null ? '—' : `${Math.min(Math.round(rate * 100), 100)}%`)

export const rangeLabel = (range: CampaignRange) =>
   range.low === range.high ? `${range.low}` : `${range.low}–${range.high}`
