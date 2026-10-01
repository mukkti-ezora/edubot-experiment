import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/shell.css";

import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { Shell } from "./components/Shell";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Institutions } from "./pages/Institutions";
import { InstitutionDetail } from "./pages/InstitutionDetail";
import { Students } from "./pages/Students";
import { StudentDetail } from "./pages/StudentDetail";
import { Teachers } from "./pages/Teachers";
import { TeacherDetail } from "./pages/TeacherDetail";
import { Parents } from "./pages/Parents";
import { ParentDetail } from "./pages/ParentDetail";
import { Administrators } from "./pages/Administrators";
import { AdministratorDetail } from "./pages/AdministratorDetail";
import { Roles } from "./pages/Roles";
import { RoleDetail } from "./pages/RoleDetail";
import { Activity } from "./pages/Activity";
import { SettingsPage } from "./pages/Settings";
import { Profile } from "./pages/Profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function RequireAuth() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-1)" }}>
        <div className="skeleton" style={{ width: 120, height: 16 }} />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/institutions" element={<Institutions />} />
          <Route path="/institutions/:id" element={<InstitutionDetail />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentDetail />} />
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/teachers/:id" element={<TeacherDetail />} />
          <Route path="/parents" element={<Parents />} />
          <Route path="/parents/:id" element={<ParentDetail />} />
          <Route path="/administrators" element={<Administrators />} />
          <Route path="/administrators/:id" element={<AdministratorDetail />} />
          <Route path="/roles" element={<Roles />} />
          <Route path="/roles/:id" element={<RoleDetail />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);