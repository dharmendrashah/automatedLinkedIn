import {
   SidebarGroup,
   SidebarGroupContent,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar'
import { type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import type { NavGroup } from './nav-groups'

export type NavItem = {
   title: string
   to: string
   icon: LucideIcon
   // A count beside the title; none when it is 0.
   badge?: number
}

// The menu in groups: each has a small label, and its icons carry the group's colour.
export const NavMain = ({ groups }: { groups: NavGroup[] }) => {
   const { pathname } = useLocation()

   return (
      <>
         {groups.map(group => (
            <SidebarGroup key={group.label}>
               <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
               <SidebarGroupContent>
                  <SidebarMenu>
                     {group.items.map(item => (
                        <SidebarMenuItem key={item.to}>
                           <SidebarMenuButton
                              asChild
                              tooltip={item.title}
                              isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
                           >
                              <Link to={item.to}>
                                 <item.icon className={group.iconClass} />
                                 <span>{item.title}</span>
                              </Link>
                           </SidebarMenuButton>
                           {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                        </SidebarMenuItem>
                     ))}
                  </SidebarMenu>
               </SidebarGroupContent>
            </SidebarGroup>
         ))}
      </>
   )
}
