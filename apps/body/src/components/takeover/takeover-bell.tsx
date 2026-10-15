import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Bell, BellOff } from 'lucide-react'

import { askForNotifications, playBoop, setEnabled, unlockSound } from './alert'
import { useAlertSettings } from './use-takeover-alert'

// The owner's control over the alert: sound on or off, why it is blocked, and permission for desktop notifications.
export const TakeoverBell = () => {
   const { enabled, sound, notifications } = useAlertSettings()
   const blocked = enabled && sound === 'blocked'
   const label = enabled ? (blocked ? 'Sound is blocked. Click to turn it on' : 'Alert sound on') : 'Alert sound off'
   const Icon = enabled ? Bell : BellOff

   const click = async () => {
      if (enabled && sound === 'running') {
         setEnabled(false)

         return
      }

      setEnabled(true)
      await unlockSound()
      playBoop()
   }

   return (
      <div className="ml-auto flex items-center gap-1">
         {notifications === 'default' && (
            <Button variant="ghost" size="sm" onClick={() => void askForNotifications()}>
               Allow desktop alerts
            </Button>
         )}
         <Tooltip>
            <TooltipTrigger asChild>
               <Button
                  variant="ghost"
                  size="icon"
                  aria-label={label}
                  className={blocked ? 'text-warning' : undefined}
                  onClick={() => void click()}
               >
                  <Icon />
               </Button>
            </TooltipTrigger>
            <TooltipContent>
               {label}.{' '}
               {blocked
                  ? 'If it stays blocked, allow sound for this site in the browser (Chrome: Site settings, Sound; Firefox: Permissions, Autoplay).'
                  : 'It plays when a sign-in needs you.'}
            </TooltipContent>
         </Tooltip>
      </div>
   )
}
