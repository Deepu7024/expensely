import React, { FormEvent, useState } from 'react';
import { LockKeyhole, Mail, Wallet } from 'lucide-react';
import { AuthUser } from '../types';
import { loginUser, registerUser } from '../api';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser, isNew: boolean) => void;
  startupError?: string | null;
}

export default function AuthScreen({ onAuthenticated, startupError }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(startupError ?? null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = mode === 'register' ? await registerUser(email, password) : await loginUser(email, password);
      onAuthenticated(user, mode === 'register');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(16,185,129,0.14),transparent_38%)]" />
      <section className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <Wallet className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Expensely</h1>
            <p className="text-xs text-zinc-500">Your money, separated and private.</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-black/20 p-1">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setMode(item); setError(null); }}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                mode === item ? 'bg-white/10 text-zinc-100 shadow' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {item === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-400">Email</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-emerald-500/50">
              <Mail size={16} className="shrink-0 text-zinc-600" />
              <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-700" placeholder="you@example.com" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-zinc-400">Password</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 focus-within:border-emerald-500/50">
              <LockKeyhole size={16} className="shrink-0 text-zinc-600" />
              <input required minLength={10} maxLength={128} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-700" placeholder="At least 10 characters" />
            </div>
          </label>
          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</p>}
          <button disabled={submitting} className="h-11 w-full rounded-xl bg-emerald-500 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60">
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create private account'}
          </button>
        </form>
        <p className="mt-5 text-center text-[11px] leading-5 text-zinc-600">
          Each account has its own banks, transactions, categories, pools, settings, and Gmail connection.
        </p>
      </section>
    </main>
  );
}
