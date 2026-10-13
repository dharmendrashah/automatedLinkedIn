import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileSearch, Loader2, MoreHorizontal, Pencil, RefreshCw, ScanSearch, Trash2 } from 'lucide-react'

import { type Proxy, type ProxyHandlers } from './types'

import { browserTestBlocker } from './browser-test'

// The less common things to do with a proxy; the suggested ones sit on the card itself.
export const ProxyMenu = ({ proxy, handlers }: { proxy: Proxy; handlers: ProxyHandlers }) => {
   const blocker = browserTestBlocker(proxy.status, handlers.browserTestAnnounced)
   const busy = handlers.busyId === proxy.id

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More for ${proxy.host}:${proxy.port}`}>
               {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handlers.onDetails(proxy)}>
               <FileSearch />
               See the full report
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onTest(proxy)}>
               <RefreshCw />
               Test again
            </DropdownMenuItem>
            <DropdownMenuItem disabled={Boolean(blocker)} onSelect={() => handlers.onBrowserTest(proxy)}>
               <ScanSearch />
               Run a browser check
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onEdit(proxy)}>
               <Pencil />
               Edit details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => handlers.onDelete(proxy)}>
               <Trash2 />
               Remove
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   )
}
