import { Button } from '@/components/ui/button'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

// Shared by every "copy this, it's a secret shown once" UI: the workflow API token/trigger and the account API keys.

const COPIED_MS = 1_500

export const CopyButton = ({ text, label }: { text: string; label: string }) => {
   const [copied, setCopied] = useState(false)

   return (
      <Button
         type="button"
         variant="ghost"
         size="icon"
         aria-label={copied ? 'Copied' : label}
         onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
               setCopied(true)
               setTimeout(() => setCopied(false), COPIED_MS)
            })
         }
      >
         {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
   )
}

// A block of code with a copy button.
export const Code = ({ text, label }: { text: string; label: string }) => (
   <div className="bg-muted relative min-w-0 rounded-md">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">{text}</pre>
      <div className="absolute top-1 right-1">
         <CopyButton text={text} label={label} />
      </div>
   </div>
)
