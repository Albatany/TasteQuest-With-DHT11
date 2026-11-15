import { BrowserRouter, Route, Routes } from 'react-router'
import { Shell } from './components/Shell.tsx'
import { Empty } from './components/ui.tsx'
import { useRealtime } from './lib/socket.ts'
import { About } from './pages/About.tsx'
import { Arena } from './pages/Arena.tsx'
import { Device } from './pages/Device.tsx'
import { Feedback } from './pages/Feedback.tsx'
import { Kiosk } from './pages/Kiosk.tsx'
import { Leaderboard } from './pages/Leaderboard.tsx'
import { Operator } from './pages/Operator.tsx'
import { Overview } from './pages/Overview.tsx'
import { SimulatorProvider } from './sim/Simulator.tsx'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/kiosk" element={<Kiosk />} />
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="arena" element={<Arena />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="device" element={<Device />} />
        <Route path="operator" element={<Operator />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<Empty title="Halaman tidak ditemukan" />} />
      </Route>
    </Routes>
  )
}

export function App() {
  useRealtime()
  return (
    <BrowserRouter>
      {/* Simulator lives above the routes so a running demo game survives page changes. */}
      <SimulatorProvider>
        <AppRoutes />
      </SimulatorProvider>
    </BrowserRouter>
  )
}
