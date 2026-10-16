import React from 'react';

export function SummaryCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-5">
      <div className="skeleton h-3 w-24 animate-shimmer rounded" />
      <div className="skeleton mt-4 h-7 w-32 animate-shimmer rounded" />
      <div className="skeleton mt-3 h-2 w-20 animate-shimmer rounded" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-white/5">
      {/* Matches the seven transaction table columns. */}
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="skeleton h-3.5 w-full max-w-[8rem] animate-shimmer rounded" />
        </td>
      ))}
    </tr>
  );
}
