import { Routes, Route, NavLink } from 'react-router-dom'
import ReadingsPage from './pages/ReadingsPage'
import SamplesPage from './pages/SamplesPage'
import SettingsPage from './pages/SettingsPage'

const navCls = ({ isActive }) =>
  `relative px-2 py-[9px] font-medium text-[12px] lg:text-[13px] uppercase tracking-[0.17em] transition-all duration-300 whitespace-nowrap after:content-[''] after:absolute after:left-0 after:-bottom-0.5 after:h-[1px] after:bg-[#CFA04F] after:transition-all after:duration-300 ${
    isActive
      ? 'text-[#CFA04F] after:w-full'
      : 'text-white hover:text-[#CFA04F] after:w-0 hover:after:w-full'
  }`

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f2f5]">
      {/* Header */}
      <header className="bg-[rgb(23,28,32)] border-b border-[#3d4a54] px-3 lg:px-4 py-[10px] shadow-md sticky top-0 z-30 backdrop-blur-md bg-opacity-98">
        <div className="relative flex items-center gap-3 lg:gap-6">
          <div className="flex items-center gap-2.5 lg:gap-4 py-1">
            <img
              src="https://gk-website-tau.vercel.app/GK_LOGO_FINAL.png"
              alt="Gurukrupa Gold Logo"
              className="h-10 lg:h-12 w-auto object-contain"
            />
            <div className="flex flex-col border-l border-white/20 pl-2 lg:pl-3 items-center justify-center">
              <div className="flex items-baseline justify-center w-full">
                <span className="text-[12px] lg:text-[15px] font-medium tracking-[0.12em] lg:tracking-[0.18em] text-white uppercase leading-none">Gurukrupa</span>
                <span className="mx-1 lg:mx-1.5 h-1 w-1 rounded-full bg-[#CFA04F] shadow-[0_0_8px_#CFA04F]"></span>
                <span className="text-[12px] lg:text-[15px] font-bold tracking-[0.14em] lg:tracking-[0.2em] bg-gradient-to-r from-[#D4AF37] via-[#FBF5B7] to-[#AA771C] bg-clip-text text-transparent uppercase leading-none drop-shadow-[0_0_2px_rgba(212,175,55,0.3)]">Gold</span>
              </div>
              <div className="mt-1 flex flex-col items-center w-full text-center">
                <span className="block text-[8px] lg:text-[9px] tracking-[0.14em] lg:tracking-[0.2em] text-gray-300 uppercase font-medium leading-tight">Your Trusted Partner</span>
                <span className="block text-[8px] lg:text-[9px] tracking-[0.12em] lg:tracking-[0.18em] text-[#D9B25A] uppercase font-semibold leading-tight">For Gold & Silver</span>
              </div>
            </div>
          </div>
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            <NavLink to="/" end className={navCls}>Dashboard</NavLink>
            <NavLink to="/samples" className={navCls}>Reports Queue</NavLink>
            <NavLink to="/settings" className={navCls}>Settings</NavLink>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 p-2.5 overflow-hidden">
        <Routes>
          <Route path="/" element={<ReadingsPage />} />
          <Route path="/samples" element={<SamplesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
