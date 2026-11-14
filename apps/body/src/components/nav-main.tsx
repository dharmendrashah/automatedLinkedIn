import {
   SidebarGroup,
   SidebarGroupContent,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'

import { type NavGroup, activeGroupLabel, isActivePath } from './nav-groups'

export type NavItem = {
   title: string
   to: string
   icon: LucideIcon
   // A count beside the title; none when it is 0.
   badge?: number
}

// The menu in groups. Each group has a label that opens and closes it and its icons carry the group's colour. A group starts
// closed unless it holds the page being looked at; a group the user opened or closed by hand stays as they left it.
export const NavMain = ({ groups }: { groups: NavGroup[] }) => {
   const { pathname } = useLocation()
   const [chosen, setChosen] = useState<Record<string, boolean>>({})
   const active = activeGroupLabel(groups, pathname)

   return (
      <>
         {groups.map(group => {
            const open = chosen[group.label] ?? group.label === active
            const waiting = group.items.reduce((sum, item) => sum + (item.badge ?? 0), 0)

            return (
               <Collapsible.Root
                  key={group.label}
                  open={open}
                  onOpenChange={next => setChosen(current => ({ ...current, [group.label]: next }))}
               >
                  <SidebarGroup>
                     <Collapsible.Trigger asChild>
                        <SidebarGroupLabel asChild>
                           <button type="button" className="w-full cursor-pointer justify-between">
                              {group.label}
                              <span className="flex items-center gap-1.5">
                                 {!open && waiting > 0 ? (
                                    <span className="bg-sidebar-primary text-sidebar-primary-foreground min-w-5 rounded-md px-1 text-center text-xs tabular-nums">
                                       {waiting}
                                    </span>
                                 ) : null}
                                 {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                              </span>
                           </button>
                        </SidebarGroupLabel>
                     </Collapsible.Trigger>
                     <Collapsible.Content>
                        <SidebarGroupContent>
                           <SidebarMenu>
                              {group.items.map(item => (
                                 <SidebarMenuItem key={item.to}>
                                    <SidebarMenuButton
                                       asChild
                                       tooltip={item.title}
                                       isActive={isActivePath(item.to, pathname)}
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
                     </Collapsible.Content>
                  </SidebarGroup>
               </Collapsible.Root>
            )
         })}
      </>
   )
}
