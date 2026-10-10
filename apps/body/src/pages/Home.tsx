import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router'

import { toProfile } from '../auth/profile'

export const Home = () => {
   const { isAuthenticated, user } = useAuth()

   if (isAuthenticated && user) {
      return (
         <section className="card">
            <h1>Welcome, {toProfile(user.profile).displayName}</h1>
            <p>
               <Link to="/profile">View your profile</Link>
            </p>
         </section>
      )
   }

   return (
      <section className="card">
         <h1>Automate your LinkedIn outreach</h1>
         <p>Sign in or create an account to get started.</p>
         <div className="actions">
            <Link to="/login">Log in</Link>
            <Link to="/signup" className="primary">
               Sign up
            </Link>
         </div>
      </section>
   )
}
