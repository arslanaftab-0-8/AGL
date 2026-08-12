import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from './ui';

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean };

const iconCls = 'h-[18px] w-[18px]';

const NAV: NavItem[] = [
  {
    to: '/sheet',
    label: 'Pickup Sheet',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 3h6M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: '/map',
    label: 'Dispatch Map',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m9 4 6 2 4-1.5v12L15 18l-6-2-4 1.5v-12L9 4Z" strokeLinejoin="round" />
        <path d="M9 4v12M15 6v12" />
      </svg>
    ),
  },
  {
    to: '/routes',
    label: 'Routes',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="6" cy="19" r="2.5" />
        <circle cx="18" cy="5" r="2.5" />
        <path d="M8.5 19h6a4 4 0 0 0 0-8h-5a4 4 0 0 1 0-8h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/stops',
    label: 'Stops',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2 4 5.5v6c0 4.6 3.4 8.4 8 10 4.6-1.6 8-5.4 8-10v-6Z" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/financials',
    label: 'Financials',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M16 15h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
        <path d="M8 7h8M8 11h8M8 15h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/trends',
    label: 'Trends',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/driver-day',
    label: 'Driver Day',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-3.3 3.6-5 8-5s8 1.7 8 5" strokeLinecap="round" />
        <path d="M16 2.5 21 4l-1.2 3.5H17L16 2.5ZM13 17v2h-2v-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/clinics',
    label: 'Clinics',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M10 10h.01M14 10h.01" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/drivers',
    label: 'Drivers',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M19 17a4 4 0 0 0-3.1-3.9M8 14a4 4 0 0 0-3 3.9M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/dispatchers',
    label: 'Dispatchers',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 4h16v12H4zM8 20h8M12 16v4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/carriers',
    label: 'Carriers',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9l4 4v6a2 2 0 0 1-2 2ZM9 17v2h5v-2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 9h12" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/states',
    label: 'States',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    to: '/guide',
    label: 'Guide',
    icon: (
      <svg className={iconCls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 19.5V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H19" strokeLinejoin="round" />
        <path d="M9 8h6M9 12h4" strokeLinecap="round" />
      </svg>
    ),
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-4 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-900/40">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 2 4 5.5v6c0 4.6 3.4 8.4 8 10 4.6-1.6 8-5.4 8-10v-6Z" strokeLinejoin="round" />
          <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-bold tracking-tight text-white">AGL Audit</p>
        <p className="text-[11px] text-slate-400">QA & Dispatch Platform</p>
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar (md+) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-slate-900 md:flex">
        <Brand />
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/5 px-4 py-3">
          <p className="text-[11px] text-slate-500">Pickup sheet · v0.10.0</p>
          <p className="text-[11px] text-slate-600">Local deployment · SQLite</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M12 2 4 5.5v6c0 4.6 3.4 8.4 8 10 4.6-1.6 8-5.4 8-10v-6Z" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-900">AGL Audit</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main className="min-w-0 flex-1 px-4 pb-12 pt-24 md:px-8 md:pt-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
