import React from 'react';
import { MessageSquareText, Banknote, Smartphone, Mail } from 'lucide-react';
import { Source } from '../types';

const SOURCE_META: Record<Source, { icon: React.ComponentType<{ size?: number; className?: string }>; className: string }> = {
  SMS: { icon: MessageSquareText, className: 'text-blue-400' },
  Cash: { icon: Banknote, className: 'text-amber-400' },
  PhonePe: { icon: Smartphone, className: 'text-purple-400' },
  Email: { icon: Mail, className: 'text-teal-400' },
};

export default function SourceIcon({ source }: { source: Source }) {
  const meta = SOURCE_META[source];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <Icon size={14} className={meta.className} />
      {source}
    </span>
  );
}
