import { useAuth } from 'react-oidc-context'

import { authConfig } from '../auth/authConfig'
import { toProfile } from '../auth/profile'
import { trpc } from '../trpc'

export const Profile = () => {
   const { user, signoutRedirect } = useAuth()

   const me = trpc.me.useQuery(undefined, { retry: false })

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

         <h2>Backend account</h2>
         {me.isPending ? <p className="status">Checking with the API…</p> : null}
         {me.error ? <p className="error">{me.error.message}</p> : null}
         {me.data?.user ? (
            <dl className="details">
               <dt>Account</dt>
               <dd>{me.data.user.id}</dd>
               <dt>Role</dt>
               <dd>{me.data.user.role}</dd>
               <dt>API sees you as</dt>
               <dd>{me.data.identity.username ?? me.data.identity.id}</dd>
            </dl>
         ) : null}
         {me.data && !me.data.user ? (
            <p>
               The API recognises your login ({me.data.identity.username ?? me.data.identity.id}) but there is no
               account record linked to it yet.
            </p>
         ) : null}

         <div className="actions">
            <a href={authConfig.accountUrl}>Manage account</a>
            <button type="button" onClick={() => void signoutRedirect()}>
               Log out
            </button>
         </div>
      </section>
   )
}
