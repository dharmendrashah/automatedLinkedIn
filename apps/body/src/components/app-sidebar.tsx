import { type NavItem, NavMain } from '@/components/nav-main'
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
import {
   Activity,
   Briefcase,
   Building2,
   ExternalLink,
   FileText,
   Inbox,
   LayoutDashboard,
   Network,
   Send,
   SquarePen,
   Target,
   Timer,
   UserCircle,
   UserPlus,
   Video,
   Wallet,
   Workflow as WorkflowIcon,
} from 'lucide-react'
import { type ComponentProps } from 'react'
import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router'

import { authConfig } from '../auth/authConfig'
import { toProfile } from '../auth/profile'
import { trpc } from '../trpc'

const navMain: NavItem[] = [
   { title: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
   { title: 'Unibox', to: '/unibox', icon: Inbox },
   { title: 'My network', to: '/network', icon: UserPlus },
   { title: 'Write a post', to: '/posting', icon: SquarePen },
   { title: 'LinkedIn accounts', to: '/accounts', icon: Briefcase },
   { title: 'LinkedIn companies', to: '/companies', icon: Building2 },
   { title: 'LinkedIn posts', to: '/posts', icon: FileText },
   { title: 'Workflows', to: '/workflows', icon: WorkflowIcon },
   { title: 'Ideal customers', to: '/icps', icon: Target },
   { title: 'Usage', to: '/usage', icon: Wallet },
   { title: 'Proxies', to: '/proxies', icon: Network },
   { title: 'Sessions', to: '/sessions', icon: Video },
   { title: 'Service status', to: '/healthstatus', icon: Activity },
   { title: 'Profile', to: '/profile', icon: UserCircle },
]

// Only the platform owner sees it; the page and the API refuse everyone else as well.
const cronMonitor: NavItem = {
   title: 'Cron monitor',
   to: '/jobs',
   icon: Timer,
}

const navSecondary: ExternalNavLink[] = [{ title: 'Manage account', href: authConfig.accountUrl, icon: ExternalLink }]

export const AppSidebar = (props: ComponentProps<typeof Sidebar>) => {
   const { user } = useAuth()
   const me = trpc.me.useQuery(undefined, {
      retry: false,
      staleTime: 5 * 60 * 1000,
   })
   const items =
      me.data?.user?.role === 'ADMIN' ? [...navMain.slice(0, -1), cronMonitor, ...navMain.slice(-1)] : navMain

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
            <NavMain items={items} />
            <NavSecondary items={navSecondary} className="mt-auto" />
         </SidebarContent>
         <SidebarFooter>{user ? <NavUser profile={toProfile(user.profile)} /> : null}</SidebarFooter>
      </Sidebar>
   )
}
