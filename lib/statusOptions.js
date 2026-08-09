// The status values from the 5A data model.
//
// This lives in its own module so client components can import it without
// pulling in the server-only Supabase client.
export const STATUS_OPTIONS = [
  'Applied',
  'Recruiter Contact',
  'Interview Scheduled',
  'Interview Completed',
  'Waiting',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Closed',
];
