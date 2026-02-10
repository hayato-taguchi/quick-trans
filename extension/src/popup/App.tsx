import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GoogleUser } from '../types/google-user';
import { loadAuthState, signInWithGoogle, signOutFromGoogle } from './auth';

type Status = {
  type: 'info' | 'error';
  message: string;
} | null;

function Avatar({ user }: { user: GoogleUser | null }): JSX.Element {
  if (!user?.picture) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-500">
        ?
      </div>
    );
  }
  return (
    <img
      src={user.picture}
      alt="account avatar"
      className="h-10 w-10 rounded-full border border-slate-200 object-cover"
      referrerPolicy="no-referrer"
    />
  );
}

export default function App(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    loadAuthState()
      .then((state) => {
        setUser(state.user);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '認証状態の読み込みに失敗しました。';
        setStatus({ type: 'error', message });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    setStatus({ type: 'info', message: 'Google認証を開始します...' });
    try {
      const state = await signInWithGoogle();
      setUser(state.user);
      setStatus({ type: 'info', message: 'Googleアカウントでログインしました。' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'ログインに失敗しました。';
      setStatus({ type: 'error', message });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOutFromGoogle();
      setUser(null);
      setStatus({ type: 'info', message: 'ログアウトしました。' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'ログアウトに失敗しました。';
      setStatus({ type: 'error', message });
    } finally {
      setBusy(false);
    }
  }, []);

  const isSignedIn = useMemo(() => Boolean(user), [user]);

  return (
    <main className="w-[360px] bg-slate-100 p-4 text-slate-900">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold">Q-Trans</h1>
            <p className="mt-1 text-xs text-slate-500">Google認証の状態を確認できます。</p>
          </div>
          <Avatar user={user} />
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">読み込み中...</p>
        ) : isSignedIn ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-medium">{user?.name ?? 'Google User'}</p>
              <p className="mt-1 text-xs text-slate-500">{user?.email ?? 'email unavailable'}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              ログアウト
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Googleアカウントでログインすると、アバターとプロフィール情報を表示できます。
            </p>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={busy}
              className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Googleでログイン
            </button>
          </div>
        )}

        {status ? (
          <p
            className={`mt-3 text-xs ${
              status.type === 'error' ? 'text-red-600' : 'text-slate-500'
            }`}
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
