import { FailureCard } from '@/components/failure-card'
import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router'

import { DashboardLayout } from './layouts/DashboardLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { Accounts } from './pages/Accounts'
import { Callback } from './pages/Callback'
import { Companies } from './pages/Companies'
import { HealthStatus } from './pages/HealthStatus'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Posts } from './pages/Posts'
import { Profile } from './pages/Profile'
import { Profiles } from './pages/Profiles'
import { Proxies } from './pages/Proxies'
import { Sessions } from './pages/Sessions'
import { Signup } from './pages/Signup'

// The dashboard carries the charts and the data table, the heaviest code in the app.
const Dashboard = lazy(() => import('./pages/Dashboard').then(({ Dashboard: page }) => ({ default: page })))

const App = () => (
   <Routes>
      <Route element={<PublicLayout />}>
         <Route path="/" element={<Home />} />
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
         <Route
            path="/dashboard"
            element={
               <Suspense fallback={null}>
                  <Dashboard />
               </Suspense>
            }
         />
         <Route path="/accounts" element={<Accounts />} />
         <Route path="/profiles" element={<Profiles />} />
         <Route path="/companies" element={<Companies />} />
         <Route path="/posts" element={<Posts />} />
         <Route path="/proxies" element={<Proxies />} />
         <Route path="/sessions" element={<Sessions />} />
         <Route path="/healthstatus" element={<HealthStatus />} />
         <Route path="/profile" element={<Profile />} />
      </Route>
   </Routes>
)

export default App
