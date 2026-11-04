import "./globals.css";
import Link from "next/link";
export const metadata = { title: "OpenOS — Open-source, made usable", description: "Turn GitHub repos into apps you can actually use." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0b0c]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"><span className="grid h-7 w-7 place-items-center rounded-md bg-[#e8ff47] text-black text-sm font-black">O</span> OpenOS</Link>
        <nav className="flex max-w-full gap-1 overflow-x-auto text-sm whitespace-nowrap text-zinc-300">
          <Link className="rounded-md px-3 py-1.5 hover:bg-white/10 hover:text-white" href="/">Marketplace</Link>
          <Link className="rounded-md px-3 py-1.5 hover:bg-white/10 hover:text-white" href="/workspace">My Apps</Link>
          <Link className="rounded-md px-3 py-1.5 hover:bg-white/10 hover:text-white" href="/studio/pdf">PDF Studio</Link>
          <Link className="rounded-md px-3 py-1.5 hover:bg-white/10 hover:text-white" href="/studio/image">Photo Studio</Link>
          <Link className="rounded-md px-3 py-1.5 hover:bg-white/10 hover:text-white" href="/studio/ocr">OCR</Link>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 pb-20">{children}</main>
    <footer className="border-t border-white/10 py-6 text-center text-xs text-zinc-500">OpenOS runs only vetted libraries through trusted adapters. No arbitrary repo code is executed.</footer>
  </body></html>);
}
