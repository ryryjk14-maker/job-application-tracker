'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_OPTIONS } from '../../../lib/statusOptions.js';

// Trim a stored date value down to what a <input type="date"> expects.
function dateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export default function ApplicationDetail({ application }) {
  const router = useRouter();

  const [form, setForm] = useState({
    status: application.status || 'Applied',
    last_contact_date: dateInputValue(application.last_contact_date),
    notes: application.notes || '',
    interview_date: dateInputValue(application.interview_date),
  });

  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [recommendation, setRecommendation] = useState(
    application.claude_recommendation || null
  );
  const [recommendationDate, setRecommendationDate] = useState(
    application.recommendation_date || null
  );

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function patch(body) {
    const response = await fetch(`/api/applications/${application.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Request failed.');
    return payload;
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await patch(form);
      setMessage('Changes saved.');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Closing keeps the database record; it only takes the application off the
  // active list.
  async function handleClose() {
    setClosing(true);
    setError(null);
    setMessage(null);
    try {
      await patch({ ...form, close: true });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setClosing(false);
    }
  }

  // Undoes an accidental close. Only the reopen flag is sent, so nothing else
  // on the record is touched — any unsaved edits in the form above are left
  // for "Save Changes" to apply.
  async function handleReopen() {
    setReopening(true);
    setError(null);
    setMessage(null);
    try {
      await patch({ reopen: true });
      setMessage('Application reopened.');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setReopening(false);
    }
  }

  // The on-demand agentic step: calls the serverless route, which calls Claude.
  async function handleRecommend() {
    setRecommending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: application.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Could not get a recommendation.');
      }
      setRecommendation(payload.claude_recommendation);
      setRecommendationDate(payload.recommendation_date);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setRecommending(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Update Application</h2>
        <form onSubmit={handleSave}>
          <div className="grid">
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
            <span>Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </label>

          <div className="actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>

            <button
              className="btn secondary"
              type="button"
              onClick={handleRecommend}
              disabled={recommending}
            >
              {recommending ? 'Asking Claude…' : 'Recommend Next Action'}
            </button>

            {application.is_active ? (
              <button
                className="btn danger"
                type="button"
                onClick={handleClose}
                disabled={closing}
              >
                {closing ? 'Closing…' : 'Close Application'}
              </button>
            ) : (
              <button
                className="btn secondary"
                type="button"
                onClick={handleReopen}
                disabled={reopening}
              >
                {reopening ? 'Reopening…' : 'Reopen Application'}
              </button>
            )}
          </div>

          {message && <p className="status">{message}</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="panel">
        <h2>Claude Recommendation</h2>
        {recommendation ? (
          <>
            <p className="pre">{recommendation}</p>
            {recommendationDate && (
              <p className="muted" style={{ marginBottom: 0 }}>
                Generated {String(recommendationDate).slice(0, 10)}. Advisory
                only — you decide what to do next.
              </p>
            )}
          </>
        ) : (
          <p className="muted">
            No recommendation yet. Use “Recommend Next Action” to ask Claude to
            review this record.
          </p>
        )}
      </section>
    </>
  );
}
