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
   LayoutDashboard,
   ListChecks,
   Network,
   Send,
   Target,
   UserCircle,
   Users,
   Video,
} from 'lucide-react'
import { type ComponentProps } from 'react'
import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router'

import { authConfig } from '../auth/authConfig'
import { toProfile } from '../auth/profile'

const navMain: NavItem[] = [
   { title: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
   { title: 'LinkedIn accounts', to: '/accounts', icon: Briefcase },
   { title: 'LinkedIn profiles', to: '/profiles', icon: Users },
   { title: 'LinkedIn companies', to: '/companies', icon: Building2 },
   { title: 'LinkedIn posts', to: '/posts', icon: FileText },
   { title: 'Lists', to: '/lists', icon: ListChecks },
   { title: 'Ideal customers', to: '/icps', icon: Target },
   { title: 'Proxies', to: '/proxies', icon: Network },
   { title: 'Sessions', to: '/sessions', icon: Video },
   { title: 'Service status', to: '/healthstatus', icon: Activity },
   { title: 'Profile', to: '/profile', icon: UserCircle },
]

const navSecondary: ExternalNavLink[] = [{ title: 'Manage account', href: authConfig.accountUrl, icon: ExternalLink }]

export const AppSidebar = (props: ComponentProps<typeof Sidebar>) => {
   const { user } = useAuth()

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
            <NavMain items={navMain} />
            <NavSecondary items={navSecondary} className="mt-auto" />
         </SidebarContent>
         <SidebarFooter>{user ? <NavUser profile={toProfile(user.profile)} /> : null}</SidebarFooter>
      </Sidebar>
   )
}
