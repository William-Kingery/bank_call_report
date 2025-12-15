import { useEffect, useState } from 'react';

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
    <main style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Welcome to Jhakaas</h1>
      <p>Your Next.js frontend is ready to run. Start the dev server with <code>npm run dev</code>.</p>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Backend health check</h2>
        {health && (
          <pre
            style={{
              background: '#f6f8fa',
              padding: '1rem',
              borderRadius: '8px',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {!health && !error && <p>Checking backend connectivity...</p>}
      </section>
    </main>
  );
}
