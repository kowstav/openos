import PdfStudio from "@/components/PdfStudio";
import Link from "next/link";
export const metadata = { title: "PDF Studio — OpenOS" };
export default function Page() { return (<div className="py-10"><Link href="/" className="text-sm text-zinc-400">← Marketplace</Link><h1 className="font-display mt-4 text-4xl">PDF Studio</h1><p className="mt-2 max-w-xl text-zinc-400">Built on <strong className="text-zinc-200">pdf-lib</strong> through a trusted server adapter. Files are processed in memory and never stored. Max 15 MB per file.</p><div className="mt-8 max-w-2xl rounded-xl border border-white/10 bg-[#141416] p-6"><PdfStudio /></div></div>); }
