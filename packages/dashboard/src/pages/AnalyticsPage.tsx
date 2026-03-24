import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { AnalyticsData, Device } from '../lib/types';
import { timeAgo } from '../lib/utils';
import { Card, CardHeader, CardBody } from '../components/Card';
import { Select } from '../components/Input';
import { Table } from '../components/Table';
import { TrendLineChart, PeakHoursChart, DonutChart, BlockRateGauge } from '../components/Charts';
import { SkeletonPage } from '../components/Skeleton';

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAnalytics({ days });
      setData(res);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <SkeletonPage />;
  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Failed to load analytics
      </div>
    );
  }

  // Build DAU trend
  const dauPts: Array<{ day: string; value: number }> = [];
  const dayMap: Record<string, number> = {};
  for (const d of data.daily_active ?? []) {
    dayMap[d.date] = d.users;
  }
  const today = new Date();
  for (let td = Math.min(days, 30) - 1; td >= 0; td--) {
    const d = new Date(today);
    d.setDate(d.getDate() - td);
    const key = d.toISOString().split('T')[0];
    dauPts.push({ day: key, value: dayMap[key] ?? 0 });
  }

  const devices: Array<Device & { user_name?: string; user_slug?: string }> = data.devices ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-100">Analytics</h2>
        <div className="w-40">
          <Select
            value={String(days)}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Avg Prompt Length" value={data.avg_prompt_length ?? 0} sub="chars" />
        <StatCard label="Avg Response Length" value={data.avg_response_length ?? 0} sub="chars" />
        <StatCard
          label="Prompts / Session"
          value={data.avg_prompts_per_session ?? 0}
        />
        <StatCard
          label="Block Rate"
          value={
            data.block_rate
              ? `${(data.block_rate.rate * 100).toFixed(1)}%`
              : '0%'
          }
          sub={
            data.block_rate
              ? `${data.block_rate.blocked}/${data.block_rate.total} blocked`
              : ''
          }
        />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left */}
        <div className="space-y-6">
          {/* Model Distribution */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Model Distribution</h3>
            </CardHeader>
            <CardBody className="flex justify-center">
              {data.model_distribution ? (
                <DonutChart data={data.model_distribution} />
              ) : (
                <p className="text-sm text-zinc-500 py-4">No data</p>
              )}
            </CardBody>
          </Card>

          {/* Block Rate Gauge */}
          {data.block_rate && (
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-zinc-200">Block Rate</h3>
              </CardHeader>
              <CardBody className="flex justify-center">
                <BlockRateGauge total={data.block_rate.total} blocked={data.block_rate.blocked} />
              </CardBody>
            </Card>
          )}

          {/* Top Projects */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Top Projects</h3>
            </CardHeader>
            <CardBody flush>
              <Table
                columns={[
                  { key: 'project', header: 'Project', render: (p) => <span className="text-zinc-200">{p.project}</span> },
                  { key: 'count', header: 'Prompts', render: (p) => <span className="font-mono">{p.count}</span>, className: 'text-right' },
                ]}
                data={data.project_usage ?? []}
                keyExtractor={(p) => p.project}
                emptyMessage="No project data yet"
              />
            </CardBody>
          </Card>
        </div>

        {/* Right */}
        <div className="space-y-6">
          {/* Daily Active Users */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Daily Active Users</h3>
            </CardHeader>
            <CardBody>
              <TrendLineChart data={dauPts} />
            </CardBody>
          </Card>

          {/* Peak Hours */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-zinc-200">Peak Usage Hours</h3>
            </CardHeader>
            <CardBody>
              {data.peak_hours && data.peak_hours.length > 0 ? (
                <PeakHoursChart data={data.peak_hours} />
              ) : (
                <p className="text-sm text-zinc-500 py-4 text-center">No peak hour data</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Devices table */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-zinc-200">Devices</h3>
        </CardHeader>
        <CardBody flush>
          <Table
            columns={[
              { key: 'hostname', header: 'Hostname', render: (d) => <span className="text-zinc-200">{d.hostname || 'unknown'}</span> },
              { key: 'user', header: 'User', render: (d) => d.user_name || d.user_slug || '' },
              { key: 'platform', header: 'Platform', render: (d) => `${d.platform || ''}${d.arch ? ` (${d.arch})` : ''}` },
              { key: 'os', header: 'OS Version', render: (d) => <span className="text-xs">{d.os_version || ''}</span> },
              { key: 'claude', header: 'Claude', render: (d) => <span className="text-xs">{d.claude_version || ''}</span> },
              { key: 'seen', header: 'Last Seen', render: (d) => <span className="text-xs">{timeAgo(d.last_seen)}</span> },
              { key: 'ip', header: 'IP', render: (d) => <span className="font-mono text-xs">{d.last_ip || ''}</span> },
            ]}
            data={devices}
            keyExtractor={(d) => d.id}
            emptyMessage="No devices registered yet"
          />
        </CardBody>
      </Card>
    </div>
  );
}

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
