import "./globals.css";
import Link from "next/link";
export const metadata = { title: "OpenOS — Open-source, made usable", description: "Turn GitHub repos into apps you can actually use.", manifest: "/manifest.webmanifest" };
export const viewport = { themeColor: "#f2ecdd" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>
    <header className="sticky top-0 z-40 border-b-2 border-[#1c1a14] bg-[#f2ecdd]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-md bg-[#1c1a14] text-sm font-black text-[#d9e021]">O</span> OpenOS</Link>
        <nav aria-label="OpenOS" className="flex flex-wrap items-center gap-1 text-sm">
          <Link className="rounded-md px-3 py-2 font-medium hover:bg-[#e9e1cd]" href="/">Discover</Link>
          <Link className="rounded-md px-3 py-2 font-medium hover:bg-[#e9e1cd]" href="/workspace">My Apps</Link>
          <details className="relative">
            <summary className="cursor-pointer rounded-md px-3 py-2 font-medium hover:bg-[#e9e1cd]">Studios</summary>
            <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-2 shadow-[4px_4px_0_#1c1a14]">
              <Link className="block rounded-md px-3 py-2 hover:bg-[#f2ecdd]" href="/studio/pdf">PDF Studio</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-[#f2ecdd]" href="/studio/image">Photo Studio</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-[#f2ecdd]" href="/studio/ocr">OCR Reader</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-[#f2ecdd]" href="/studio/audio">Transcription</Link>
            </div>
          </details>
        </nav>
      </div>
    </header>
    <script dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}" }} />
    <main className="mx-auto max-w-6xl px-4 pb-20">{children}</main>
    <footer className="border-t-2 border-[#1c1a14] py-6 text-center text-xs text-[#5c5747]">PDF tools run on the OpenOS server. OCR and photo tools run in your browser. Converted apps run in isolated sandboxes — never on your device.</footer>
  </body></html>);
}
