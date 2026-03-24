export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-5 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="skeleton w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-3 w-20" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="skeleton h-2 w-full rounded-full" />
        <div className="skeleton h-2 w-3/4 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-4">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-3 w-28" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="skeleton h-3 w-16 mb-2" />
          <div className="skeleton h-8 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-9 w-24 rounded-lg" />
      </div>
      <SkeletonStats />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div>
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
