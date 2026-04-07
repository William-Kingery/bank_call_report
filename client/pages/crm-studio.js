import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const CRM_API_BASE = `${API_BASE}/api/crm`;

const priorityClasses = {
  Critical: { background: '#fee2e2', color: '#b91c1c' },
  High: { background: '#ffedd5', color: '#c2410c' },
  Medium: { background: '#fef3c7', color: '#b45309' },
  Low: { background: '#dcfce7', color: '#166534' },
};

function normalizeStage(stage) {
  if (!stage) return 'Prospect';
  const value = String(stage).toUpperCase();
  if (value === 'PROSPECT') return 'Prospect';
  if (value === 'ENGAGED') return 'Engaged';
  if (value === 'CLIENT') return 'Client';
  if (value === 'FORMER_CLIENT') return 'Former Client';
  return stage;
}

function normalizePriority(priority) {
  if (!priority) return 'Medium';
  const value = String(priority).toUpperCase();
  if (value === 'CRITICAL') return 'Critical';
  if (value === 'HIGH') return 'High';
  if (value === 'MEDIUM') return 'Medium';
  if (value === 'LOW') return 'Low';
  return priority;
}

async function api(path, options = {}) {
  const response = await fetch(`${CRM_API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errorData = await response.json();
      message = errorData?.error || errorData?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export default function CrmStudioPage() {
  const [banks, setBanks] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    cert: '',
    state: '',
    relationship_stage: 'Prospect',
    coverage_priority: 'Medium',
    owner_name: '',
  });
  const [interactionForm, setInteractionForm] = useState({
    bankId: '',
    contactId: 'none',
    interactionDate: new Date().toISOString().slice(0, 10),
    interactionType: 'CALL',
    subject: '',
    notes: '',
    outcome: 'followup_needed',
    nextStep: '',
    nextFollowupDate: '',
    taskSubject: '',
  });

  const selectedBank = useMemo(
    () => banks.find((b) => String(b.bank_id) === String(selectedBankId)) || null,
    [banks, selectedBankId],
  );

  const selectedBankInteractions = useMemo(
    () => interactions.filter((i) => String(i.bank_id) === String(selectedBankId)),
    [interactions, selectedBankId],
  );

  const selectedBankContacts = useMemo(
    () => contacts.filter((c) => String(c.bank_id) === String(selectedBankId)),
    [contacts, selectedBankId],
  );

  const selectedBankTasks = useMemo(
    () => tasks.filter((t) => String(t.bank_id) === String(selectedBankId)),
    [tasks, selectedBankId],
  );

  const selectedBankAlerts = useMemo(
    () => alerts.filter((a) => String(a.bank_id) === String(selectedBankId)),
    [alerts, selectedBankId],
  );

  const filteredBanks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter((bank) =>
      [
        bank.bank_name,
        bank.cert,
        bank.state,
        bank.relationship_stage,
        bank.coverage_priority,
        bank.owner_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [banks, search]);

  const stats = useMemo(() => {
    const openAlerts = alerts.filter((a) => (a.alert_status || 'OPEN') !== 'DISMISSED').length;
    const highPriority = banks.filter((b) => ['High', 'Critical'].includes(normalizePriority(b.coverage_priority))).length;
    const avgScore = banks.length
      ? Math.round(banks.reduce((sum, bank) => sum + Number(bank.raw_score || bank.normalized_score || 0), 0) / banks.length)
      : 0;
    return { openAlerts, highPriority, avgScore };
  }, [banks, alerts]);

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/dashboard');
      setBanks(data?.banks || []);
      setInteractions(data?.interactions || []);
      setContacts(data?.contacts || []);
      setTasks(data?.tasks || []);
      setAlerts(data?.alerts || []);

      const firstBankId = data?.banks?.[0]?.bank_id || null;
      setSelectedBankId((prev) => prev || firstBankId);
      setInteractionForm((prev) => ({
        ...prev,
        bankId: prev.bankId || String(firstBankId || ''),
      }));
    } catch (err) {
      setError(err.message || 'Failed to load CRM data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (selectedBankId) {
      setInteractionForm((prev) => ({ ...prev, bankId: String(selectedBankId) }));
    }
  }, [selectedBankId]);

  async function addBank() {
    if (!bankForm.bank_name || !bankForm.cert) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const created = await api('/banks', {
        method: 'POST',
        body: JSON.stringify({
          cert: Number(bankForm.cert),
          bank_name: bankForm.bank_name,
          state: bankForm.state || null,
          relationship_stage: bankForm.relationship_stage.toUpperCase().replace(/ /g, '_'),
          coverage_priority: bankForm.coverage_priority.toUpperCase(),
          owner_name: bankForm.owner_name || null,
        }),
      });
      setSuccess('Bank record saved.');
      setBankForm({
        bank_name: '',
        cert: '',
        state: '',
        relationship_stage: 'Prospect',
        coverage_priority: 'Medium',
        owner_name: '',
      });
      await loadDashboard();
      if (created?.bank_id) setSelectedBankId(created.bank_id);
    } catch (err) {
      setError(err.message || 'Failed to save bank record.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteBank(bankId) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/banks/${bankId}`, { method: 'DELETE' });
      setSuccess('Bank record deleted.');
      await loadDashboard();
      if (String(selectedBankId) === String(bankId)) setSelectedBankId(null);
    } catch (err) {
      setError(err.message || 'Failed to delete bank.');
    } finally {
      setSaving(false);
    }
  }

  async function saveInteraction() {
    if (!interactionForm.bankId || !interactionForm.subject) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api('/interactions', {
        method: 'POST',
        body: JSON.stringify({
          bank_id: Number(interactionForm.bankId),
          contact_id: interactionForm.contactId === 'none' ? null : Number(interactionForm.contactId),
          interaction_type_code: interactionForm.interactionType,
          interaction_date: interactionForm.interactionDate,
          subject: interactionForm.subject,
          notes: interactionForm.notes,
          outcome_code: interactionForm.outcome,
          next_step: interactionForm.nextStep,
          next_followup_date: interactionForm.nextFollowupDate || null,
          task_subject: interactionForm.taskSubject || null,
        }),
      });

      setSuccess('Interaction saved.');
      setInteractionForm((prev) => ({
        ...prev,
        contactId: 'none',
        subject: '',
        notes: '',
        nextStep: '',
        nextFollowupDate: '',
        taskSubject: '',
      }));
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Failed to save interaction.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteInteraction(interactionId) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/interactions/${interactionId}`, { method: 'DELETE' });
      setSuccess('Interaction deleted.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Failed to delete interaction.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Loading CRM dashboard from MySQL…</main>;
  }

  return (
    <main style={{ padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <h1>CRM Studio</h1>
      <p>Call Report Prospect Scoring & Relationship Monitoring</p>
      <p style={{ marginBottom: 12 }}>
        <Link href="/">Back to dashboard</Link>
      </p>

      {(error || success) && (
        <div style={{ marginBottom: 12 }}>
          {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
          {success && <div style={{ color: '#166534' }}>{success}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div>Tracked Banks: {banks.length}</div>
        <div>Open Alerts: {stats.openAlerts}</div>
        <div>High Priority: {stats.highPriority}</div>
        <div>Average Prospect Score: {stats.avgScore}</div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2>Prospect Dashboard</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by bank, cert, state, stage"
          style={{ marginBottom: 10, minWidth: 280 }}
        />
        <button type="button" onClick={loadDashboard} disabled={saving} style={{ marginLeft: 8 }}>
          Refresh Data
        </button>
        <table border="1" cellPadding="6" style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Bank</th><th>CERT</th><th>Stage</th><th>Score</th><th>Priority</th><th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {filteredBanks.map((bank) => {
              const priority = normalizePriority(bank.coverage_priority);
              return (
                <tr key={bank.bank_id} onClick={() => setSelectedBankId(bank.bank_id)} style={{ cursor: 'pointer' }}>
                  <td>{bank.bank_name}</td>
                  <td>{bank.cert || '—'}</td>
                  <td>{normalizeStage(bank.relationship_stage)}</td>
                  <td>{Number(bank.raw_score || bank.normalized_score || 0)}</td>
                  <td>
                    <span style={{ padding: '2px 6px', borderRadius: 999, ...(priorityClasses[priority] || priorityClasses.Medium) }}>
                      {priority}
                    </span>
                  </td>
                  <td>{bank.owner_name || 'Unassigned'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Bank 360</h2>
        <div><b>{selectedBank?.bank_name || 'Select a bank'}</b> · CERT {selectedBank?.cert || '—'} · {selectedBank?.state || '—'}</div>
        <div>Last interaction: {selectedBank?.last_interaction_date || '—'} | Next follow-up: {selectedBank?.next_followup_date || '—'}</div>
        <div>Score summary: {selectedBank?.score_summary || 'No score summary available yet for this bank.'}</div>
        <h3>Alerts</h3>
        <ul>
          {selectedBankAlerts.map((alert) => <li key={alert.trigger_event_id}>{alert.alert_title} — {alert.alert_summary || 'No summary available.'}</li>)}
          {!selectedBankAlerts.length && <li>No active alerts for this bank.</li>}
        </ul>
        <h3>Contacts</h3>
        <ul>
          {selectedBankContacts.map((contact) => <li key={contact.contact_id}>{contact.full_name} {contact.title ? `· ${contact.title}` : ''}</li>)}
          {!selectedBankContacts.length && <li>No contacts linked to this bank yet.</li>}
        </ul>
        <h3>Open Tasks</h3>
        <ul>
          {selectedBankTasks.map((task) => <li key={task.task_id}>{task.task_subject}{task.due_date ? ` · due ${task.due_date}` : ''}</li>)}
          {!selectedBankTasks.length && <li>No open tasks linked to this bank.</li>}
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Add New Interaction</h2>
        <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
          <select value={interactionForm.bankId} onChange={(e) => setInteractionForm((prev) => ({ ...prev, bankId: e.target.value, contactId: 'none' }))}>
            <option value="">Select bank</option>
            {banks.map((bank) => <option key={bank.bank_id} value={String(bank.bank_id)}>{bank.bank_name}</option>)}
          </select>
          <input type="date" value={interactionForm.interactionDate} onChange={(e) => setInteractionForm((prev) => ({ ...prev, interactionDate: e.target.value }))} />
          <select value={interactionForm.interactionType} onChange={(e) => setInteractionForm((prev) => ({ ...prev, interactionType: e.target.value }))}>
            <option value="CALL">Call</option><option value="EMAIL">Email</option><option value="MEETING">Meeting</option><option value="LINKEDIN">LinkedIn</option>
          </select>
          <select value={interactionForm.contactId} onChange={(e) => setInteractionForm((prev) => ({ ...prev, contactId: e.target.value }))}>
            <option value="none">No linked contact</option>
            {selectedBankContacts.map((contact) => <option key={contact.contact_id} value={String(contact.contact_id)}>{contact.full_name}</option>)}
          </select>
          <input placeholder="Subject" value={interactionForm.subject} onChange={(e) => setInteractionForm((prev) => ({ ...prev, subject: e.target.value }))} />
          <textarea placeholder="Notes" value={interactionForm.notes} onChange={(e) => setInteractionForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <input placeholder="Next Step" value={interactionForm.nextStep} onChange={(e) => setInteractionForm((prev) => ({ ...prev, nextStep: e.target.value }))} />
          <input type="date" value={interactionForm.nextFollowupDate} onChange={(e) => setInteractionForm((prev) => ({ ...prev, nextFollowupDate: e.target.value }))} />
          <input placeholder="Optional task subject" value={interactionForm.taskSubject} onChange={(e) => setInteractionForm((prev) => ({ ...prev, taskSubject: e.target.value }))} />
          <button type="button" onClick={saveInteraction} disabled={saving}>Save Interaction</button>
        </div>

        <h3 style={{ marginTop: 14 }}>Interaction History</h3>
        <ul>
          {selectedBankInteractions.map((item) => (
            <li key={item.interaction_id}>
              {item.interaction_date} · {item.subject} · {item.interaction_type_name || item.interaction_type_code}
              <button type="button" onClick={() => deleteInteraction(item.interaction_id)} disabled={saving} style={{ marginLeft: 8 }}>
                Delete
              </button>
            </li>
          ))}
          {!selectedBankInteractions.length && <li>No interactions saved for this bank yet.</li>}
        </ul>
      </section>

      <section>
        <h2>Add / Delete Bank Records</h2>
        <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
          <input placeholder="Bank name" value={bankForm.bank_name} onChange={(e) => setBankForm((prev) => ({ ...prev, bank_name: e.target.value }))} />
          <input placeholder="CERT" value={bankForm.cert} onChange={(e) => setBankForm((prev) => ({ ...prev, cert: e.target.value }))} />
          <input placeholder="State" value={bankForm.state} onChange={(e) => setBankForm((prev) => ({ ...prev, state: e.target.value }))} />
          <select value={bankForm.relationship_stage} onChange={(e) => setBankForm((prev) => ({ ...prev, relationship_stage: e.target.value }))}>
            <option value="Prospect">Prospect</option><option value="Engaged">Engaged</option><option value="Client">Client</option><option value="Former Client">Former Client</option>
          </select>
          <select value={bankForm.coverage_priority} onChange={(e) => setBankForm((prev) => ({ ...prev, coverage_priority: e.target.value }))}>
            <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option>
          </select>
          <input placeholder="Owner Name" value={bankForm.owner_name} onChange={(e) => setBankForm((prev) => ({ ...prev, owner_name: e.target.value }))} />
          <button type="button" onClick={addBank} disabled={saving}>Add Bank Record</button>
        </div>

        <ul style={{ marginTop: 14 }}>
          {banks.map((bank) => (
            <li key={bank.bank_id}>
              {bank.bank_name} · CERT {bank.cert || '—'}
              <button type="button" onClick={() => setSelectedBankId(bank.bank_id)} style={{ marginLeft: 8 }}>Open</button>
              <button type="button" onClick={() => deleteBank(bank.bank_id)} style={{ marginLeft: 8 }} disabled={saving}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
