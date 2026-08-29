import "./globals.css";

export const metadata = {
  title: "Jira SE & IN Team Dashboard",
  description: "Live 7-day Service Requests and Incident Request team dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
