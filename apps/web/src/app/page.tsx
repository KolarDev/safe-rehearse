import Link from 'next/link';
import { ArrowRightIcon } from '@/components/icons';

const MODES = [
  { title: 'Teacher', quote: 'Let me teach you this.' },
  { title: 'Practice Partner', quote: 'Let’s practise this situation.' },
  { title: 'Examiner', quote: 'I’m going to assess how you handle this.' },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold tracking-wider text-brand uppercase">
        Frontline social-care training
      </p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Rehearse the hard conversations before they happen.
      </h1>
      <p className="mt-4 max-w-xl text-base text-muted">
        A voice agent teaches you, practises with you, then assesses you against expert-authored
        criteria. SafeRehearse, not the AI, decides the result.
      </p>

      <div className="mt-8">
        <Link
          href="/session"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-contrast shadow-sm transition hover:bg-brand-strong"
        >
          Open the rehearsal studio <ArrowRightIcon width={16} height={16} />
        </Link>
      </div>

      <ol className="mt-14 grid gap-4 sm:grid-cols-3">
        {MODES.map((mode, index) => (
          <li key={mode.title} className="rounded-2xl border border-line bg-surface p-5">
            <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
              {index + 1}
            </span>
            <p className="mt-4 text-sm font-semibold">{mode.title}</p>
            <p className="mt-1 text-sm text-muted">“{mode.quote}”</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
