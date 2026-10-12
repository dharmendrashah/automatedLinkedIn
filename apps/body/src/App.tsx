import { FailureCard } from '@/components/failure-card'
import { Route, Routes } from 'react-router'

import { DashboardLayout } from './layouts/DashboardLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { Accounts } from './pages/Accounts'
import { Callback } from './pages/Callback'
import { Dashboard } from './pages/Dashboard'
import { HealthStatus } from './pages/HealthStatus'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'
import { Proxies } from './pages/Proxies'
import { Sessions } from './pages/Sessions'
import { Signup } from './pages/Signup'

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
         <Route path="/dashboard" element={<Dashboard />} />
         <Route path="/accounts" element={<Accounts />} />
         <Route path="/proxies" element={<Proxies />} />
         <Route path="/sessions" element={<Sessions />} />
         <Route path="/healthstatus" element={<HealthStatus />} />
         <Route path="/profile" element={<Profile />} />
      </Route>
   </Routes>
)

export default App
