import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api } from './lib/api';
import { ws } from './lib/ws';
import type { Team } from './lib/types';
import { useWebSocket } from './hooks/useWebSocket';
import { useToast } from './hooks/useToast';
import { Sidebar, HamburgerButton } from './components/Sidebar';
import { ToastContainer } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

function AuthenticatedLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [teamName, setTeamName] = useState(api.getStoredTeam()?.name ?? 'Claude Limiter');
  const { connectionState, events: wsEvents, lastEvent, connect, disconnect } = useWebSocket();
  const { toasts, showToast, removeToast } = useToast();
  const navigate = useNavigate();

  // Connect WS on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Handle WS events for toasts
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'user_blocked') {
      showToast(
        'User Blocked',
        `${lastEvent.userName ?? 'Unknown'} was blocked on ${lastEvent.model ?? 'unknown'}`,
        'warning',
        8000
      );
    }
    if (lastEvent.type === 'user_killed' || (lastEvent.type === 'user_status_change' && lastEvent.newStatus === 'killed')) {
      showToast(
        'User Killed',
        `${lastEvent.userName ?? 'Unknown'} has been killed`,
        'error',
        8000
      );
    }
  }, [lastEvent, showToast]);

  // Auth redirect
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      navigate('/dashboard/login', { replace: true });
    });
  }, [navigate]);

  const handleTeamUpdate = useCallback((team: Team) => {
    setTeamName(team.name);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar
        teamName={teamName}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        connectionState={connectionState}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950 sticky top-0 z-30">
          <HamburgerButton onClick={() => setSidebarOpen(true)} />
          <span className="text-sm font-semibold text-zinc-300">{teamName}</span>
          <div className="w-8" />
        </div>

        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Routes>
            <Route
              index
              element={<OverviewPage wsEvents={wsEvents} showToast={showToast} />}
            />
            <Route
              path="users/:id"
              element={<UserDetailPage showToast={showToast} />}
            />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route
              path="settings"
              element={<SettingsPage showToast={showToast} onTeamUpdate={handleTeamUpdate} />}
            />
            <Route path="*" element={<Navigate to="/dashboard/" replace />} />
          </Routes>
        </div>
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  if (!api.isAuthenticated()) {
    return <Navigate to="/dashboard/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { toasts, showToast, removeToast } = useToast();

  const handleLogin = useCallback(() => {
    // Team info gets stored by the api.login call
  }, []);

  return (
    <>
      <Routes>
        <Route path="/dashboard/login" element={<LoginPage onLogin={handleLogin} />} />
        <Route
          path="/dashboard/*"
          element={
            <AuthGuard>
              <AuthenticatedLayout />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard/" replace />} />
      </Routes>
    </>
  );
}
