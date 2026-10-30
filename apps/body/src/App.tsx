import { FailureCard } from '@/components/failure-card'
import { ConnectionsRedirect, ListsRedirect } from '@/components/my-network/redirects'
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'

import { DashboardLayout } from './layouts/DashboardLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { Callback } from './pages/Callback'
import { Companies } from './pages/Companies'
import { HealthStatus } from './pages/HealthStatus'
import { Icps } from './pages/Icps'
import { Jobs } from './pages/Jobs'
import { Login } from './pages/Login'
import { Posting } from './pages/Posting'
import { Posts } from './pages/Posts'
import { Profile } from './pages/Profile'
import { Sessions } from './pages/Sessions'
import { Signup } from './pages/Signup'
import { Usage } from './pages/Usage'
import { WorkflowNew } from './pages/WorkflowNew'
import { Workflows } from './pages/Workflows'

// The dashboard carries the charts and the data table, the heaviest code in the app.
const Dashboard = lazy(() => import('./pages/Dashboard').then(({ Dashboard: page }) => ({ default: page })))
// The canvas carries React Flow, the next heaviest.
const WorkflowPage = lazy(() => import('./pages/Workflow').then(({ WorkflowPage: page }) => ({ default: page })))
// The inbox carries the virtual list and the composer, and is only opened by some of the visits.
const Unibox = lazy(() => import('./pages/Unibox').then(({ Unibox: page }) => ({ default: page })))
// My network carries the people table, the drawer and the profile view.
const Network = lazy(() => import('./pages/Network').then(({ Network: page }) => ({ default: page })))
// The accounts list carries the browsing heatmap, the drawers and the Today checklist.
const Accounts = lazy(() => import('./pages/Accounts').then(({ Accounts: page }) => ({ default: page })))
// The proxies page carries the health checks, the score history and its drawers.
const Proxies = lazy(() => import('./pages/Proxies').then(({ Proxies: page }) => ({ default: page })))
// The profile of an account carries a dozen cards, and is only opened from the accounts list.
const AccountProfile = lazy(() =>
   import('./pages/AccountProfile').then(({ AccountProfile: page }) => ({ default: page }))
)
// The post canvas carries the blocks, the preview and the schedule dialog, and is only opened after an account is picked.
const PostingCanvas = lazy(() => import('./pages/PostingCanvas').then(({ PostingCanvas: page }) => ({ default: page })))
// Design previews on invented data, served by the development server only (left out of a build).
const FiltersPreview = import.meta.env.DEV
   ? lazy(() =>
        import('./pages/previews/NetworkFiltersPreview').then(({ NetworkFiltersPreview: page }) => ({ default: page }))
     )
   : null

const App = () => (
   <Routes>
      {FiltersPreview ? (
         <Route
            path="/preview/network-filters"
            element={
               <Suspense fallback={null}>
                  <FiltersPreview />
               </Suspense>
            }
         />
      ) : null}
      <Route element={<PublicLayout />}>
         <Route path="/login" element={<Login />} />
         <Route path="/signup" element={<Signup />} />
         <Route path="/callback" element={<Callback />} />
         <Route
            path="*"
            element={
               <FailureCard title="Page not found" message="This page does not exist." to="/" action="Back to home" />
            }
         />
      </Route>
      <Route element={<DashboardLayout />}>
         <Route path="/" element={<Navigate to="/dashboard" replace />} />
         <Route
            path="/dashboard"
            element={
               <Suspense fallback={null}>
                  <Dashboard />
               </Suspense>
            }
         />
         <Route
            path="/unibox/:conversationId?"
            element={
               <Suspense fallback={null}>
                  <Unibox />
               </Suspense>
            }
         />
         <Route
            path="/network/:accountId?"
            element={
               <Suspense fallback={null}>
                  <Network />
               </Suspense>
            }
         />
         <Route path="/posting" element={<Posting />} />
         <Route
            path="/posting/:accountId/:draftId?"
            element={
               <Suspense fallback={null}>
                  <PostingCanvas />
               </Suspense>
            }
         />
         <Route
            path="/accounts"
            element={
               <Suspense fallback={null}>
                  <Accounts />
               </Suspense>
            }
         />
         <Route
            path="/accounts/:id"
            element={
               <Suspense fallback={null}>
                  <AccountProfile />
               </Suspense>
            }
         />
         <Route path="/accounts/:accountId/connections" element={<ConnectionsRedirect />} />
         <Route path="/profiles" element={<Navigate to="/network?found=target" replace />} />
         <Route path="/companies" element={<Companies />} />
         <Route path="/posts" element={<Posts />} />
         <Route path="/lists" element={<ListsRedirect />} />
         <Route path="/icps" element={<Icps />} />
         <Route path="/workflows" element={<Workflows />} />
         <Route path="/workflows/new" element={<WorkflowNew />} />
         <Route
            path="/workflows/:id"
            element={
               <Suspense fallback={null}>
                  <WorkflowPage />
               </Suspense>
            }
         />
         <Route path="/usage" element={<Usage />} />
         <Route
            path="/proxies"
            element={
               <Suspense fallback={null}>
                  <Proxies />
               </Suspense>
            }
         />
         <Route path="/sessions" element={<Sessions />} />
         <Route path="/healthstatus" element={<HealthStatus />} />
         <Route path="/jobs" element={<Jobs />} />
         <Route path="/profile" element={<Profile />} />
      </Route>
   </Routes>
)

export default App
