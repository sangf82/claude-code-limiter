import { useState } from 'react';
import { api } from '../lib/api';
import { slugify, copyToClipboard } from '../lib/utils';
import type { LimitRule } from '../lib/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/Modal';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  showToast: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error', duration?: number) => void;
}

type Preset = 'light' | 'medium' | 'heavy' | 'unlimited' | 'custom';

const PRESETS: Record<Exclude<Preset, 'custom'>, {
  credits: number;
  opus: number;
  sonnet: number;
  haiku: number;
  desc: string;
}> = {
  light: { credits: 50, opus: 3, sonnet: 10, haiku: 30, desc: '50 credits/day. Opus: 3, Sonnet: 10, Haiku: 30.' },
  medium: { credits: 100, opus: 5, sonnet: 20, haiku: 50, desc: '100 credits/day. Opus: 5, Sonnet: 20, Haiku: 50.' },
  heavy: { credits: 200, opus: 10, sonnet: 40, haiku: 100, desc: '200 credits/day. Opus: 10, Sonnet: 40, Haiku: 100.' },
  unlimited: { credits: -1, opus: -1, sonnet: -1, haiku: -1, desc: 'No limits. User has full unrestricted access.' },
};

export function AddUserModal({ open, onClose, onCreated, showToast }: AddUserModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [preset, setPreset] = useState<Preset>('light');
  const [customCredits, setCustomCredits] = useState('100');
  const [customOpus, setCustomOpus] = useState('5');
  const [customSonnet, setCustomSonnet] = useState('20');
  const [customHaiku, setCustomHaiku] = useState('50');
  const [loading, setLoading] = useState(false);
  const [installCmd, setInstallCmd] = useState('');
  const [showInstall, setShowInstall] = useState(false);

  const resetForm = () => {
    setName('');
    setSlug('');
    setPreset('light');
    setCustomCredits('100');
    setCustomOpus('5');
    setCustomSonnet('20');
    setCustomHaiku('50');
    setInstallCmd('');
    setShowInstall(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const buildLimits = (): LimitRule[] => {
    const p = preset === 'custom'
      ? {
          credits: parseInt(customCredits, 10) || -1,
          opus: parseInt(customOpus, 10) || -1,
          sonnet: parseInt(customSonnet, 10) || -1,
          haiku: parseInt(customHaiku, 10) || -1,
        }
      : PRESETS[preset];

    const limits: LimitRule[] = [];
    if (p.credits !== -1) limits.push({ type: 'credits', window: 'daily', value: p.credits });
    if (p.opus !== -1) limits.push({ type: 'per_model', model: 'opus', window: 'daily', value: p.opus });
    if (p.sonnet !== -1) limits.push({ type: 'per_model', model: 'sonnet', window: 'daily', value: p.sonnet });
    if (p.haiku !== -1) limits.push({ type: 'per_model', model: 'haiku', window: 'daily', value: p.haiku });
    return limits;
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('Error', 'Name is required', 'error');
      return;
    }
    if (!slug.trim()) {
      showToast('Error', 'Slug is required', 'error');
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      showToast('Error', 'Slug must be lowercase letters, numbers, and hyphens', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await api.createUser({
        name: name.trim(),
        slug: slug.trim(),
        limits: buildLimits(),
      });

      showToast('User Created', `${name.trim()} has been added`, 'success');
      onCreated();

      const serverUrl = `${location.protocol}//${location.host}`;
      const cmd = `sudo npx @howincodes/claude-code-limiter setup --code ${result.install_code} --server ${serverUrl}`;
      setInstallCmd(cmd);
      setShowInstall(true);
    } catch (err) {
      showToast('Error', err instanceof Error ? err.message : 'Failed to create user', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await copyToClipboard(installCmd);
      showToast('Copied', 'Command copied to clipboard', 'success', 2500);
    } catch {
      showToast('Error', 'Could not copy to clipboard', 'error');
    }
  };

  // Install command screen
  if (showInstall) {
    return (
      <Modal open={open} onClose={handleClose} size="lg">
        <ModalHeader onClose={handleClose}>Install Command</ModalHeader>
        <ModalBody>
          <p className="text-sm text-zinc-400 mb-4">
            Run this command on <span className="font-semibold text-zinc-200">{name}</span>'s machine to set up rate limiting:
          </p>
          <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            <code className="text-sm text-blue-400 flex-1 break-all font-mono">{installCmd}</code>
            <Button size="sm" variant="primary" onClick={handleCopy}>
              Copy
            </Button>
          </div>
          <p className="text-xs text-zinc-600 mt-3">
            This code can only be used once. Generate a new one from the user detail page if needed.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleClose}>Done</Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <ModalHeader onClose={handleClose}>Add User</ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. Alice, Dev Team, Intern"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSlug(slugify(e.target.value));
            }}
            autoFocus
          />

          <Input
            label="Slug (username)"
            placeholder="e.g. alice, dev-team, intern"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            hint="Lowercase, no spaces. Used in install commands and logs."
          />

          <hr className="border-zinc-800" />

          <div>
            <h4 className="text-sm font-medium text-zinc-300 mb-2">Limits Preset</h4>
            <div className="flex flex-wrap gap-2">
              {(['light', 'medium', 'heavy', 'unlimited', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    preset === p
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {preset === 'custom' ? 'Set your own limits below.' : PRESETS[preset].desc}
            </p>
          </div>

          {preset === 'custom' && (
            <div className="space-y-3 animate-fade-in">
              <Input
                label="Credit Budget (daily)"
                type="number"
                value={customCredits}
                onChange={(e) => setCustomCredits(e.target.value)}
                hint="-1 for unlimited"
              />
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Opus"
                  type="number"
                  value={customOpus}
                  onChange={(e) => setCustomOpus(e.target.value)}
                />
                <Input
                  label="Sonnet"
                  type="number"
                  value={customSonnet}
                  onChange={(e) => setCustomSonnet(e.target.value)}
                />
                <Input
                  label="Haiku"
                  type="number"
                  value={customHaiku}
                  onChange={(e) => setCustomHaiku(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Creating...' : 'Create User'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
