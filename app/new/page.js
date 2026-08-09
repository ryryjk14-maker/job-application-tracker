'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { STATUS_OPTIONS } from '../../lib/statusOptions.js';

const EMPTY_FORM = {
  company_name: '',
  job_title: '',
  date_applied: '',
  job_posting_url: '',
  status: 'Applied',
  contact_name: '',
  contact_email: '',
  last_contact_date: '',
  notes: '',
  interview_date: '',
};

export default function AddApplicationPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || 'Could not save the application.');
        setSaving(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <>
      <div className="header">
        <h1>Add Application</h1>
        <Link href="/">Back to dashboard</Link>
      </div>

      <form className="panel" onSubmit={handleSubmit}>
        <div className="grid">
          <label>
            <span>Company name *</span>
            <input
              required
              value={form.company_name}
              onChange={(e) => update('company_name', e.target.value)}
            />
          </label>

          <label>
            <span>Job title *</span>
            <input
              required
              value={form.job_title}
              onChange={(e) => update('job_title', e.target.value)}
            />
          </label>

          <label>
            <span>Date applied</span>
            <input
              type="date"
              value={form.date_applied}
              onChange={(e) => update('date_applied', e.target.value)}
            />
          </label>

          <label>
            <span>Status</span>
            <select
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Contact name</span>
            <input
              value={form.contact_name}
              onChange={(e) => update('contact_name', e.target.value)}
            />
          </label>

          <label>
            <span>Contact email</span>
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => update('contact_email', e.target.value)}
            />
          </label>

          <label>
            <span>Last contact date</span>
            <input
              type="date"
              value={form.last_contact_date}
              onChange={(e) => update('last_contact_date', e.target.value)}
            />
          </label>

          <label>
            <span>Interview date</span>
            <input
              type="date"
              value={form.interview_date}
              onChange={(e) => update('interview_date', e.target.value)}
            />
          </label>
        </div>

        <label>
          <span>Job posting URL</span>
          <input
            type="url"
            placeholder="https://"
            value={form.job_posting_url}
            onChange={(e) => update('job_posting_url', e.target.value)}
          />
        </label>

        <label>
          <span>Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </label>

        <div className="actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Application'}
          </button>
          <Link className="btn secondary" href="/">
            Cancel
          </Link>
        </div>

        {error && <p className="error">{error}</p>}
      </form>
    </>
  );
}
