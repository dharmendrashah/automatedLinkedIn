import {
   SidebarGroup,
   SidebarGroupContent,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar'
import { type LucideIcon } from 'lucide-react'
import { type ComponentPropsWithoutRef } from 'react'

export type ExternalLink = {
   title: string
   href: string
   icon: LucideIcon
}

export const NavSecondary = ({
   items,
   ...props
}: { items: ExternalLink[] } & ComponentPropsWithoutRef<typeof SidebarGroup>) => (
   <SidebarGroup {...props}>
      <SidebarGroupContent>
         <SidebarMenu>
            {items.map(item => (
               <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                     <a href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                     </a>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroupContent>
   </SidebarGroup>
)
