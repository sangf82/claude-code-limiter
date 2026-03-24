import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { getModelLimit, getCreditRule } from '../lib/utils';
import type { User, LimitRule } from '../lib/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/Modal';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';

interface EditLimitsModalProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  onSaved: () => void;
  showToast: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

interface TimeRule {
  model: string;
  start: string;
  end: string;
  tz: string;
}

export function EditLimitsModal({ open, onClose, userId, onSaved, showToast }: EditLimitsModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [credits, setCredits] = useState('-1');
  const [creditsWindow, setCreditsWindow] = useState('daily');
  const [opus, setOpus] = useState('-1');
  const [sonnet, setSonnet] = useState('-1');
  const [haiku, setHaiku] = useState('-1');
  const [timeRules, setTimeRules] = useState<TimeRule[]>([]);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    api.getUser(userId)
      .then((u) => {
        setUser(u);
        const limits = u.limits ?? [];
        const creditRule = getCreditRule(limits);
        setCredits(creditRule ? String(creditRule.value) : '-1');
        setCreditsWindow(creditRule?.window ?? 'daily');
        setOpus(String(getModelLimit(limits, 'opus', 'daily')));
        setSonnet(String(getModelLimit(limits, 'sonnet', 'daily')));
        setHaiku(String(getModelLimit(limits, 'haiku', 'daily')));
        setTimeRules(
          limits
            .filter((r) => r.type === 'time_of_day')
            .map((r) => ({
              model: r.model ?? 'opus',
              start: r.schedule_start ?? '09:00',
              end: r.schedule_end ?? '18:00',
              tz: r.schedule_tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            }))
        );
      })
      .catch((err) => {
        showToast('Error', err instanceof Error ? err.message : 'Failed to load user', 'error');
      })
      .finally(() => setLoading(false));
  }, [open, userId, showToast]);

  const handleSave = async () => {
    if (!userId) return;

    const limits: LimitRule[] = [];
    const creditsVal = parseInt(credits, 10);
    if (!isNaN(creditsVal) && creditsVal !== -1) {
      limits.push({ type: 'credits', window: creditsWindow, value: creditsVal });
    }

    for (const [model, val] of [['opus', opus], ['sonnet', sonnet], ['haiku', haiku]] as const) {
      const v = parseInt(val, 10);
      if (!isNaN(v) && v !== -1) {
        limits.push({ type: 'per_model', model, window: 'daily', value: v });
      }
    }

    for (const tr of timeRules) {
      limits.push({
        type: 'time_of_day',
        model: tr.model,
        schedule_start: tr.start,
        schedule_end: tr.end,
        schedule_tz: tr.tz,
      });
    }

    setSaving(true);
    try {
      await api.updateUser(userId, { limits });
      showToast('Limits Updated', 'Limits have been saved', 'success');
      onSaved();
      onClose();
    } catch (err) {
      showToast('Error', err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addTimeRule = () => {
    setTimeRules((prev) => [
      ...prev,
      { model: 'opus', start: '09:00', end: '18:00', tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    ]);
  };

  const updateTimeRule = (idx: number, field: keyof TimeRule, value: string) => {
    setTimeRules((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeTimeRule = (idx: number) => {
    setTimeRules((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <ModalHeader onClose={onClose}>
        Edit Limits{user ? `: ${user.name}` : ''}
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Credit Budget */}
            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Credit Budget</h4>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Value (-1 = unlimited, 0 = blocked)"
                  type="number"
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                />
                <Select
                  label="Window"
                  value={creditsWindow}
                  onChange={(e) => setCreditsWindow(e.target.value)}
                >
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                  <option value="sliding_24h">sliding_24h</option>
                </Select>
              </div>
            </div>

            <hr className="border-zinc-800" />

            {/* Per-model limits */}
            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-1">Per-Model Limits (Daily)</h4>
              <p className="text-xs text-zinc-500 mb-3">-1 = unlimited, 0 = blocked</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Opus" type="number" value={opus} onChange={(e) => setOpus(e.target.value)} />
                <Input label="Sonnet" type="number" value={sonnet} onChange={(e) => setSonnet(e.target.value)} />
                <Input label="Haiku" type="number" value={haiku} onChange={(e) => setHaiku(e.target.value)} />
              </div>
            </div>

            <hr className="border-zinc-800" />

            {/* Time-of-day rules */}
            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Time-of-Day Restrictions</h4>
              <div className="space-y-3">
                {timeRules.map((tr, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <Select
                        label={idx === 0 ? 'Model' : undefined}
                        value={tr.model}
                        onChange={(e) => updateTimeRule(idx, 'model', e.target.value)}
                      >
                        <option value="opus">Opus</option>
                        <option value="sonnet">Sonnet</option>
                        <option value="haiku">Haiku</option>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Input
                        label={idx === 0 ? 'Start' : undefined}
                        type="time"
                        value={tr.start}
                        onChange={(e) => updateTimeRule(idx, 'start', e.target.value)}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        label={idx === 0 ? 'End' : undefined}
                        type="time"
                        value={tr.end}
                        onChange={(e) => updateTimeRule(idx, 'end', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label={idx === 0 ? 'Timezone' : undefined}
                        value={tr.tz}
                        onChange={(e) => updateTimeRule(idx, 'tz', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 flex items-end pb-0.5">
                      <Button size="sm" variant="ghost" onClick={() => removeTimeRule(idx)}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 3l8 8M11 3l-8 8" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={addTimeRule} className="mt-2">
                + Add Time Rule
              </Button>
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save Limits'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
