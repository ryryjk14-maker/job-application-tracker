import Link from 'next/link';
import { getSupabase } from '../lib/supabase.js';
import { daysSince, daysSinceLastActivity, formatDate } from '../lib/dates.js';

export const dynamic = 'force-dynamic';

function timingSummary(application) {
  const sinceApplied = daysSince(application.date_applied);
  const sinceContact = daysSince(application.last_contact_date);

  const parts = [];
  if (sinceApplied !== null) parts.push(`Applied ${sinceApplied}d ago`);
  if (sinceContact !== null) parts.push(`Last contact ${sinceContact}d ago`);
  if (application.interview_date) {
    parts.push(`Interview ${formatDate(application.interview_date)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No dates recorded';
}

function attentionReason(application) {
  const idle = daysSinceLastActivity(application);
  if (idle === null) return 'No dates recorded';
  const sinceContact = daysSince(application.last_contact_date);
  if (sinceContact !== null && sinceContact === idle) {
    return `Last contact ${idle} days ago`;
  }
  return `Applied ${idle} days ago`;
}

export default async function DashboardPage() {
  const { data, error } = await getSupabase()
    .from('applications')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <>
        <h1>Job Application Tracker</h1>
        <p className="error">Could not load applications: {error.message}</p>
      </>
    );
  }

  const applications = data || [];
  const needsAttention = applications.filter((a) => a.needs_attention);

  return (
    <>
      <div className="header">
        <h1>Job Application Tracker</h1>
        <Link className="btn" href="/new">
          + Add Application
        </Link>
      </div>

      <p className="counts">
        Active applications: {applications.length} &nbsp;·&nbsp; Needs
        attention: {needsAttention.length}
      </p>

      {needsAttention.length > 0 && (
        <section className="panel alert">
          <h2>Needs Attention</h2>
          <table>
            <tbody>
              {needsAttention.map((application) => (
                <tr key={application.id}>
                  <td>
                    <strong>{application.company_name}</strong> —{' '}
                    {application.job_title}
                    <div className="muted">{attentionReason(application)}</div>
                  </td>
                  <td style={{ width: 90, textAlign: 'right' }}>
                    <Link href={`/applications/${application.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <h2>Active Applications</h2>
        {applications.length === 0 ? (
          <p className="muted">
            No active applications yet. Use “Add Application” to record one.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Position</th>
                <th>Status</th>
                <th>Timing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id}>
                  <td>
                    {application.company_name}
                    {application.needs_attention && (
                      <span className="flag">Attention</span>
                    )}
                  </td>
                  <td>{application.job_title}</td>
                  <td>{application.status}</td>
                  <td className="muted">{timingSummary(application)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/applications/${application.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
