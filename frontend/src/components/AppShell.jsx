import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  CalendarDays, ChartNoAxesCombined, FileText, KanbanSquare, LayoutDashboard, LogOut, Menu, Receipt, Settings, Target, UserCog, Users, Video,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { initials } from "@/lib/constants";
import NotificationsBell from "@/components/NotificationsBell";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { to: "/clienti", label: "Clienti", icon: Users, id: "clienti" },
  { to: "/lead", label: "Lead & appuntamenti", icon: Target, id: "lead" },
  { to: "/preventivi", label: "Preventivi", icon: FileText, id: "preventivi" },
  { to: "/calendario", label: "Calendario editoriale", icon: CalendarDays, id: "calendario" },
  { to: "/task", label: "WORK TO DO", icon: KanbanSquare, id: "task" },
  { to: "/script-idee", label: "Script & idee video", icon: Video, id: "script-idee" },
  { to: "/resoconti", label: "Resoconti", icon: ChartNoAxesCombined, id: "resoconti" },
  { to: "/pagamenti", label: "Pagamenti", icon: Receipt, id: "pagamenti" },
  { to: "/team", label: "Team & compensi", icon: UserCog, id: "team" },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings, id: "impostazioni" },
];
const EMPLOYEE_NAV = [
  { to: "/", label: "La mia giornata", icon: LayoutDashboard, id: "dashboard" },
  { to: "/calendario", label: "Calendario editoriale", icon: CalendarDays, id: "calendario" },
  { to: "/task", label: "WORK TO DO", icon: KanbanSquare, id: "task" },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings, id: "impostazioni" },
];

function SidebarBody({ onNavigate }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const nav = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;
  return (
    <div className="grain flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 font-extrabold text-white">S</div>
        <div>
          <p className="text-sm font-bold text-white">SMM Gestionale</p>
          <p className="text-[11px] uppercase tracking-widest text-slate-500">Agency suite</p>
        </div>
      </div>
      <nav className="mt-4 flex-1 space-y-1 px-3">
        {nav.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            data-testid={`nav-${id}`}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
              )
            }
          >
            <Icon className="h-4 w-4 transition-transform group-hover:scale-110" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-2xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-300">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white" data-testid="sidebar-user-name">{user?.name}</p>
            <p className="text-xs text-slate-500" data-testid="sidebar-user-role">{isAdmin ? "Amministratore" : "Dipendente"}</p>
          </div>
          <button
            data-testid="logout-button"
            onClick={() => { logout(); navigate("/login"); }}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Esci"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 md:block">
        <SidebarBody />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/70 bg-slate-50/80 px-4 backdrop-blur-xl sm:px-8">
          <button className="min-h-11 min-w-11 rounded-lg p-2 hover:bg-slate-200/60 md:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button">
            <Menu className="h-5 w-5" />
          </button>
          <p className="hidden text-sm text-slate-500 md:block" data-testid="topbar-date">
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <NotificationsBell />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
