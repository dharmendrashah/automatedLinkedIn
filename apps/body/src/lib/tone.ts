// The one place that decides what a tone looks like, in both themes. The colours are theme tokens (`index.css`), so a
// component never writes a colour of its own. A tone always travels with an icon and a word, never as colour alone.
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

type ToneClasses = {
   // Coloured text or icon.
   text: string
   // A pill: tinted background, border and text.
   badge: string
   // A larger area: faint background and border.
   panel: string
   // A solid dot or bar.
   solid: string
}

export const tone: Record<Tone, ToneClasses> = {
   success: {
      text: 'text-success',
      badge: 'border-success/25 bg-success/10 text-success',
      panel: 'border-success/30 bg-success/5',
      solid: 'bg-success',
   },
   warning: {
      text: 'text-warning',
      badge: 'border-warning/25 bg-warning/10 text-warning',
      panel: 'border-warning/30 bg-warning/5',
      solid: 'bg-warning',
   },
   danger: {
      text: 'text-destructive',
      badge: 'border-destructive/25 bg-destructive/10 text-destructive',
      panel: 'border-destructive/30 bg-destructive/5',
      solid: 'bg-destructive',
   },
   info: {
      text: 'text-info',
      badge: 'border-info/25 bg-info/10 text-info',
      panel: 'border-info/30 bg-info/5',
      solid: 'bg-info',
   },
   neutral: {
      text: 'text-muted-foreground',
      badge: 'border-border bg-muted text-muted-foreground',
      panel: 'border-border bg-muted/30',
      solid: 'bg-muted-foreground',
   },
}
