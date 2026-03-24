import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { User, DailyUsageRow, UsageEvent, AnalyticsData } from '../lib/types';
import { hashColor, getInitials, getModelLimit, getCreditRule, timeAgo } from '../lib/utils';
import { Card, CardHeader, CardBody } from '../components/Card';
import { StatusBadge, Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Table } from '../components/Table';
import { CreditGauge } from '../components/CreditGauge';
import { HorizontalBarChart, TrendLineChart, PeakHoursChart } from '../components/Charts';
import { SkeletonPage } from '../components/Skeleton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditLimitsModal } from './EditLimitsModal';

interface UserDetailPageProps {
  showToast: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export function UserDetailPage({ showToast }: UserDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [usageDaily, setUsageDaily] = useState<DailyUsageRow[]>([]);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editLimitsOpen, setEditLimitsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    action: string;
    title: string;
    message: string;
    confirmLabel: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [u, usageRes, eventsRes, analyticsRes] = await Promise.all([
        api.getUser(id),
        api.getUsage({ user_id: id, days: 30 }),
        api.getEvents({ user_id: id, limit: 20 }),
        api.getAnalytics({ user_id: id, days: 30 }),
      ]);
      setUser(u);
      setUsageDaily(usageRes.daily ?? []);
      setEvents(eventsRes.events ?? []);
      setAnalytics(analyticsRes);
    } catch (err) {
      showToast('Error', err instanceof Error ? err.message : 'Failed to load user', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusAction = async (status: string) => {
    if (!id || !user) return;
    try {
      await api.updateUser(id, { status });
      showToast(
        status === 'paused' ? 'User Paused' : status === 'killed' ? 'User Killed' : 'User Reinstated',
        `${user.name} is now ${status}`,
        status === 'killed' ? 'error' : status === 'paused' ? 'warning' : 'success'
      );
      setConfirmAction(null);
      loadData();
    } catch (err) {
      showToast('Error', err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const handleDelete = async () => {
    if (!id || !user) return;
    try {
      await api.deleteUser(id);
      showToast('User Deleted', `${user.name} has been removed`, 'success');
      navigate('/dashboard/');
    } catch (err) {
      showToast('Error', err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  if (loading) return <SkeletonPage />;
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <p>User not found</p>
        <Link to="/dashboard/" className="text-blue-400 hover:underline mt-2">Back to overview</Link>
      </div>
    );
  }

  const limits = user.limits ?? [];
  const usage = user.usage ?? {};
  const dailyUsage: Record<string, number> = usage.daily?.counts ?? {};
  const creditRule = getCreditRule(limits);
  const color = hashColor(user.name || user.slug);

  // Build bar chart data
  const barData = ['opus', 'sonnet', 'haiku'].map((m) => ({
    label: m.charAt(0).toUpperCase() + m.slice(1),
    value: dailyUsage[m] ?? 0,
    limit: getModelLimit(limits, m) > 0 ? getModelLimit(limits, m) : 0,
  }));

  // Build trend data
  const dayMap: Record<string, number> = {};
  for (const row of usageDaily) {
    dayMap[row.day] = (dayMap[row.day] ?? 0) + row.count;
  }
  const trendData: Array<{ day: string; value: number }> = [];
  const today = new Date();
  for (let td = 29; td >= 0; td--) {
    const d = new Date(today);
    d.setDate(d.getDate() - td);
    const key = d.toISOString().split('T')[0];
    trendData.push({ day: key, value: dayMap[key] ?? 0 });
  }

  const userDevices = user.devices ?? [];
  const userProjects = analytics?.project_usage ?? [];
  const userPeakHours = analytics?.peak_hours ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link to="/dashboard/" className="hover:text-zinc-300 transition-colors">Overview</Link>
        <span>/</span>
        <span className="text-zinc-300">{user.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-zinc-100">{user.name}</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditLimitsOpen(true)}>
            Edit Limits
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              setConfirmAction({
                action: 'delete',
                title: 'Delete User',
                message: `Permanently delete ${user.name}? This removes all their usage data and cannot be undone.`,
                confirmLabel: 'Delete',
              })
            }
          >
            Delete User
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardBody className="flex flex-col items-center text-center space-y-3">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                style={{ background: color }}
              >
                {getInitials(user.name)}
              </div>
              <div>
                <div className="text-lg font-semibold text-zinc-100">{user.name}</div>
                <div className="text-sm text-zinc-500">@{user.slug}</div>
              </div>
              <StatusBadge status={user.status} />
              <div className="text-xs text-zinc-500 space-y-1 w-full text-left pt-2">
                <div>Last seen: {timeAgo(user.last_seen)}</div>
                <div>Created: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</div>
              </div>

              {/* Action buttons */}
              <div className="w-full space-y-2 pt-2">
                {user.status === 'active' && (
                  <>
                    <Button
                      size="sm"
                      variant="warning"
                      fullWidth
                      onClick={() =>
                        setConfirmAction({
                          action: 'paused',
                          title: 'Pause User',
                          message: `Pause ${user.name}? They will not be able to use Claude Code until reinstated.`,
                          confirmLabel: 'Pause',
                        })
                      }
                    >
                      Pause User
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      fullWidth
                      onClick={() =>
                        setConfirmAction({
                          action: 'killed',
                          title: 'Kill User',
                          message: `Kill ${user.name}? This will revoke their Claude Code access.`,
                          confirmLabel: 'Kill',
                        })
                      }
                    >
                      Kill User
                    </Button>
                  </>
                )}
                {user.status === 'paused' && (
                  <>
                    <Button size="sm" variant="success" fullWidth onClick={() => handleStatusAction('active')}>
                      Reinstate
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      fullWidth
                      onClick={() =>
                        setConfirmAction({
                          action: 'killed',
                          title: 'Kill User',
                          message: `Kill ${user.name}?`,
                          confirmLabel: 'Kill',
                        })
                      }
                    >
                      Kill User
                    </Button>
                  </>
                )}
                {user.status === 'killed' && (
                  <Button size="sm" variant="success" fullWidth onClick={() => handleStatusAction('active')}>
                    Reinstate
                  </Button>
                )}
              </div>

              {/* Credit gauge */}
              {creditRule && user.credit_budget && user.credit_budget > 0 && (
                <div className="pt-4">
                  <CreditGauge
                    used={user.credit_budget - (user.credit_balance ?? 0)}
                    total={user.credit_budget}
                  />
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Per-model usage */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Per-Model Usage (Daily)</h3>
            </CardHeader>
            <CardBody>
              <HorizontalBarChart data={barData} />
            </CardBody>
          </Card>

          {/* Active Limits */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Active Limits</h3>
              <Button size="sm" variant="ghost" onClick={() => setEditLimitsOpen(true)}>
                Edit
              </Button>
            </CardHeader>
            <CardBody>
              {limits.length === 0 ? (
                <p className="text-sm text-zinc-500">No limits configured. This user has unlimited access.</p>
              ) : (
                <div className="space-y-2">
                  {limits.map((rule, idx) => (
                    <LimitItem key={idx} rule={rule} />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* 30-day trend */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">30-Day Usage Trend</h3>
            </CardHeader>
            <CardBody>
              <TrendLineChart data={trendData} />
            </CardBody>
          </Card>

          {/* Devices */}
          {userDevices.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-zinc-200">Devices</h3>
              </CardHeader>
              <CardBody flush>
                <Table
                  columns={[
                    { key: 'hostname', header: 'Hostname', render: (d) => <span className="text-zinc-200">{d.hostname || 'unknown'}</span> },
                    { key: 'platform', header: 'Platform', render: (d) => `${d.platform || ''}${d.arch ? ` (${d.arch})` : ''}` },
                    { key: 'claude', header: 'Claude', render: (d) => <span className="text-xs">{d.claude_version || ''}</span> },
                    { key: 'seen', header: 'Last Seen', render: (d) => <span className="text-xs">{timeAgo(d.last_seen)}</span> },
                    { key: 'ip', header: 'IP', render: (d) => <span className="font-mono text-xs">{d.last_ip || ''}</span> },
                  ]}
                  data={userDevices}
                  keyExtractor={(d) => d.id}
                />
              </CardBody>
            </Card>
          )}

          {/* Top Projects */}
          {userProjects.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-zinc-200">Top Projects (30d)</h3>
              </CardHeader>
              <CardBody flush>
                <Table
                  columns={[
                    { key: 'project', header: 'Project', render: (p) => <span className="text-zinc-200">{p.project}</span> },
                    { key: 'count', header: 'Prompts', render: (p) => <span className="font-mono">{p.count}</span>, className: 'text-right' },
                  ]}
                  data={userProjects}
                  keyExtractor={(p) => p.project}
                />
              </CardBody>
            </Card>
          )}

          {/* Peak Hours */}
          {userPeakHours.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-zinc-200">Peak Usage Hours (30d)</h3>
              </CardHeader>
              <CardBody>
                <PeakHoursChart data={userPeakHours} />
              </CardBody>
            </Card>
          )}

          {/* Recent activity */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Recent Activity</h3>
            </CardHeader>
            <CardBody flush>
              <Table
                columns={[
                  { key: 'time', header: 'Time', render: (e) => <span className="font-mono text-xs">{timeAgo(e.timestamp)}</span> },
                  { key: 'model', header: 'Model', render: (e) => <Badge variant="model">{e.model}</Badge> },
                  { key: 'credits', header: 'Credits', render: (e) => <span className="font-mono">{e.credit_cost}</span>, className: 'text-right' },
                ]}
                data={events}
                keyExtractor={(e) => e.id ?? `${e.timestamp}-${e.model}`}
                emptyMessage="No recent activity"
              />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Edit Limits Modal */}
      <EditLimitsModal
        open={editLimitsOpen}
        onClose={() => setEditLimitsOpen(false)}
        userId={id ?? null}
        onSaved={loadData}
        showToast={showToast}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.action === 'delete') {
            handleDelete();
          } else {
            handleStatusAction(confirmAction.action);
          }
        }}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.confirmLabel ?? 'Confirm'}
      />
    </div>
  );
}

function LimitItem({ rule }: { rule: { type: string; model?: string; window?: string; value?: number; schedule_start?: string; schedule_end?: string; schedule_tz?: string } }) {
  let desc = '';
  if (rule.type === 'credits') {
    desc = `Credit Budget (${rule.window ?? 'daily'})`;
  } else if (rule.type === 'per_model') {
    desc = `${rule.model ?? 'all models'} (${rule.window ?? 'daily'})`;
  } else if (rule.type === 'time_of_day') {
    desc = `${rule.model ?? 'all'} time restriction`;
  }

  let valStr = '';
  if (rule.type === 'time_of_day') {
    valStr = `${rule.schedule_start ?? '?'} - ${rule.schedule_end ?? '?'} ${rule.schedule_tz ?? ''}`;
  } else {
    valStr = rule.value === -1 ? 'unlimited' : rule.value === 0 ? 'blocked' : String(rule.value ?? '');
  }

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/30 border border-zinc-800">
      <div className="flex items-center gap-2">
        <Badge variant="model">{rule.type}</Badge>
        <span className="text-sm text-zinc-300">{desc}</span>
      </div>
      <span className="text-sm font-mono text-zinc-400">{valStr}</span>
    </div>
  );
}
