import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: { default: "Interviewing · LLUF Halloween", template: "%s · LLUF Halloween" },
  description: "LLUF Halloween: interviewing and podcasting. A recording and interviewing machine, a copy to remix, and docs on questions and GarageBand.",
};

export const viewport = {
  colorScheme: "dark",
  themeColor: "#121412",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
