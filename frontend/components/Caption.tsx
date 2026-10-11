import Link from "next/link";
import { ReactNode } from "react";

export default function Caption({ text, inline }: { text: string; inline?: boolean }) {
  const nodes: ReactNode[] = [];
  const re = /(#[A-Za-z0-9_]{2,40})|(@[a-z0-9_]{3,30})/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    nodes.push(<Link key={i++} href={tok[0] === "#" ? `/tag/${tok.slice(1).toLowerCase()}` : `/${tok.slice(1)}`} className="link">{tok}</Link>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  const cls = "whitespace-pre-wrap break-words text-[15px] leading-relaxed";
  return inline ? <span className={cls}>{nodes}</span> : <p className={cls}>{nodes}</p>;
}
