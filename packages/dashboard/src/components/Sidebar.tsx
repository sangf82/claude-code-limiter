import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface SidebarProps {
  teamName: string;
  open: boolean;
  onClose: () => void;
  connectionState: 'connected' | 'connecting' | 'disconnected';
}

const navItems = [
  {
    to: '/dashboard/',
    label: 'Overview',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
        <rect x="10.5" y="2" width="5.5" height="5.5" rx="1" />
        <rect x="2" y="10.5" width="5.5" height="5.5" rx="1" />
        <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1" />
      </svg>
    ),
    end: true,
  },
  {
    to: '/dashboard/analytics',
    label: 'Analytics',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 15h14" />
        <path d="M3 15V9" />
        <path d="M7 15V5" />
        <path d="M11 15V8" />
        <path d="M15 15V3" />
      </svg>
    ),
  },
  {
    to: '/dashboard/settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="2.5" />
        <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.4 3.4l1.4 1.4M13.2 13.2l1.4 1.4M3.4 14.6l1.4-1.4M13.2 4.8l1.4-1.4" />
      </svg>
    ),
  },
];

const connectionDotColor = {
  connected: 'bg-green-400',
  connecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-zinc-500',
};

const connectionLabels = {
  connected: 'Live',
  connecting: 'Reconnecting...',
  disconnected: 'Disconnected',
};

export function Sidebar({ teamName, open, onClose, connectionState }: SidebarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    api.logout();
    navigate('/dashboard/login');
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-zinc-950 border-r border-zinc-800 z-50
          flex flex-col
          transition-transform duration-200 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo / Team name */}
        <div className="px-5 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
              CL
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100 truncate">
                {teamName || 'Claude Limiter'}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${connectionDotColor[connectionState]}`} />
                <span className="text-[10px] text-zinc-500">{connectionLabels[connectionState]}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-100 ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`
              }
            >
              <span className="flex-shrink-0 opacity-70">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-zinc-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors duration-100 w-full cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15H3a1 1 0 01-1-1V4a1 1 0 011-1h3" />
              <path d="M12 12l3-3-3-3" />
              <path d="M15 9H7" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

export function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
      aria-label="Open menu"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    </button>
  );
}
