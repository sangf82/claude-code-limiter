import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.login(password);
      onLogin();
      navigate('/dashboard/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div
        className={`w-full max-w-sm ${shaking ? 'animate-shake' : ''}`}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white text-lg font-bold mb-4">
            CL
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">Claude Code Limiter</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in to your dashboard</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <Input
              type="password"
              label="Admin Password"
              placeholder="Enter your admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 animate-fade-in">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={loading}
              size="lg"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
