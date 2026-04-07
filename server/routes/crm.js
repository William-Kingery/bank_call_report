import { Router } from 'express';
import pool from '../db.js';

const router = Router();

const CRM_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS crm_bank (
    bank_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    cert INT NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    state VARCHAR(2) NULL,
    relationship_stage VARCHAR(32) NOT NULL DEFAULT 'PROSPECT',
    coverage_priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
    owner_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_crm_bank_cert (cert)
  )`,
  `CREATE TABLE IF NOT EXISTS crm_contact (
    contact_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    bank_id BIGINT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_crm_contact_bank FOREIGN KEY (bank_id)
      REFERENCES crm_bank(bank_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS crm_task (
    task_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    bank_id BIGINT NOT NULL,
    task_subject VARCHAR(255) NOT NULL,
    due_date DATE NULL,
    task_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_crm_task_bank FOREIGN KEY (bank_id)
      REFERENCES crm_bank(bank_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS crm_interaction (
    interaction_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    bank_id BIGINT NOT NULL,
    contact_id BIGINT NULL,
    interaction_type_code VARCHAR(32) NOT NULL,
    interaction_date DATE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    notes TEXT NULL,
    outcome_code VARCHAR(64) NULL,
    next_step VARCHAR(255) NULL,
    next_followup_date DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_crm_interaction_bank FOREIGN KEY (bank_id)
      REFERENCES crm_bank(bank_id) ON DELETE CASCADE,
    CONSTRAINT fk_crm_interaction_contact FOREIGN KEY (contact_id)
      REFERENCES crm_contact(contact_id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bank_trigger_event (
    trigger_event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    bank_id BIGINT NOT NULL,
    alert_title VARCHAR(255) NOT NULL,
    alert_summary TEXT NULL,
    alert_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bank_trigger_event_bank FOREIGN KEY (bank_id)
      REFERENCES crm_bank(bank_id) ON DELETE CASCADE
  )`,
];

let schemaReady = false;
const ensureCrmSchema = async () => {
  if (schemaReady) return;
  for (const sql of CRM_SCHEMA_SQL) {
    await pool.query(sql);
  }
  schemaReady = true;
};

const queryDashboard = async () => {
  const [banks] = await pool.query(
    `SELECT
       b.bank_id,
       b.cert,
       b.bank_name,
       b.state,
       b.relationship_stage,
       b.coverage_priority,
       b.owner_name,
       ROUND(COALESCE(f.ASSET, 0) / 1000000, 0) AS raw_score,
       ROUND(LEAST(100, GREATEST(0, COALESCE(f.ASSET, 0) / 10000000)), 0) AS normalized_score,
       CASE
         WHEN COALESCE(f.ASSET, 0) >= 500000000 THEN 'Critical'
         WHEN COALESCE(f.ASSET, 0) >= 100000000 THEN 'High'
         WHEN COALESCE(f.ASSET, 0) >= 25000000 THEN 'Medium'
         ELSE 'Low'
       END AS priority_band,
       RANK() OVER (ORDER BY COALESCE(f.ASSET, 0) DESC) AS rank_overall,
       CONCAT('Latest assets: ', FORMAT(COALESCE(f.ASSET, 0), 0)) AS score_summary,
       MAX(i.interaction_date) AS last_interaction_date,
       MAX(i.next_followup_date) AS next_followup_date
     FROM crm_bank b
     LEFT JOIN (
       SELECT f1.CERT, f1.ASSET
       FROM fdic_fts f1
       JOIN (
         SELECT CERT, MAX(CALLYM) AS max_callym
         FROM fdic_fts
         GROUP BY CERT
       ) latest
         ON latest.CERT = f1.CERT
        AND latest.max_callym = f1.CALLYM
     ) f ON f.CERT = b.cert
     LEFT JOIN crm_interaction i ON i.bank_id = b.bank_id
     GROUP BY
       b.bank_id,
       b.cert,
       b.bank_name,
       b.state,
       b.relationship_stage,
       b.coverage_priority,
       b.owner_name,
       f.ASSET
     ORDER BY raw_score DESC, b.bank_name ASC`
  );

  const [interactions] = await pool.query(
    `SELECT
       i.interaction_id,
       i.bank_id,
       i.contact_id,
       i.interaction_type_code,
       i.interaction_type_code AS interaction_type_name,
       i.interaction_date,
       i.subject,
       i.notes,
       i.outcome_code,
       i.next_step,
       i.next_followup_date,
       c.full_name AS contact_name
     FROM crm_interaction i
     LEFT JOIN crm_contact c ON c.contact_id = i.contact_id
     ORDER BY i.interaction_date DESC, i.interaction_id DESC`
  );

  const [contacts] = await pool.query(
    `SELECT contact_id, bank_id, full_name, title, email, phone
     FROM crm_contact
     ORDER BY full_name ASC`
  );

  const [tasks] = await pool.query(
    `SELECT task_id, bank_id, task_subject, due_date, task_status
     FROM crm_task
     WHERE task_status <> 'CLOSED'
     ORDER BY COALESCE(due_date, '9999-12-31') ASC, task_id DESC`
  );

  const [alerts] = await pool.query(
    `SELECT trigger_event_id, bank_id, alert_title, alert_summary, alert_status
     FROM bank_trigger_event
     ORDER BY trigger_event_id DESC`
  );

  return { banks, interactions, contacts, tasks, alerts };
};

router.get('/dashboard', async (_req, res) => {
  try {
    await ensureCrmSchema();
    const data = await queryDashboard();
    res.json(data);
  } catch (error) {
    console.error('Error loading CRM dashboard:', error);
    res.status(500).json({ message: 'Failed to load CRM dashboard' });
  }
});

router.post('/banks', async (req, res) => {
  const {
    cert,
    bank_name: bankName,
    state,
    relationship_stage: relationshipStage = 'PROSPECT',
    coverage_priority: coveragePriority = 'MEDIUM',
    owner_name: ownerName,
  } = req.body ?? {};

  if (!Number.isFinite(Number(cert)) || !bankName) {
    return res.status(400).json({ message: 'cert and bank_name are required.' });
  }

  try {
    await ensureCrmSchema();

    const [existing] = await pool.query('SELECT bank_id FROM crm_bank WHERE cert = ?', [Number(cert)]);
    if (existing.length > 0) {
      return res.status(409).json({ message: `A CRM bank row already exists for cert ${cert}.` });
    }

    const [result] = await pool.query(
      `INSERT INTO crm_bank (cert, bank_name, state, relationship_stage, coverage_priority, owner_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [Number(cert), bankName, state || null, relationshipStage, coveragePriority, ownerName || null]
    );

    const bankId = result.insertId;
    await pool.query(
      `INSERT INTO bank_trigger_event (bank_id, alert_title, alert_summary, alert_status)
       VALUES (?, 'New bank added to CRM', 'Initial monitoring alert created automatically.', 'OPEN')`,
      [bankId]
    );

    res.status(201).json({ bank_id: bankId });
  } catch (error) {
    console.error('Error creating CRM bank:', error);
    res.status(500).json({ message: 'Failed to create CRM bank' });
  }
});

router.delete('/banks/:bankId', async (req, res) => {
  const bankId = Number(req.params.bankId);
  if (!Number.isFinite(bankId)) {
    return res.status(400).json({ message: 'Invalid bankId' });
  }

  try {
    await ensureCrmSchema();
    await pool.query('DELETE FROM crm_bank WHERE bank_id = ?', [bankId]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting CRM bank:', error);
    res.status(500).json({ message: 'Failed to delete CRM bank' });
  }
});

router.post('/interactions', async (req, res) => {
  const {
    bank_id: bankId,
    contact_id: contactId,
    interaction_type_code: interactionTypeCode,
    interaction_date: interactionDate,
    subject,
    notes,
    outcome_code: outcomeCode,
    next_step: nextStep,
    next_followup_date: nextFollowupDate,
    task_subject: taskSubject,
  } = req.body ?? {};

  if (!Number.isFinite(Number(bankId)) || !subject || !interactionDate || !interactionTypeCode) {
    return res.status(400).json({ message: 'bank_id, subject, interaction_date, and interaction_type_code are required.' });
  }

  try {
    await ensureCrmSchema();

    const [result] = await pool.query(
      `INSERT INTO crm_interaction (
         bank_id,
         contact_id,
         interaction_type_code,
         interaction_date,
         subject,
         notes,
         outcome_code,
         next_step,
         next_followup_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(bankId),
        contactId ? Number(contactId) : null,
        interactionTypeCode,
        interactionDate,
        subject,
        notes || null,
        outcomeCode || null,
        nextStep || null,
        nextFollowupDate || null,
      ]
    );

    if (taskSubject) {
      await pool.query(
        `INSERT INTO crm_task (bank_id, task_subject, due_date, task_status)
         VALUES (?, ?, ?, 'OPEN')`,
        [Number(bankId), taskSubject, nextFollowupDate || null]
      );
    }

    res.status(201).json({ interaction_id: result.insertId });
  } catch (error) {
    console.error('Error creating CRM interaction:', error);
    res.status(500).json({ message: 'Failed to create CRM interaction' });
  }
});

router.delete('/interactions/:interactionId', async (req, res) => {
  const interactionId = Number(req.params.interactionId);
  if (!Number.isFinite(interactionId)) {
    return res.status(400).json({ message: 'Invalid interactionId' });
  }

  try {
    await ensureCrmSchema();
    await pool.query('DELETE FROM crm_interaction WHERE interaction_id = ?', [interactionId]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting CRM interaction:', error);
    res.status(500).json({ message: 'Failed to delete CRM interaction' });
  }
});

export default router;
