import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, HOME_REDIRECT_KEY, useAuth } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import EmployeeHome from "@/pages/EmployeeHome";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import CalendarPage from "@/pages/CalendarPage";
import Tasks from "@/pages/Tasks";
import Payments from "@/pages/Payments";
import Team from "@/pages/Team";
import Settings from "@/pages/Settings";
import Leads from "@/pages/Leads";
import Quotes from "@/pages/Quotes";
import Reports from "@/pages/Reports";
import VideoScripts from "@/pages/VideoScripts";
import AuditLog from "@/pages/AuditLog";
import Trash from "@/pages/Trash";

function Protected({ children, admin }) {
  const { user, isAdmin } = useAuth();
  if (user === null)
    return (
      <div className="flex h-screen items-center justify-center" data-testid="auth-loading">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    // Pagina iniziale preferita: si apre una volta per sessione, poi la Dashboard resta raggiungibile.
    let done = true;
    try { done = sessionStorage.getItem(HOME_REDIRECT_KEY) === "1"; sessionStorage.setItem(HOME_REDIRECT_KEY, "1"); } catch {}
    if (!done && user?.home_page && user.home_page !== "/") navigate(user.home_page, { replace: true });
  }, [user, navigate]);
  return isAdmin ? <Dashboard /> : <EmployeeHome />;
}

function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<Protected><AppShell /></Protected>}>
            <Route index element={<Home />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="task" element={<Tasks />} />
            <Route path="script-idee" element={<VideoScripts />} />
            <Route path="log" element={<Navigate to="/task" replace />} />
            <Route path="resoconti" element={<Protected admin><Reports /></Protected>} />
            <Route path="impostazioni" element={<Settings />} />
            <Route path="clienti" element={<Protected admin><Clients /></Protected>} />
            <Route path="clienti/:id" element={<Protected admin><ClientDetail /></Protected>} />
            <Route path="lead" element={<Protected admin><Leads /></Protected>} />
            <Route path="preventivi" element={<Protected admin><Quotes /></Protected>} />
            <Route path="pagamenti" element={<Protected admin><Payments /></Protected>} />
            <Route path="team" element={<Protected admin><Team /></Protected>} />
            <Route path="registro" element={<Protected admin><AuditLog /></Protected>} />
            <Route path="cestino" element={<Protected admin><Trash /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
