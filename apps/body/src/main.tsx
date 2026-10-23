import { TooltipProvider } from '@/components/ui/tooltip'
import { PageTitle } from '@/components/page-title'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.tsx'
import { OidcProvider } from './auth/OidcProvider.tsx'
import './index.css'
import { TrpcProvider } from './trpc/TrpcProvider.tsx'

createRoot(document.getElementById('root')!).render(
   <StrictMode>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
         <TooltipProvider>
            <BrowserRouter>
               <PageTitle />
               <OidcProvider>
                  <TrpcProvider>
                     <App />
                  </TrpcProvider>
               </OidcProvider>
            </BrowserRouter>
         </TooltipProvider>
      </ThemeProvider>
   </StrictMode>
)
