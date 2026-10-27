import { type StateTone } from './today'

// Amber only for what needs a look; pending and later are grey, never a warning.
export const TONE_CLASS: Record<StateTone, string> = {
   ok: 'bg-success/10 text-success',
   bad: 'bg-destructive/10 text-destructive',
   warn: 'bg-warning/10 text-warning',
   muted: 'bg-muted text-muted-foreground',
   busy: 'bg-muted text-muted-foreground',
}

export const TONE_TEXT: Record<StateTone, string> = {
   ok: 'text-success',
   bad: 'text-destructive',
   warn: 'text-warning',
   muted: 'text-muted-foreground',
   busy: 'text-muted-foreground',
}

// The left edge of a checklist row.
export const TONE_EDGE: Record<StateTone, string> = {
   ok: 'border-l-success',
   bad: 'border-l-destructive',
   warn: 'border-l-warning',
   muted: 'border-l-border',
   busy: 'border-l-border',
}
