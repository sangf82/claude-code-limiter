import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Activity, Settings, LogOut, Loader2, AlertCircle } from 'lucide-react';
import { Toaster, toast } from 'sonner';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [loading, setLoading] = useState(false);

  // Login handler
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const password = new FormData(e.currentTarget).get('password') as string;
    
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('adminToken', data.token);
        toast.success('Logged in successfully');
      } else {
        toast.error(data.error || 'Login failed');
      }
    } catch (err) {
      toast.error('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('adminToken');
    toast.info('Logged out');
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-primary)]">
        <Toaster theme="dark" position="top-right" />
        <div className="w-full max-w-md p-8 rounded-2xl border border-[var(--border)] glass shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
               <Activity className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Claude Limiter</h1>
              <p className="text-[var(--text-secondary)] text-sm mt-1">Admin Authorization</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Admin Password</label>
              <input 
                name="password"
                type="password" 
                autoFocus
                required
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="Enter password..."
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Authenticate'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard layout
  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans antialiased overflow-hidden">
      <Toaster theme="dark" position="top-right" />
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-[var(--border)] flex flex-col glass z-10 shrink-0">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-[var(--border)]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight">Limiter Admin</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
            { id: 'users', icon: Users, label: 'Users & Keys' },
            { id: 'analytics', icon: Activity, label: 'Live Analytics' },
            { id: 'settings', icon: Settings, label: 'Settings' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === item.id 
                ? 'bg-[var(--bg-tertiary)] text-white shadow-sm' 
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white'
              }`}
            >
              <item.icon className="w-4 h-4 opacity-70" />
              {item.label}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-[var(--border)]">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-[var(--bg-secondary)]">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-[var(--border)] glass sticky top-0 z-10">
          <h2 className="text-lg font-semibold tracking-tight capitalize">{activeTab.replace('-', ' ')}</h2>
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
               WebSocket Connected
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-y-auto p-8 border-l border-white/[0.02]">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             
            {/* Overview Content */}
            {activeTab === 'overview' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Users', value: '45', trend: '+12% from last week' },
                    { label: 'Tokens Used (Today)', value: '1.2M', trend: 'Normal volume' },
                    { label: 'Active Sessions', value: '18', trend: 'Live right now' },
                    { label: 'Blocked Requests', value: '3', trend: 'Rate limit hit' },
                  ].map((stat, i) => (
                    <div key={i} className="p-6 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-sm hover:border-[var(--text-secondary)] transition-colors">
                      <p className="text-sm text-[var(--text-secondary)] font-medium mb-2">{stat.label}</p>
                      <h3 className="text-3xl font-semibold tracking-tight">{stat.value}</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-2">{stat.trend}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 p-6 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] h-96 flex items-center justify-center text-[var(--text-secondary)]">
                    Chart Placeholder (Add Recharts here)
                  </div>
                  <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] flex flex-col">
                    <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Live Event Feed</h3>
                    <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                       {/* Placeholder feed */}
                       {[1,2,3,4,5].map(i => (
                         <div key={i} className="flex gap-3 text-sm pb-4 border-b border-[var(--border)] last:border-0">
                           <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0"></div>
                           <div>
                             <p className="text-[var(--text-primary)]">User {i} generated response</p>
                             <p className="text-[var(--text-secondary)] text-xs mt-0.5">2 mins ago • claude-3-opus</p>
                           </div>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Other tabs placeholder */}
            {activeTab !== 'overview' && (
               <div className="flex flex-col items-center justify-center h-96 border border-dashed border-[var(--border)] rounded-xl text-[var(--text-secondary)]">
                 <AlertCircle className="w-8 h-8 mb-4 opacity-50" />
                 <p>This module ({activeTab}) is coming soon.</p>
               </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
