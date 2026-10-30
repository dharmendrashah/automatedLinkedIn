import { Button } from '@/components/ui/button'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
   children: ReactNode
   // A new key (another page or person) clears the error and shows the children again.
   resetKey?: string
}

type State = { error: Error | null; key: string | undefined }

// Catches a crash below it so the rest of the app keeps working, and offers to try again instead of a blank page.
export class ErrorBoundary extends Component<Props, State> {
   state: State = {
      error: null,
      key: this.props.resetKey,
   }

   static getDerivedStateFromError(error: Error): Partial<State> {
      return { error }
   }

   static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
      return props.resetKey === state.key
         ? null
         : {
              error: null,
              key: props.resetKey,
           }
   }

   componentDidCatch(error: Error, info: ErrorInfo) {
      console.error(error, info.componentStack)
   }

   render() {
      if (!this.state.error) {
         return this.props.children
      }

      return (
         <div role="alert" className="grid justify-items-start gap-2 p-4">
            <p className="font-medium">Something went wrong here.</p>
            <p className="text-muted-foreground text-sm">{this.state.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
               Try again
            </Button>
         </div>
      )
   }
}
