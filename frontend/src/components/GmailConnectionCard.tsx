import React, { useEffect, useState } from 'react';
import { CheckCircle2, Mail, RefreshCw, Unplug } from 'lucide-react';
import { beginGmailConnection, disconnectGmail, fetchGmailStatus } from '../api';
import { GmailStatus } from '../types';

interface GmailConnectionCardProps {
  onError: (message: string) => void;
}

export default function GmailConnectionCard({ onError }: GmailConnectionCardProps) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchGmailStatus().then(setStatus).catch(() => setStatus({ connected: false, email: null }));
  }, []);

  async function connect() {
    setBusy(true);
    try { await beginGmailConnection(); }
    catch (err) { onError(err instanceof Error ? err.message : 'Could not connect Gmail.'); setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    try { await disconnectGmail(); setStatus({ connected: false, email: null }); }
    catch (err) { onError(err instanceof Error ? err.message : 'Could not disconnect Gmail.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-black/15 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10"><Mail size={17} className="text-emerald-400" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
            Gmail sync {status?.connected && <CheckCircle2 size={14} className="text-emerald-400" />}
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {status?.connected ? status.email || 'Connected to this account' : 'Connect this user’s Gmail to import bank alerts.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status?.connected && (
            <button disabled={busy} onClick={connect} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50">
              <RefreshCw size={13} /> {busy ? 'Opening…' : 'Reconnect'}
            </button>
          )}
          <button disabled={busy || status === null} onClick={status?.connected ? disconnect : connect} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50">
            {status?.connected ? <><Unplug size={13} /> Disconnect</> : busy ? 'Opening…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
