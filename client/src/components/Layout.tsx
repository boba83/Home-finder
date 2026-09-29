import { Bell, Home, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Oglasi', icon: Home, end: true },
  { to: '/podesavanja', label: 'Podešavanja', icon: Settings, end: false },
  { to: '/notifikacije', label: 'Notifikacije', icon: Bell, end: false },
];

export function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="bg-card/85 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <NavLink to="/" className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">Home Finder</div>
              <div className="text-muted-foreground hidden text-xs sm:block">Fruška gora • placevi, kuće, vikendice</div>
            </div>
          </NavLink>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-5 pb-28 md:pb-10">
        <Outlet />
      </main>

      <nav className="bg-card/95 pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md md:hidden">
        <div className="grid grid-cols-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn('flex flex-col items-center gap-1 pt-2 text-xs font-medium', isActive ? 'text-primary' : 'text-muted-foreground')
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
