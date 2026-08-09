import './globals.css';

export const metadata = {
  title: 'Job Application Tracker',
  description:
    'Track job applications, flag the ones that need attention, and ask Claude what to do next.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
