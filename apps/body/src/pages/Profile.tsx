import { useAuth } from 'react-oidc-context'

import { authConfig } from '../auth/authConfig'
import { toProfile } from '../auth/profile'

export const Profile = () => {
   const { user, signoutRedirect } = useAuth()

   if (!user) return null

   const profile = toProfile(user.profile)

   return (
      <section className="card">
         <h1>Your profile</h1>
         <dl className="details">
            <dt>Name</dt>
            <dd>{profile.displayName}</dd>
            <dt>Username</dt>
            <dd>{profile.username ?? '—'}</dd>
            <dt>Email</dt>
            <dd>
               {profile.email ?? '—'}
               {profile.email && !profile.emailVerified ? ' (not verified)' : ''}
            </dd>
            <dt>Groups</dt>
            <dd>{profile.groups.length ? profile.groups.join(', ') : '—'}</dd>
            <dt>User ID</dt>
            <dd>{profile.id}</dd>
         </dl>
         <div className="actions">
            <a href={authConfig.accountUrl}>Manage account</a>
            <button type="button" onClick={() => void signoutRedirect()}>
               Log out
            </button>
         </div>
      </section>
   )
}
