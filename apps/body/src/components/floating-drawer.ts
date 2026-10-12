import { cn } from '@/lib/utils'

// The look of the right-hand drawers: a rounded panel that floats away from the screen edge.
export const floatingDrawer = (maxWidth: string) =>
   cn(
      'data-[vaul-drawer-direction=right]:inset-y-3 data-[vaul-drawer-direction=right]:right-3',
      `data-[vaul-drawer-direction=right]:w-[calc(100%-1.5rem)] ${maxWidth}`,
      'data-[vaul-drawer-direction=right]:rounded-2xl data-[vaul-drawer-direction=right]:border shadow-2xl'
   )
