import { z } from 'zod'

// Browsing time per LinkedIn account (.plan/account-browsing-budget.md). The three daily limits, in minutes.
export const BROWSE_MODES = ['SAFE', 'MODERATE', 'AGGRESSIVE'] as const

export type BrowseMode = (typeof BROWSE_MODES)[number]

export const BROWSE_MINUTES: Record<BrowseMode, number> = {
   SAFE: 90,
   MODERATE: 120,
   AGGRESSIVE: 180,
}

// What a task's session counts as: ACTION is asked by the owner or a workflow, BACKGROUND is what the system schedules (messages,
// profile, daily visit), SYSTEM is the sign-in check, which is counted and never refused.
export const BROWSE_CLASSES = ['ACTION', 'BACKGROUND', 'SYSTEM'] as const

export type BrowseClass = (typeof BROWSE_CLASSES)[number]

// A task's own guess of how long its browser stays open, and how its sessions count.
export const taskBudgetSchema = z.strictObject({
   estimate_s: z.number().int().min(1).max(3600),
   class: z.enum(BROWSE_CLASSES),
})

export type TaskBudget = z.infer<typeof taskBudgetSchema>
