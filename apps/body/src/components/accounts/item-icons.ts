import { LogIn, type LucideIcon, MessagesSquare, ScanEye, Users } from 'lucide-react'

import { type ItemName } from './today'

// One icon for each of the four checks, so a row and its button say what they are at a glance.
export const ITEM_ICONS: Record<ItemName, LucideIcon> = {
   login: LogIn,
   visit: ScanEye,
   messages: MessagesSquare,
   network: Users,
}
