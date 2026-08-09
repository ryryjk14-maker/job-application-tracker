import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabase } from '../../../lib/supabase.js';
import {
  daysSince,
  daysUntil,
  formatDate,
} from '../../../lib/dates.js';
import ApplicationDetail from './ApplicationDetail.js';

export const dynamic = 'force-dynamic';

export default async function ApplicationPage({ params }) {
  const { id } = await params;

  const { data: application, error } = await getSupabase()
    .from('applications')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !application) {
    notFound();
  }

  const sinceApplied = daysSince(application.date_applied);
  const sinceContact = daysSince(application.last_contact_date);
  const untilInterview = daysUntil(application.interview_date);

  return (
    <>
      <div className="header">
        <h1>Application Details</h1>
        <Link href="/">Back to dashboard</Link>
      </div>

      <section className="panel">
        <dl>
          <dt>Company</dt>
          <dd>{application.company_name}</dd>

          <dt>Position</dt>
          <dd>{application.job_title}</dd>

          <dt>Status</dt>
          <dd>
            {application.status}
            {application.needs_attention && (
              <span className="flag">Attention</span>
            )}
          </dd>

          <dt>Date applied</dt>
          <dd>
            {formatDate(application.date_applied)}
            {sinceApplied !== null && (
              <span className="muted"> ({sinceApplied} days ago)</span>
            )}
          </dd>

          <dt>Last employer contact</dt>
          <dd>
            {formatDate(application.last_contact_date)}
            {sinceContact !== null && (
              <span className="muted"> ({sinceContact} days ago)</span>
            )}
          </dd>

          <dt>Interview date</dt>
          <dd>
            {formatDate(application.interview_date)}
            {untilInterview !== null && (
              <span className="muted">
                {' '}
                ({untilInterview > 0
                  ? `in ${untilInterview} days`
                  : untilInterview === 0
                    ? 'today'
                    : `${Math.abs(untilInterview)} days ago`}
                )
              </span>
            )}
          </dd>

          <dt>Job posting</dt>
          <dd>
            {application.job_posting_url ? (
              <a
                href={application.job_posting_url}
                target="_blank"
                rel="noreferrer"
              >
                {application.job_posting_url}
              </a>
            ) : (
              '—'
            )}
          </dd>

          <dt>Contact name</dt>
          <dd>{application.contact_name || '—'}</dd>

          <dt>Contact email</dt>
          <dd>{application.contact_email || '—'}</dd>

          <dt>Record state</dt>
          <dd>{application.is_active ? 'Active' : 'Closed'}</dd>

          <dt>Created</dt>
          <dd>{formatDate(application.created_at)}</dd>

          <dt>Last updated</dt>
          <dd>{formatDate(application.updated_at)}</dd>
        </dl>
      </section>

      <ApplicationDetail application={application} />
    </>
  );
}
