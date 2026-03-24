import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { User, FeedItem, UsageEvent } from '../lib/types';
import { hashColor, getInitials, getModelLimit, getCreditRule, nextFeedId } from '../lib/utils';
import { Card, CardHeader, CardBody } from '../components/Card';
import { StatusBadge } from '../components/Badge';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/Button';
import { LiveFeed } from '../components/LiveFeed';
import { SkeletonPage } from '../components/Skeleton';
import { AddUserModal } from './AddUserModal';

interface OverviewPageProps {
  wsEvents: FeedItem[];
  showToast: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error', duration?: number) => void;
}

export function OverviewPage({ wsEvents, showToast }: OverviewPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const navigate = useNavigate();
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [usersRes, eventsRes] = await Promise.all([
        api.getUsers(),
        api.getEvents({ limit: 30 }),
      ]);
      setUsers(usersRes.users);

      // Convert API events to feed items
      const items: FeedItem[] = (eventsRes.events ?? []).map((evt: UsageEvent) => ({
        id: nextFeedId(),
        type: 'counted' as const,
        user: evt.user_name ?? 'Unknown',
        detail: `${evt.model} (+${evt.credit_cost} credits)`,
        time: evt.timestamp,
      }));
      setFeedItems(items);
    } catch {
      // handled by API interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent refresh for user cards
  const silentRefresh = useCallback(async () => {
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadData();
    refreshTimerRef.current = setInterval(silentRefresh, 30000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [loadData, silentRefresh]);

  // Merge WS events with initial feed
  const allFeedItems = [...wsEvents, ...feedItems].slice(0, 50);

  const handleUserAction = async (userId: string, action: 'pause' | 'kill' | 'reinstate', userName: string) => {
    const statusMap = { pause: 'paused', kill: 'killed', reinstate: 'active' } as const;
    try {
      await api.updateUser(userId, { status: statusMap[action] });
      showToast(
        action === 'pause' ? 'User Paused' : action === 'kill' ? 'User Killed' : 'User Reinstated',
        `${userName} has been ${statusMap[action]}`,
        action === 'kill' ? 'error' : action === 'pause' ? 'warning' : 'success'
      );
      silentRefresh();
    } catch (err) {
      showToast('Error', err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  if (loading) return <SkeletonPage />;

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const pausedUsers = users.filter((u) => u.status === 'paused').length;
  const killedUsers = users.filter((u) => u.status === 'killed').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-100">Overview</h2>
        <Button variant="primary" onClick={() => setAddModalOpen(true)}>
          + Add User
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="Active" value={activeUsers} color="text-green-400" />
        <StatCard label="Paused" value={pausedUsers} color="text-yellow-400" />
        <StatCard label="Killed" value={killedUsers} color="text-red-400" />
      </div>

      {/* Two columns: users + live feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User cards */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Users</h3>
            </CardHeader>
            <CardBody>
              {users.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-zinc-500">
                  <p className="text-sm">No users yet. Click "Add User" to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {users.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      onClick={() => navigate(`/dashboard/users/${user.id}`)}
                      onAction={handleUserAction}
                    />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Live Feed */}
        <div>
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Live Feed</h3>
            </CardHeader>
            <CardBody flush>
              <LiveFeed events={allFeedItems} />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Add User Modal */}
      <AddUserModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onCreated={() => {
          silentRefresh();
        }}
        showToast={showToast}
      />
    </div>
  );
}

/* ---- Sub-components ---- */

function StatCard({ label, value, color, sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <Card>
      <div className="p-4">
        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color ?? 'text-zinc-100'}`}>{value}</div>
        {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
      </div>
    </Card>
  );
}

function UserCard({
  user,
  onClick,
  onAction,
}: {
  user: User;
  onClick: () => void;
  onAction: (userId: string, action: 'pause' | 'kill' | 'reinstate', userName: string) => void;
}) {
  const limits = user.limits ?? [];
  const usage = user.usage ?? {};
  const dailyUsage: Record<string, number> = usage.daily?.counts ?? {};
  const creditRule = getCreditRule(limits);
  const color = hashColor(user.name || user.slug);

  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700 p-4 cursor-pointer transition-all duration-150"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            style={{ background: color }}
          >
            {getInitials(user.name)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-100 truncate">{user.name}</div>
            <div className="text-xs text-zinc-500 truncate">@{user.slug}</div>
          </div>
        </div>
        <StatusBadge status={user.status} />
      </div>

      {/* Usage bars */}
      <div className="space-y-2 mb-3">
        {creditRule && user.credit_budget && user.credit_budget > 0 && (
          <ProgressBar
            label="Credits"
            used={user.credit_budget - (user.credit_balance ?? 0)}
            limit={user.credit_budget}
          />
        )}
        {['opus', 'sonnet', 'haiku'].map((m) => {
          const mLimit = getModelLimit(limits, m);
          const mUsed = dailyUsage[m] ?? 0;
          if (mLimit > 0 || mUsed > 0) {
            return (
              <ProgressBar
                key={m}
                label={m}
                used={mUsed}
                limit={mLimit > 0 ? mLimit : 0}
              />
            );
          }
          return null;
        })}
        {!creditRule && !['opus', 'sonnet', 'haiku'].some((m) => {
          const mLimit = getModelLimit(limits, m);
          const mUsed = dailyUsage[m] ?? 0;
          return mLimit > 0 || mUsed > 0;
        }) && (
          <p className="text-xs text-zinc-600">No limits configured</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {user.status === 'active' ? (
          <>
            <Button
              size="sm"
              variant="warning"
              onClick={(e) => { e.stopPropagation(); onAction(user.id, 'pause', user.name); }}
            >
              Pause
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => { e.stopPropagation(); onAction(user.id, 'kill', user.name); }}
            >
              Kill
            </Button>
          </>
        ) : user.status === 'paused' ? (
          <>
            <Button
              size="sm"
              variant="success"
              onClick={(e) => { e.stopPropagation(); onAction(user.id, 'reinstate', user.name); }}
            >
              Reinstate
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => { e.stopPropagation(); onAction(user.id, 'kill', user.name); }}
            >
              Kill
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="success"
            onClick={(e) => { e.stopPropagation(); onAction(user.id, 'reinstate', user.name); }}
          >
            Reinstate
          </Button>
        )}
      </div>
    </div>
  );
}
