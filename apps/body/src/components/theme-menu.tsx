import { Button } from '@/components/ui/button'
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

const THEMES = [
   {
      value: 'system',
      label: 'System',
      Icon: Monitor,
   },
   {
      value: 'light',
      label: 'Light',
      Icon: Sun,
   },
   {
      value: 'dark',
      label: 'Dark',
      Icon: Moon,
   },
] as const

// The header's choice of colours: follow the device (the default), or always light or dark.
export const ThemeMenu = () => {
   const { theme, setTheme } = useTheme()
   const current = THEMES.find(({ value }) => value === theme) ?? THEMES[0]

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button
               variant="ghost"
               size="icon"
               aria-label={`Theme: ${current.label}`}
               title={`Theme: ${current.label}`}
            >
               <current.Icon />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={current.value} onValueChange={setTheme}>
               {THEMES.map(({ value, label, Icon }) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                     <Icon className="size-4" />
                     {label}
                  </DropdownMenuRadioItem>
               ))}
            </DropdownMenuRadioGroup>
         </DropdownMenuContent>
      </DropdownMenu>
   )
}
