import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { UserAvatar } from '@/components/user-avatar'
import { ChevronsUpDown, LogOut, UserCircle } from 'lucide-react'
import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router'

import { type Profile } from '../auth/profile'

export const NavUser = ({ profile }: { profile: Profile }) => {
   const { isMobile } = useSidebar()
   const { signoutRedirect } = useAuth()

   const identity = (
      <>
         <UserAvatar name={profile.displayName} className="h-8 w-8 rounded-lg" />
         <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{profile.displayName}</span>
            <span className="text-muted-foreground truncate text-xs">{profile.email ?? profile.username}</span>
         </div>
      </>
   )

   return (
      <SidebarMenu>
         <SidebarMenuItem>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                     size="lg"
                     className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                     {identity}
                     <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
               </DropdownMenuTrigger>
               <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side={isMobile ? 'bottom' : 'right'}
                  align="end"
                  sideOffset={4}
               >
                  <DropdownMenuLabel className="p-0 font-normal">
                     <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{identity}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                     <Link to="/profile">
                        <UserCircle />
                        Profile
                     </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signoutRedirect()}>
                     <LogOut />
                     Log out
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </SidebarMenuItem>
      </SidebarMenu>
   )
}
