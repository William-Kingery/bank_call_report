import { useEffect, useState } from 'react';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/health');
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        setHealth(data);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchHealth();
  }, []);

  return (
    <main className={styles.main}>
      <h1>Welcome</h1>
      <p>Your Next.js frontend is ready to run. Start the dev server with <code>npm run dev</code>.</p>

      <section className={styles.section}>
        <h2>Backend health check</h2>
        {health && (
          <pre
            className={styles.healthPre}
          >
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
        {error && <p className={styles.error}>Error: {error}</p>}
        {!health && !error && <p>Checking backend connectivity...</p>}
      </section>
    </main>
  );
}
