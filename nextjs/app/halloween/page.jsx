import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/Chrome.jsx";
import Machine from "./Machine.jsx";

// Halloween remix: a copy of mwRemix (app/mw-remix/, copied 2026-10-30) to change freely. Everything it needs is in
// this folder (app/halloween/): the page, the component, the audio engine (recorder.mjs), its styles, its prompts
// (prompts.mjs), and its server routes (api/transcribe, api/suggest, and api/slack, which pulls a Slack work-journal
// channel in as a context document). /mw-remix stays as it was.

export const metadata = {
  title: "Halloween remix",
  description: "mwRemix, remixed: record an interview with an AI producer, with a guest's Slack work journal as context.",
};

export default function HalloweenPage() {
  return (
    <>
      <SiteHeader current="halloween" />
      <main id="main" className="machine-shell">
        <header className="machine-heading">
          <p className="eyebrow">A remix of <Link href="/mw-remix">mwRemix</Link> · <code>nextjs/app/halloween/</code></p>
          <h1>Halloween remix</h1>
          <p className="lede">The mwRemix producer, plus the guest's Slack work journal: import their updates channel under Context setup and the AI reads it for every question.</p>
        </header>
        <Machine apiBase="/halloween/api" storageKey="tdm155ai-week-8:halloween" />
      </main>
      <SiteFooter />
    </>
  );
}
