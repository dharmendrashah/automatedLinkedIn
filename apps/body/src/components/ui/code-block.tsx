import { Button } from '@/components/ui/button'
import { Check, Copy } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

// shadcn's code block (https://ui.shadcn.com/docs/components/radix/code-block), ported to this style's classes; the
// registry does not serve it for the new-york style. Plain text only: no syntax highlighting.

const COPIED_MS = 2_000

function CodeBlock({ className, ...props }: React.ComponentProps<'div'>) {
   return (
      <div
         data-slot="code-block"
         className={cn(
            'group/code-block bg-muted/40 relative flex w-full min-w-0 flex-col overflow-hidden rounded-xl border',
            className
         )}
         {...props}
      />
   )
}

function CodeBlockHeader({ className, ...props }: React.ComponentProps<'div'>) {
   return (
      <div
         data-slot="code-block-header"
         className={cn('flex min-w-0 shrink-0 items-center gap-2 border-b px-3 py-1.5', className)}
         {...props}
      />
   )
}

function CodeBlockTitle({ className, ...props }: React.ComponentProps<'div'>) {
   return (
      <div
         data-slot="code-block-title"
         className={cn(
            'text-muted-foreground flex min-w-0 items-center gap-1.5 truncate text-xs font-medium [&_svg]:size-3.5',
            className
         )}
         {...props}
      />
   )
}

function CodeBlockActions({ className, ...props }: React.ComponentProps<'div'>) {
   return (
      <div
         data-slot="code-block-actions"
         className={cn('ms-auto flex shrink-0 items-center gap-1', className)}
         {...props}
      />
   )
}

function CodeBlockCopyButton({
   value,
   className,
   ...props
}: Omit<React.ComponentProps<typeof Button>, 'onClick'> & { value: string }) {
   const [copied, setCopied] = React.useState(false)

   React.useEffect(() => {
      if (!copied) {
         return undefined
      }

      const timeout = window.setTimeout(() => setCopied(false), COPIED_MS)

      return () => window.clearTimeout(timeout)
   }, [copied])

   return (
      <>
         <Button
            data-slot="code-block-copy-button"
            variant="ghost"
            size="icon-xs"
            aria-label={copied ? 'Copied' : 'Copy'}
            className={className}
            onClick={() =>
               void navigator.clipboard
                  .writeText(value)
                  .then(() => setCopied(true))
                  .catch(() => undefined)
            }
            {...props}
         >
            {copied ? <Check /> : <Copy />}
         </Button>
         <span aria-live="polite" className="sr-only">
            {copied ? 'Copied' : ''}
         </span>
      </>
   )
}

function CodeBlockContent({
   className,
   children,
   wrap = false,
   ...props
}: React.ComponentProps<'pre'> & { wrap?: boolean }) {
   return (
      <pre
         data-slot="code-block-content"
         data-wrap={wrap || undefined}
         // A drawer would take the press as a drag and the text could not be selected.
         data-vaul-no-drag=""
         dir="ltr"
         tabIndex={0}
         className={cn(
            'min-h-0 min-w-0 cursor-text overflow-auto p-3 text-start font-mono text-xs leading-relaxed outline-none select-text',
            wrap && 'break-words whitespace-pre-wrap',
            className
         )}
         {...props}
      >
         <code data-slot="code-block-code">{children}</code>
      </pre>
   )
}

export { CodeBlock, CodeBlockActions, CodeBlockContent, CodeBlockCopyButton, CodeBlockHeader, CodeBlockTitle }
