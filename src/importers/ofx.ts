// OFX / QFX ("Quicken" / "Money" download format). Most banks offer it, and unlike
// CSV it is standardized, so one parser covers many banks. OFX v1 is SGML where
// closing tags are optional (<TRNAMT>-12.50 with no </TRNAMT>), v2 is XML.
// Reading each <TAG>value up to the next '<' handles both.

import { parseAmountCents, parseDate } from '../parse.js';
import type { ParsedTransaction } from './types.js';

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
  return m?.[1]?.trim() || undefined;
}

export function looksLikeOfx(text: string): boolean {
  return /<OFX>/i.test(text) || /^OFXHEADER:/m.test(text);
}

export function parseOfx(text: string): ParsedTransaction[] {
  const account = tag(text, 'ACCTID');
  const currency = tag(text, 'CURDEF') ?? 'CAD';
  const blocks = text.split(/<STMTTRN>/i).slice(1);

  const out: ParsedTransaction[] = [];
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0]!;
    const date = parseDate(tag(block, 'DTPOSTED'), 'YMD');
    const cents = parseAmountCents(tag(block, 'TRNAMT'));
    if (!date || cents === null) continue;

    const name = tag(block, 'NAME') ?? '';
    const memo = tag(block, 'MEMO') ?? '';
    out.push({
      date,
      amountCents: cents,
      description: [name, memo].filter(Boolean).join(' ').trim() || '(no description)',
      account,
      currency,
      bankId: tag(block, 'FITID'), // the bank's own unique id: perfect for de-duplication
    });
  }
  return out;
}
