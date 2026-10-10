import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router'

export const Callback = () => {
   const { error } = useAuth()

   if (error) {
      return (
         <section className="card">
            <h1>Sign in failed</h1>
            <p className="error">{error.message}</p>
            <Link to="/login">Try again</Link>
         </section>
      )
   }

   return <p className="status">Signing you in…</p>
}
