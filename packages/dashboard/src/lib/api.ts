/* ================================================================
   API Client — all admin endpoints for Claude Code Limiter
   ================================================================ */

import type {
  LoginResponse,
  User,
  CreateUserPayload,
  CreateUserResponse,
  UpdateUserPayload,
  UpdateSettingsPayload,
  Team,
  UsageEvent,
  DailyUsageRow,
  AnalyticsData,
} from './types';

const TOKEN_KEY = 'clm_token';
const TEAM_KEY = 'clm_team';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TEAM_KEY);
}

function getStoredTeam(): Team | null {
  const raw = localStorage.getItem(TEAM_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Team;
  } catch {
    return null;
  }
}

function setStoredTeam(team: Team): void {
  localStorage.setItem(TEAM_KEY, JSON.stringify(team));
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, opts?: {
  method?: string;
  body?: unknown;
}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method: opts?.method ?? 'GET',
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new ApiError('Session expired', 401);
  }

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? 'Request failed', res.status);
  }

  return data as T;
}

function buildQS(params?: Record<string, string | number | null | undefined>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v != null) {
      parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/* ---- Endpoints ---- */

async function login(password: string): Promise<LoginResponse> {
  const data = await request<LoginResponse>('/api/admin/login', {
    method: 'POST',
    body: { password },
  });
  setToken(data.token);
  if (data.team) {
    setStoredTeam(data.team);
  }
  return data;
}

function logout(): void {
  clearToken();
}

async function getUsers(): Promise<{ users: User[] }> {
  return request<{ users: User[] }>('/api/admin/users');
}

async function getUser(id: string): Promise<User> {
  const data = await request<{ users: User[] }>('/api/admin/users');
  const user = data.users.find((u) => u.id === id);
  if (!user) throw new ApiError('User not found', 404);
  return user;
}

async function createUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  return request<CreateUserResponse>('/api/admin/users', {
    method: 'POST',
    body: payload,
  });
}

async function updateUser(id: string, payload: UpdateUserPayload): Promise<{ user: User; limits: unknown[] }> {
  return request<{ user: User; limits: unknown[] }>(`/api/admin/users/${id}`, {
    method: 'PUT',
    body: payload,
  });
}

async function deleteUser(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/admin/users/${id}`, {
    method: 'DELETE',
  });
}

async function getUsage(params?: {
  user_id?: string;
  window?: string;
  days?: number;
}): Promise<{
  user_id?: string;
  summary?: unknown;
  daily: DailyUsageRow[];
}> {
  return request(`/api/admin/usage${buildQS(params)}`);
}

async function getEvents(params?: {
  limit?: number;
  user_id?: string;
}): Promise<{ events: UsageEvent[] }> {
  return request(`/api/admin/events${buildQS(params)}`);
}

async function getAnalytics(params?: {
  days?: number;
  user_id?: string;
}): Promise<AnalyticsData> {
  return request(`/api/admin/analytics${buildQS(params)}`);
}

async function updateSettings(payload: UpdateSettingsPayload): Promise<{ team: Team }> {
  return request<{ team: Team }>('/api/admin/settings', {
    method: 'PUT',
    body: payload,
  });
}

export const api = {
  login,
  logout,
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getUsage,
  getEvents,
  getAnalytics,
  updateSettings,
  getToken,
  getStoredTeam,
  setStoredTeam,
  setUnauthorizedHandler,
  isAuthenticated: () => !!getToken(),
};
