import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

// The text is fixed on purpose: no server message reaches the page.
export const DashboardError = ({ onRetry }: { onRetry: () => void }) => (
   <Card>
      <CardHeader>
         <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            The dashboard could not be loaded.
         </CardTitle>
         <CardDescription>Your numbers are not lost. Try again in a moment.</CardDescription>
      </CardHeader>
      <CardFooter>
         <Button variant="outline" onClick={onRetry}>
            Retry
         </Button>
      </CardFooter>
   </Card>
)
