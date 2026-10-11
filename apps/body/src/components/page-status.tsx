import { Loader2 } from 'lucide-react'

export const PageStatus = ({ children }: { children: string }) => (
   <p className="text-muted-foreground flex items-center justify-center gap-2 py-24 text-sm">
      <Loader2 className="size-4 animate-spin" />
      {children}
   </p>
)
