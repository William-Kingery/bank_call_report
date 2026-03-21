import { useEffect, useState } from 'react';

import styles from '../styles/AuthGate.module.css';

const defaultError = 'Login failed. Please check your credentials.';

const fetchSession = async (apiBase) => {
  const response = await fetch(`${apiBase}/auth/me`, {
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.user ?? null;
};

export default function AuthGate({ apiBase, children }) {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const sessionUser = await fetchSession(apiBase);
        if (!cancelled) {
          setUser(sessionUser);
        }
      } catch (sessionError) {
        if (!cancelled) {
          setError(sessionError.message);
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ identifier, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || defaultError);
      }

      setUser(data.user ?? null);
      setPassword('');
    } catch (submitError) {
      setError(submitError.message || defaultError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setUser(null);
      setIdentifier('');
      setPassword('');
    }
  };

  if (checkingSession) {
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <p className={styles.kicker}>Authentication</p>
          <h1 className={styles.title}>Checking session</h1>
          <p className={styles.subtitle}>Verifying whether you already have access.</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.screen}>
        <div className={styles.card}>
          <p className={styles.kicker}>Secure Access</p>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.subtitle}>
            Use an admin-created username or email and password to access the site.
          </p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.label} htmlFor="identifier">
              Username or email
            </label>
            <input
              id="identifier"
              className={styles.input}
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.button} type="submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.sessionBar}>
        <div>
          <p className={styles.sessionLabel}>Signed in</p>
          <p className={styles.sessionValue}>{user.username || user.email}</p>
        </div>
        <button className={styles.logoutButton} type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
      {children}
    </div>
  );
}
