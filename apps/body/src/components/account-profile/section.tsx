import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card'
import { type ReactNode } from 'react'

type Props = {
   title: string
   // How many there are in all, shown beside the title.
   count?: number
   action?: ReactNode
   children: ReactNode
}

// A card of the profile with its heading. Every section is a landmark of its own, named by its heading.
export const Section = ({ title, count, action, children }: Props) => (
   <Card className="gap-4">
      <CardHeader>
         <h2 className="text-base leading-none font-semibold">
            {title}
            {count === undefined ? null : <span className="text-muted-foreground font-normal"> ({count})</span>}
         </h2>
         {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</CardContent>
   </Card>
)
