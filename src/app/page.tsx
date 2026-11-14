import Link from "next/link";
import AppleLogo from "@/components/AppleLogo";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 sm:px-10 lg:px-16">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="flex items-center justify-between border-b border-line py-7">
        <Link href="/" aria-label="Newton home" className="flex items-center gap-0 text-2xl font-semibold tracking-tight">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center"><AppleLogo size={38} /></span>
          <span className="brand-wordmark brand-continuation">ewton!</span>
        </Link>
        <span className="text-xs font-medium tracking-wide text-muted sm:text-sm">A project by Twofold</span>
      </header>

      <main id="main" className="flex flex-1 flex-col justify-center py-14 sm:py-20">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <section aria-labelledby="intro-title">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.2em] text-leaf">Your AI study companion · In development</p>
            <h1 id="intro-title" className="max-w-xl text-5xl leading-[1.08] font-medium tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              A little guidance.<br />
              <span className="font-serif italic text-leaf">Your own discovery.</span>
            </h1>
            <p className="mt-7 max-w-md text-lg leading-relaxed text-muted">
              Learning starts with a question. We’re building Newton to help you think out loud,
              work through the tricky parts, and find your own way forward.
            </p>
            <div className="mt-9">
              <Link href="/study" aria-describedby="workspace-note" className="inline-flex min-h-12 items-center gap-8 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper">
                Student workspace <span aria-hidden="true">↗</span>
              </Link>
              <p id="workspace-note" className="mt-3 text-sm text-muted">Open a local whiteboard. A little space for big ideas.</p>
            </div>
          </section>

          <aside aria-labelledby="notebook-title" className="notebook relative rounded-2xl border border-line p-7 sm:p-10">
            <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
              <h2 id="notebook-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">One step at a time</h2>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-leaf">Algebra I</span>
            </div>
            <p className="mt-12 text-center font-serif text-4xl tracking-wide sm:text-5xl">2(x + 3) = 14</p>
            <div aria-hidden="true" className="mx-auto my-7 h-10 w-px bg-leaf/40" />
            <p className="mx-auto max-w-xs text-center font-serif text-2xl leading-snug italic text-leaf">What would you try first?</p>
            <p className="mt-12 border-t border-line pt-5 text-xs leading-relaxed text-muted">
              A glimpse of the idea, not a live tutoring session. Our first focus: understanding the distributive property.
            </p>
          </aside>
        </div>

        <section aria-labelledby="vision-title" className="mt-16 border-t border-line pt-8 sm:mt-20">
          <h2 id="vision-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What we’re working toward</h2>
          <div className="mt-6 grid gap-7 sm:grid-cols-3 sm:gap-10">
            <div><h3 className="font-medium">Talk it through</h3><p className="mt-2 text-sm leading-relaxed text-muted">Natural voice conversations, with room to ask questions and interrupt.</p></div>
            <div><h3 className="font-medium">Make your thinking visible</h3><p className="mt-2 text-sm leading-relaxed text-muted">A shared whiteboard so guidance can start with the work in front of you.</p></div>
            <div><h3 className="font-medium">Build on what you learn</h3><p className="mt-2 text-sm leading-relaxed text-muted">Context from past practice to make the next session more personal.</p></div>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-xs text-muted">
        <p>Newton by Twofold</p>
        <p>Built for curiosity. Designed for grades 9–12.</p>
      </footer>
    </div>
  );
}
