import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.tsx'
import { OidcProvider } from './auth/OidcProvider.tsx'
import './index.css'
import { TrpcProvider } from './trpc/TrpcProvider.tsx'

createRoot(document.getElementById('root')!).render(
   <StrictMode>
      <BrowserRouter>
         <OidcProvider>
            <TrpcProvider>
               <App />
            </TrpcProvider>
         </OidcProvider>
      </BrowserRouter>
   </StrictMode>
)
