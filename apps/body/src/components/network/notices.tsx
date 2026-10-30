import { Button } from '@/components/ui/button'
import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link } from 'react-router'

type EmptyProps = {
   icon: LucideIcon
   title: string
   text: ReactNode
   action?: ReactNode
}

// An empty list, a missing account or a problem, said in the middle of the space the list would have filled.
export const EmptyState = ({ icon: Icon, title, text, action }: EmptyProps) => (
   <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
         <Icon className="size-6" aria-hidden />
      </span>
      <div className="grid gap-1">
         <p className="font-medium">{title}</p>
         <p className="text-muted-foreground max-w-md text-sm">{text}</p>
      </div>
      {action}
   </div>
)

export const ToAccounts = ({ label }: { label: string }) => (
   <Button asChild variant="outline" size="sm">
      <Link to="/accounts">{label}</Link>
   </Button>
)
