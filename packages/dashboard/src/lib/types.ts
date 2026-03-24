/* ================================================================
   Shared TypeScript types for the Claude Code Limiter dashboard
   ================================================================ */

export interface LimitRule {
  id?: string;
  type: 'per_model' | 'credits' | 'time_of_day';
  model?: string;
  window?: string;
  value?: number;
  schedule_start?: string;
  schedule_end?: string;
  schedule_tz?: string;
}

export interface Device {
  id: string;
  hostname: string;
  platform: string;
  arch: string;
  os_version: string;
  claude_version: string;
  last_seen: string;
  last_ip: string;
}

export interface UsageCounts {
  [model: string]: number;
}

export interface UsageSummary {
  daily?: { counts: UsageCounts };
  weekly?: { counts: UsageCounts };
  monthly?: { counts: UsageCounts };
}

export interface User {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'paused' | 'killed';
  killed_at: string | null;
  last_seen: string | null;
  last_session: string | null;
  created_at: string;
  limits: LimitRule[];
  usage: UsageSummary;
  credit_balance: number | null;
  credit_budget: number | null;
  devices: Device[];
}

export interface Team {
  id: string;
  name: string;
  credit_weights: CreditWeights;
}

export interface CreditWeights {
  opus: number;
  sonnet: number;
  haiku: number;
  [key: string]: number;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  user_name: string;
  model: string;
  credit_cost: number;
  timestamp: string;
}

export interface DailyUsageRow {
  day: string;
  user_id?: string;
  user_name?: string;
  model: string;
  count: number;
  credits: number;
}

export interface AnalyticsData {
  avg_prompt_length: number;
  avg_response_length: number;
  avg_prompts_per_session: number;
  block_rate: {
    total: number;
    blocked: number;
    rate: number;
  };
  model_distribution: { [model: string]: number };
  peak_hours: Array<{ hour: number; count: number }>;
  daily_active: Array<{ date: string; users: number }>;
  project_usage: Array<{ project: string; count: number }>;
  devices: Array<Device & { user_name?: string; user_slug?: string }>;
}

export interface CreateUserPayload {
  name: string;
  slug: string;
  limits?: LimitRule[];
}

export interface UpdateUserPayload {
  name?: string;
  slug?: string;
  status?: string;
  limits?: LimitRule[];
}

export interface UpdateSettingsPayload {
  name?: string;
  credit_weights?: CreditWeights;
  admin_password?: string;
}

export interface LoginResponse {
  token: string;
  team: Team;
}

export interface CreateUserResponse {
  user: {
    id: string;
    slug: string;
    name: string;
    status: string;
    auth_token: string;
    created_at: string;
  };
  limits: LimitRule[];
  install_code: string;
}

export type WSEventType =
  | 'user_check'
  | 'user_blocked'
  | 'user_counted'
  | 'user_status_change'
  | 'user_killed'
  | 'user_status'
  | 'ws_connected'
  | 'ws_disconnected';

export interface WSEvent {
  type: WSEventType;
  userId?: string;
  userName?: string;
  model?: string;
  reason?: string;
  creditCost?: number;
  oldStatus?: string;
  newStatus?: string;
  projectDir?: string;
  hostname?: string;
  sessionId?: string;
  timestamp: string;
}

export interface FeedItem {
  id: string;
  type: 'check' | 'blocked' | 'counted' | 'status' | 'system';
  user: string;
  detail: string;
  time: string;
}
