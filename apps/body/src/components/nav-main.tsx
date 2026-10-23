import {
   SidebarGroup,
   SidebarGroupContent,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar'
import { type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'

export type NavItem = {
   title: string
   to: string
   icon: LucideIcon
}

export const NavMain = ({ items }: { items: NavItem[] }) => {
   const { pathname } = useLocation()

   return (
      <SidebarGroup>
         <SidebarGroupContent>
            <SidebarMenu>
               {items.map(item => (
                  <SidebarMenuItem key={item.to}>
                     <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
                     >
                        <Link to={item.to}>
                           <item.icon />
                           <span>{item.title}</span>
                        </Link>
                     </SidebarMenuButton>
                  </SidebarMenuItem>
               ))}
            </SidebarMenu>
         </SidebarGroupContent>
      </SidebarGroup>
   )
}
