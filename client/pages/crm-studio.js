import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const CORE_TABLES = [
  {
    name: 'fdic_structure',
    description: 'Institution identity, charter, location, and district mapping.',
  },
  {
    name: 'fdic_fts',
    description: 'Balance-sheet and funding fields by reporting quarter.',
  },
  {
    name: 'fdic_cdi',
    description: 'Core derived performance measures used in dashboard metrics.',
  },
];

export default function CrmStudioPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>CRM Studio</h1>
      <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
        Use these links to inspect the database tables and schema backing the call report explorer.
      </p>

      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <a href={`${API_BASE}/schema/tables`} target="_blank" rel="noreferrer">
          Open all table metadata
        </a>
        <a href={`${API_BASE}/schema/keys`} target="_blank" rel="noreferrer">
          Open index and key metadata
        </a>
      </div>

      <section>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Core reporting tables</h2>
        <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
          {CORE_TABLES.map((table) => (
            <li key={table.name}>
              <a href={`${API_BASE}/schema/table/${table.name}`} target="_blank" rel="noreferrer">
                {table.name}
              </a>{' '}
              — {table.description}
            </li>
          ))}
        </ul>
      </section>

      <div style={{ marginTop: '2rem' }}>
        <Link href="/">← Back to dashboard</Link>
      </div>
    </main>
  );
}
