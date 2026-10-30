import { ErrorPage } from '@/components/error-page'
import { reportError } from '@/lib/app-error'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
   children: ReactNode
   // Where it sits, for the error report: 'app', 'page', 'person-drawer'.
   where: string
   // A new key (another page or person) clears the error and shows the children again.
   resetKey?: string
   fullScreen?: boolean
}

type State = { error: Error | null; key: string | undefined }

// Catches a crash below it and shows the error page in its place instead of a blank screen.
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
      reportError(error, {
         where: this.props.where,
         componentStack: info.componentStack,
      })
   }

   render() {
      if (!this.state.error) {
         return this.props.children
      }

      return (
         <ErrorPage
            error={this.state.error}
            fullScreen={this.props.fullScreen}
            onRetry={() => this.setState({ error: null })}
         />
      )
   }
}
