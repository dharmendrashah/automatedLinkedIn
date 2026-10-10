import { Route, Routes } from 'react-router'

import './App.css'
import { RequireAuth } from './auth/RequireAuth'
import { Header } from './components/Header'
import { Callback } from './pages/Callback'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'
import { Signup } from './pages/Signup'

const App = () => (
   <>
      <Header />
      <main className="main">
         <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/callback" element={<Callback />} />
            <Route
               path="/profile"
               element={
                  <RequireAuth>
                     <Profile />
                  </RequireAuth>
               }
            />
            <Route path="*" element={<p className="status">Page not found.</p>} />
         </Routes>
      </main>
   </>
)

export default App
