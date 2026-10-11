import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/user-avatar'
import { BadgeCheck, ExternalLink, LogOut } from 'lucide-react'
import { type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'

import { authConfig } from '../auth/authConfig'
import { toProfile } from '../auth/profile'
import { trpc } from '../trpc'

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
   <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm break-all sm:col-span-2">{children}</dd>
   </div>
)

export const Profile = () => {
   const { user, signoutRedirect } = useAuth()
   const me = trpc.me.useQuery(undefined, { retry: false })

   if (!user) return null

   const profile = toProfile(user.profile)

   return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 lg:px-6">
         <Card>
            <CardHeader className="flex-row items-center gap-4">
               <UserAvatar name={profile.displayName} className="size-16 rounded-full text-lg" />
               <div className="grid gap-1">
                  <CardTitle className="text-xl">{profile.displayName}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                     {profile.email ?? profile.username}
                     {profile.email ? (
                        profile.emailVerified ? (
                           <Badge variant="secondary" className="gap-1">
                              <BadgeCheck className="size-3" />
                              Verified
                           </Badge>
                        ) : (
                           <Badge variant="outline">Not verified</Badge>
                        )
                     ) : null}
                  </CardDescription>
               </div>
            </CardHeader>
            <CardContent>
               <dl className="divide-y">
                  <Row label="Name">{profile.displayName}</Row>
                  <Row label="Username">{profile.username ?? '—'}</Row>
                  <Row label="Email">{profile.email ?? '—'}</Row>
                  <Row label="Groups">
                     {profile.groups.length ? (
                        <span className="flex flex-wrap gap-1">
                           {profile.groups.map(group => (
                              <Badge key={group} variant="outline">
                                 {group}
                              </Badge>
                           ))}
                        </span>
                     ) : (
                        '—'
                     )}
                  </Row>
                  <Row label="User ID">{profile.id}</Row>
               </dl>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
               <Button asChild>
                  <a href={authConfig.accountUrl}>
                     <ExternalLink />
                     Edit details
                  </a>
               </Button>
               <Button variant="outline" onClick={() => void signoutRedirect()}>
                  <LogOut />
                  Log out
               </Button>
               <p className="text-muted-foreground w-full text-xs">
                  Name, email and password are managed on your authentik account page.
               </p>
            </CardFooter>
         </Card>

         <Card>
            <CardHeader>
               <CardTitle>Backend account</CardTitle>
               <CardDescription>How the API sees you.</CardDescription>
            </CardHeader>
            <CardContent>
               {me.isPending ? <Skeleton className="h-16 w-full" /> : null}
               {me.error ? <p className="text-destructive text-sm">{me.error.message}</p> : null}
               {me.data?.user ? (
                  <dl className="divide-y">
                     <Row label="Account">{me.data.user.id}</Row>
                     <Row label="Role">
                        <Badge variant="secondary">{me.data.user.role}</Badge>
                     </Row>
                     <Row label="API sees you as">{me.data.identity.username ?? me.data.identity.id}</Row>
                  </dl>
               ) : null}
               {me.data && !me.data.user ? (
                  <p className="text-muted-foreground text-sm">
                     The API recognises your login ({me.data.identity.username ?? me.data.identity.id}) but there is no
                     account record linked to it yet.
                  </p>
               ) : null}
            </CardContent>
         </Card>
      </div>
   )
}
