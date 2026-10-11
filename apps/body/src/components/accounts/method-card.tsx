import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'
import { type ReactNode } from 'react'

type Props = {
   title: string
   description: string
   done: boolean
   children: ReactNode
}

export const MethodCard = ({ title, description, done, children }: Props) => (
   <section className="grid gap-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
         <div className="grid gap-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-muted-foreground text-xs">{description}</p>
         </div>
         {done ? (
            <Badge variant="secondary" className="shrink-0 gap-1">
               <CheckCircle2 />
               Filled in
            </Badge>
         ) : null}
      </div>
      {children}
   </section>
)
