import { AppSidebar } from '@/components/app-sidebar'
import { DetailStackProvider } from '@/components/details/detail-stack'
import { ErrorBoundary } from '@/components/error-boundary'
import { SiteHeader } from '@/components/site-header'
import { TakeoverBanner } from '@/components/takeover/takeover-banner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Outlet, useLocation } from 'react-router'
import { Toaster } from 'sonner'

import { RequireAuth } from '../auth/RequireAuth'

// A crash in one page shows an error in its place and clears when another page is opened.
const Page = () => (
   <ErrorBoundary where="page" resetKey={useLocation().key}>
      <Outlet />
   </ErrorBoundary>
)

export const DashboardLayout = () => (
   <RequireAuth>
      <DetailStackProvider>
         <SidebarProvider
            style={
               {
                  '--sidebar-width': 'calc(var(--spacing) * 72)',
                  '--header-height': 'calc(var(--spacing) * 12)',
               } as React.CSSProperties
            }
         >
            <AppSidebar variant="inset" />
            <SidebarInset>
               <SiteHeader />
               <div className="flex flex-1 flex-col">
                  <div className="@container/main flex flex-1 flex-col gap-2">
                     <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                        <TakeoverBanner />
                        <Page />
                     </div>
                  </div>
               </div>
            </SidebarInset>
            <Toaster position="bottom-center" />
         </SidebarProvider>
      </DetailStackProvider>
   </RequireAuth>
)
