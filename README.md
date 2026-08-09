# Job Application Tracker

Assignment 5B — the MVP build of the process redesigned in Assignment 5A.

## What the app does

Job searching leaves tracking information scattered across email, browser
history, notes, and memory. This app puts it in one place. You record an
application once, the app keeps the dates and status, it flags records that have
gone quiet, and when you want help deciding what to do about a specific
application you can ask Claude for a recommendation.

Three screens:

- **Dashboard** — active applications with company, job title, status, and basic
  timing (days since applied, days since last contact, interview date). Records
  flagged `needs_attention` are called out in their own panel and tagged in the
  main list. There is an **Add Application** button.
- **Add Application** — a form for company name, job title, date applied, job
  posting URL, status, contact name, contact email, last contact date, notes,
  and interview date. Saving writes a new row to Supabase.
- **Application Details** — every major field for one application, with editing
  for status, last contact date, notes, and interview date. **Close Application**
  takes the record off the active list while keeping the row in the database.
  **Recommend Next Action** asks Claude what to do next.

## The two automations

### Scheduled: the daily attention check

**Route:** `GET /api/cron/check-attention`
**Schedule:** once a day, configured in `vercel.json` (13:00 UTC) using Vercel
Cron.

The job reads every active application, computes the number of days since the
more recent of `date_applied` and `last_contact_date`, and performs a real
Supabase update: applications at or past the 10-day threshold get
`needs_attention = true`, and active applications that no longer qualify get the
flag cleared so the dashboard stays accurate. Records with no usable dates are
left alone rather than guessed at.

The flag does not mean you should contact the employer. It just marks the record
for review.

The route is a plain GET with no request body, so you can test it by visiting
the URL directly in a browser:

```
https://<your-app>.vercel.app/api/cron/check-attention
```

It returns JSON summarizing what it reviewed and which records it flagged or
cleared. Note that this route is not authenticated — that is deliberate, so it
stays testable from a browser as the assignment requires.

### On demand: Recommend Next Action (the agentic step)

**Route:** `POST /api/recommend`

This is the part that uses AI judgment rather than a fixed rule. The button on
the detail screen calls the serverless route, and **the route makes a real
Anthropic Claude API call**. A ten-day rule is good enough to notice that a
record deserves a look, but it cannot tell you whether reaching out is actually
appropriate — a recruiter may already have given a timeline, or an interview may
already be on the calendar. Claude reads the record as a whole and picks one of
five actions.

What gets sent to Claude: company, job title, status, date applied, days since
applied, last contact date, days since last contact, days since the most recent
activity of any kind, interview date and whether it is in the future or the
past, the active/closed flag, the full notes text, and the current date. The day
counts are computed by the app rather than by Claude so the reasoning is
grounded in reliable numbers.

What comes back: a recommendation category — `Wait`, `Consider Following Up`,
`Prepare for Next Step`, `Update Application Status`, or
`Take No Further Action` — plus a short reason and an optional note about
anything that was missing or contradictory. The route validates the category
against those five values before storing anything, then saves the recommendation
and the recommendation date to Supabase.

The recommendation is **advisory only**. The app never emails an employer and
never changes the application's status, contact fields, or active flag based on
what Claude says. You decide what to do.

The prompt behavior comes from the Cowork document *Job Application
Recommendation Decision Guide*, which defines the five categories, the
per-status decision logic, how to handle employer-stated timelines and missing
or conflicting information, and the guardrails. It lives in
`lib/recommendation.js`.

Because a Claude call can take longer than the platform default, the route sets
`export const maxDuration = 60` so a slower response is not cut off. Sixty
seconds is the maximum on Vercel's Hobby plan; raise it if you are on a paid
plan and need more headroom.

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is git-ignored,
and no credentials are hardcoded anywhere in the source.

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | Safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role secret | **Server only.** Never add a `NEXT_PUBLIC_` prefix to this. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Used by `/api/recommend` |

All database access happens on the server (server components, API routes, the
scheduled job), so the app uses the service role key when it is present and
falls back to the anon key when it is not.

Set the same four variables in Vercel under **Project → Settings → Environment
Variables** before deploying.

## Local development

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the four values
npm run dev
```

Open http://localhost:3000.

To test the scheduled job locally, visit
http://localhost:3000/api/cron/check-attention in a browser.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Add the four environment variables listed above.
4. Deploy. Vercel reads `vercel.json` and registers the daily cron job
   automatically.

## Database

The app expects an existing Supabase table named `applications` with these
columns: `id`, `created_at`, `company_name`, `job_title`, `date_applied`,
`job_posting_url`, `status`, `contact_name`, `contact_email`,
`last_contact_date`, `notes`, `interview_date`, `needs_attention`,
`claude_recommendation`, `recommendation_date`, `is_active`, `updated_at`.

Status values: Applied, Recruiter Contact, Interview Scheduled, Interview
Completed, Waiting, Offer, Rejected, Withdrawn, Closed.

## Scope

This is the MVP from Assignment 5A and nothing more. Deliberately out of scope:
email integration, LinkedIn/Indeed/employer-portal integrations, automatic
extraction of job details from posting links, resume or cover letter storage or
generation, automatic follow-up messages, calendar or notification integrations,
salary comparison and analytics, and multiple user accounts.

## Project layout

```
app/
  page.js                              Dashboard
  new/page.js                          Add Application form
  applications/[id]/page.js            Application detail (server)
  applications/[id]/ApplicationDetail.js   Editing + Recommend button (client)
  api/applications/route.js            POST — create an application
  api/applications/[id]/route.js       PATCH — update / close an application
  api/cron/check-attention/route.js    GET  — daily 10-day attention check
  api/recommend/route.js               POST — the Claude API call
lib/
  supabase.js                          Server-side Supabase client
  dates.js                             Day-count helpers and the 10-day rule
  recommendation.js                    Claude prompt, schema, and context builder
  statusOptions.js                     The 5A status values
vercel.json                            Daily cron schedule
```
