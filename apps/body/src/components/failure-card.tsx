import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import { Link } from 'react-router'

type Props = {
   title: string
   message: string
   to: string
   action: string
}

export const FailureCard = ({ title, message, to, action }: Props) => (
   <Card className="mx-auto w-full max-w-md">
      <CardHeader>
         <CardTitle className="flex items-center gap-2">
            <AlertCircle className="text-destructive size-5" />
            {title}
         </CardTitle>
         <CardDescription className="text-destructive">{message}</CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter>
         <Button asChild variant="outline">
            <Link to={to}>{action}</Link>
         </Button>
      </CardFooter>
   </Card>
)
