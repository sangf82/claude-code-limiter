import type { FeedItem } from '../lib/types';
import { formatTime } from '../lib/utils';

interface LiveFeedProps {
  events: FeedItem[];
}

const dotColors: Record<string, string> = {
  check: 'bg-blue-400',
  blocked: 'bg-red-400',
  counted: 'bg-green-400',
  status: 'bg-yellow-400',
  system: 'bg-zinc-500',
};

export function LiveFeed({ events }: LiveFeedProps) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
        No events yet. Activity will appear here in real time.
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800/50 max-h-[500px] overflow-y-auto">
      {events.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/20 transition-colors duration-100 animate-fade-in"
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[item.type] ?? dotColors.system}`} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-zinc-200">{item.user}</span>{' '}
            <span className="text-sm text-zinc-500">{item.detail}</span>
          </div>
          <span className="text-xs font-mono text-zinc-600 flex-shrink-0">
            {formatTime(item.time)}
          </span>
        </div>
      ))}
    </div>
  );
}
