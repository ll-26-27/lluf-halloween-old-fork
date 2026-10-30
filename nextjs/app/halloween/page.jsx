import { Creepster } from "next/font/google";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/Chrome.jsx";
import Machine from "./Machine.jsx";
import theme from "./halloween.module.css";

// Halloween remix: a copy of mwRemix (app/mw-remix/, copied 2026-10-30) to change freely. Everything it needs is in
// this folder (app/halloween/): the page, the component, the audio engine (recorder.mjs), its styles (machine.module.css,
// and halloween.module.css for the theme), its prompts (prompts.mjs), and its server routes (api/transcribe,
// api/suggest, and api/slack, which pulls a Slack work-journal channel in as a context document). /mw-remix stays as
// it was.

const creepster = Creepster({ weight: "400", subsets: ["latin"], variable: "--font-creepster" });

export const metadata = {
  title: "Haunted Interview Machine",
  description: "mwRemix, remixed for Halloween: record an interview with an AI producer, with a guest's Slack work journal as context.",
};

export const viewport = {
  colorScheme: "dark",
  themeColor: "#110c16",
};

const bat = <svg className={theme.bat} viewBox="0 0 24 11" aria-hidden="true"><path d="M0 6C3 2 6 2 8 5c1-2 2-3 3-2l1-2 1 2c1-1 2 0 3 2 2-3 5-3 8 1-3-1-5 0-6 2-2-1-3 0-4 2-1-1-3-1-4 0-1-2-2-3-4-2C5 6 3 5 0 6Z" /></svg>;

export default function HalloweenPage() {
  return (
    <div className={`${theme.haunted} ${creepster.variable}`}>
      <span className={theme.moon} aria-hidden="true" />
      <div className={theme.bats} aria-hidden="true">{bat}{bat}{bat}</div>
      <SiteHeader current="halloween" />
      <main id="main" className="machine-shell">
        <header className={`machine-heading ${theme.heading}`}>
          <svg className={theme.web} viewBox="0 0 100 100" aria-hidden="true">
            <path d="M0 0L100 8M0 0L92 40M0 0L70 70M0 0L40 92M0 0L8 100" />
            <path d="M25 2Q20 8 23 10Q16 14 18 18Q11 19 10 23Q4 22 2 25M50 4Q41 15 46 20Q33 27 35 35Q24 37 20 46Q9 43 4 50M75 6Q62 22 69 30Q50 41 53 53Q36 54 30 69Q14 63 6 75" />
          </svg>
          <span className={theme.spider} aria-hidden="true">
            <svg viewBox="0 0 24 20"><ellipse cx="12" cy="11" rx="4" ry="5" /><circle cx="12" cy="5" r="2.6" /><path d="M8 9L2 5M8 11L1 11M8 13L2 17M16 9l6-4M16 11h7M16 13l6 4" fill="none" strokeWidth="1.4" /></svg>
          </span>
          <p className="eyebrow">A remix of <Link href="/mw-remix">mwRemix</Link> · <code>nextjs/app/halloween/</code></p>
          <h1>Haunted <span>Interview Machine</span></h1>
          <p className="lede">Summon the guest&apos;s work journal from Slack, record the séance, and let the AI producer whisper follow-up questions from beyond. Everything mwRemix does, after dark.</p>
        </header>
        <Machine apiBase="/halloween/api" storageKey="lluf-halloween:halloween" />
      </main>
      <SiteFooter />
    </div>
  );
}
