import { NavMain } from '@/components/nav-main'
import { type ExternalLink as ExternalNavLink, NavSecondary } from '@/components/nav-secondary'
import { NavUser } from '@/components/nav-user'
import {
   Sidebar,
   SidebarContent,
   SidebarFooter,
   SidebarHeader,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar'
import { ExternalLink, Send } from 'lucide-react'
import { type ComponentProps } from 'react'
import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router'

import { authConfig } from '../auth/authConfig'
import { toProfile } from '../auth/profile'
import { trpc } from '../trpc'
import { groupsFor } from './nav-groups'

const navSecondary: ExternalNavLink[] = [{ title: 'Manage account', href: authConfig.accountUrl, icon: ExternalLink }]

export const AppSidebar = (props: ComponentProps<typeof Sidebar>) => {
   const { user } = useAuth()
   const me = trpc.me.useQuery(undefined, {
      retry: false,
      staleTime: 5 * 60 * 1000,
   })
   const waiting = trpc.draft.counts.useQuery(undefined, {
      retry: false,
      refetchInterval: 60_000,
      staleTime: 30_000,
   }).data?.waiting

   return (
      <Sidebar collapsible="offcanvas" {...props}>
         <SidebarHeader>
            <SidebarMenu>
               <SidebarMenuItem>
                  <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
                     <Link to="/dashboard">
                        <Send className="size-5!" />
                        <span className="text-base font-semibold">automatedLinkedIn</span>
                     </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            </SidebarMenu>
         </SidebarHeader>
         <SidebarContent>
            <NavMain groups={groupsFor({ admin: me.data?.user?.role === 'ADMIN', waiting })} />
            <NavSecondary items={navSecondary} className="mt-auto" />
         </SidebarContent>
         <SidebarFooter>{user ? <NavUser profile={toProfile(user.profile)} /> : null}</SidebarFooter>
      </Sidebar>
   )
}
