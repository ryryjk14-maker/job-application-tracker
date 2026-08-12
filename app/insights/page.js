import Link from 'next/link';
import { getSupabase } from '../../lib/supabase.js';
import {
  computePortfolioMetrics,
  CONTACT_GAP_LABEL,
} from '../../lib/analytics.js';
import { MINIMUM_APPLICATIONS_FOR_INSIGHTS } from '../../lib/insights.js';
import InsightsPanel from './InsightsPanel.js';

export const dynamic = 'force-dynamic';

function count(value) {
  return value === null || value === undefined ? '—' : String(value);
}

function percent(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function days(value) {
  return value === null || value === undefined ? '—' : `${value}`;
}

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export default async function InsightsPage() {
  // Closed applications are included on purpose. Rates computed against active
  // applications only would shrink their own denominator every time a record is
  // closed, which is the opposite of what a portfolio view should do.
  const { data, error } = await getSupabase()
    .from('applications')
    .select('status, date_applied, last_contact_date, interview_date, is_active');

  if (error) {
    return (
      <>
        <div className="header">
          <h1>Job Search Insights</h1>
          <Link href="/">Back to dashboard</Link>
        </div>
        <p className="error">Could not load applications: {error.message}</p>
      </>
    );
  }

  const metrics = computePortfolioMetrics(data || []);
  const sinceApplying = metrics.days_since_applying;
  const contactGap = metrics.days_applied_to_most_recent_contact;

  const statusRows = Object.entries(metrics.by_status).filter(
    ([, value]) => value > 0
  );

  return (
    <>
      <div className="header">
        <h1>Job Search Insights</h1>
        <Link href="/">Back to dashboard</Link>
      </div>

      <p className="counts">
        Calculated from the {metrics.total_tracked} application
        {metrics.total_tracked === 1 ? '' : 's'} currently tracked, including
        closed records.
      </p>

      <section className="panel">
        <h2>Application Analytics</h2>

        <div className="stats">
          <Stat label="Total tracked" value={count(metrics.total_tracked)} />
          <Stat label="Active" value={count(metrics.active_applications)} />
          <Stat label="Closed" value={count(metrics.closed_applications)} />
          <Stat
            label="Needs attention now"
            value={count(metrics.needs_attention_now)}
            note={`Active and idle ${metrics.attention_threshold_days}+ days`}
          />
          <Stat
            label="Recorded response rate"
            value={percent(metrics.recorded_responses.rate_percent)}
            note={`${metrics.recorded_responses.count} of ${metrics.total_tracked} have a recorded employer response`}
          />
          <Stat
            label="Interview rate"
            value={percent(metrics.interviews.rate_percent)}
            note={`${metrics.interviews.count} of ${metrics.total_tracked} reached an interview stage`}
          />
          <Stat
            label="Average days since applying"
            value={days(sinceApplying.average)}
            note={`${sinceApplying.counted} of ${metrics.total_tracked} have an application date`}
          />
          <Stat
            label="Median days since applying"
            value={days(sinceApplying.median)}
            note={`Coverage ${percent(sinceApplying.coverage_percent)}`}
          />
          <Stat
            label={CONTACT_GAP_LABEL}
            value={days(contactGap.average)}
            note={`${contactGap.counted} of ${metrics.total_tracked} have both dates recorded`}
          />
        </div>

        <p className="muted" style={{ marginBottom: 0 }}>
          These figures are calculated by the app from the tracked records. The
          response rate reflects employer responses that were recorded here, not
          employer behaviour. The final figure uses the most recent recorded
          contact date, so it is not a measure of how quickly employers reply.
        </p>
      </section>

      <section className="panel">
        <h2>Applications by Status</h2>
        {statusRows.length === 0 ? (
          <p className="muted">No applications tracked yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Applications</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map(([status, value]) => (
                <tr key={status}>
                  <td>{status}</td>
                  <td style={{ textAlign: 'right' }}>{value}</td>
                </tr>
              ))}
              {metrics.status_unrecorded > 0 && (
                <tr>
                  <td className="muted">Status not recognised</td>
                  <td style={{ textAlign: 'right' }}>
                    {metrics.status_unrecorded}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <InsightsPanel
        totalTracked={metrics.total_tracked}
        minimumApplications={MINIMUM_APPLICATIONS_FOR_INSIGHTS}
      />
    </>
  );
}
