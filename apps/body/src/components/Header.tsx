import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router'

import { toProfile } from '../auth/profile'

export const Header = () => {
   const auth = useAuth()

   return (
      <header className="header">
         <Link to="/" className="brand">
            automatedLinkedIn
         </Link>
         <nav className="nav">
            {auth.isLoading ? null : auth.isAuthenticated && auth.user ? (
               <>
                  <Link to="/profile">{toProfile(auth.user.profile).displayName}</Link>
                  <button type="button" onClick={() => void auth.signoutRedirect()}>
                     Log out
                  </button>
               </>
            ) : (
               <>
                  <Link to="/login">Log in</Link>
                  <Link to="/signup" className="primary">
                     Sign up
                  </Link>
               </>
            )}
         </nav>
      </header>
   )
}
