// Print pages: black ink on white, no chrome, tuned for Letter paper.
export const metadata = { title: { default: "Print · LLUF Halloween", template: "%s · Print · LLUF Halloween" } };

export default function PrintLayout({ children }) {
  return <div className="print-root">{children}</div>;
}
