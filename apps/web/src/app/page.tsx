import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">SafeRehearse</h1>
      <Link className="underline" href="/session">
        Open the dev session page
      </Link>
    </main>
  );
}
