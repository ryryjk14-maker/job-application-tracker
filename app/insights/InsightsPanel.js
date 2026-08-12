'use client';

import { useState } from 'react';

// Fixed application text, not model output. The scope of an AI reading of this
// data is a property of the feature, so it is stated by the app itself and
// cannot be reworded or omitted by whatever Claude returns.
const DISCLAIMER =
  'AI-generated analysis of the applications currently tracked. These ' +
  'observations describe patterns in this dataset and do not establish why an ' +
  'outcome occurred or predict future results.';

// Only ever called after a click, so this runs in the browser and cannot cause
// a server/client rendering mismatch.
function formatGeneratedAt(value) {
  if (!value) return 'just now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'just now';
  return parsed.toLocaleString();
}

export default function InsightsPanel({ totalTracked, minimumApplications }) {
  const [generating, setGenerating] = useState(false);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);

  const enoughData = totalTracked >= minimumApplications;

  // No request body: the route recomputes the metrics from Supabase itself, so
  // there is nothing for the browser to send and nothing it could tamper with.
  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/insights', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Could not generate insights.');
      }
      setInsights(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="panel">
      <h2>AI Insights</h2>

      {!enoughData ? (
        <p className="muted">
          Portfolio insights need at least {minimumApplications} tracked
          applications before patterns mean anything. You currently have{' '}
          {totalTracked}. Add a few more and this will open up — the analytics
          above work at any size.
        </p>
      ) : (
        <>
          <p className="muted">
            Sends the calculated figures above — and nothing else — to Claude for
            3 observations and one suggested area of focus. No company names,
            contacts, or notes leave this app.
          </p>

          <div className="actions">
            <button
              className="btn secondary"
              type="button"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Asking Claude…' : 'Generate AI Insights'}
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      {insights && (
        <div className="insights">
          <h3>Observations</h3>
          <ol className="insight-list">
            {insights.observations.map((observation, index) => (
              <li key={index}>{observation}</li>
            ))}
          </ol>

          <h3>Recommended Area of Focus</h3>
          <p className="focus-title">{insights.focus_area.title}</p>
          <p>{insights.focus_area.rationale}</p>

          {insights.data_limitations && (
            <>
              <h3>Data Limitations</h3>
              <p>{insights.data_limitations}</p>
            </>
          )}

          <p className="disclaimer">{DISCLAIMER}</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Generated {formatGeneratedAt(insights.generated_at)} from the
            figures above. You remain responsible for interpreting this analysis
            and for every employment decision you make.
          </p>
        </div>
      )}
    </section>
  );
}
