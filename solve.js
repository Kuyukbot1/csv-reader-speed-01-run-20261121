// Fast drop-in for make.fun's csv-reader 1.0.0 (csv-reader-speed-01).
//
// Same answer as csv-reader 1.0.0 for every input {text, header}:
//   {columns, rows, errors} with its broken-row policy (BOM dropped, empty
//   lines are no records, stray CRs dropped, quoted fields with "" escapes
//   and CR/LF read as LF, junk after a closing quote, unterminated quotes
//   re-read as unquoted, short/long rows padded/cut to the first width).
//
// Speed comes from never walking the text a character at a time in the
// common case: String#indexOf (native code) finds the next comma, one short
// bounded scan up to it finds a line break or a stray CR, and String#slice
// takes each field whole. Per-character work happens only inside a quoted
// field that holds a line break or a doubled quote, and only in a field
// that holds a stray CR. Only the standard library is used (no dependencies
// at all), and nothing is kept from one call to the next.

/** Field endings. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0; // a U+FEFF at the start is dropped
  let line = 1; // the line the character at pos is on

  // The record being read: the line it starts on, its index in rows (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field from pos, with `init` already in the value.
  // Returns [value, ended, added]: added counts the characters kept after init.
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    for (;;) {
      const iC = text.indexOf(',', pos);
      if (iC === -1) {
        // No comma left in the text: the field runs to the next LF or the end.
        const iN = text.indexOf('\n', pos);
        const end = iN === -1 ? n : iN;
        let r = -1;
        for (let i = pos; i < end; i++) {
          if (text.charCodeAt(i) === 13) {
            r = i;
            break;
          }
        }
        if (r !== -1) {
          if (text.charCodeAt(r + 1) === 10) {
            value += text.slice(pos, r);
            added += r - pos;
            pos = r + 2;
            line += 1;
            return [value, LINE_BREAK, added];
          }
          value += text.slice(pos, r);
          added += r - pos;
          error('stray_cr');
          pos = r + 1;
          continue;
        }
        value += text.slice(pos, end);
        added += end - pos;
        if (iN === -1) {
          pos = n;
          return [value, END, added];
        }
        pos = iN + 1;
        line += 1;
        return [value, LINE_BREAK, added];
      }
      // A comma is ahead: scan up to it for a line break or a stray CR.
      // This one bounded loop replaces the separate LF scan: a field that
      // ends at a comma is usually short, so the scan stays short.
      let k = -1;
      let kc = 0;
      for (let i = pos; i < iC; i++) {
        const c = text.charCodeAt(i);
        if (c === 10 || c === 13) {
          k = i;
          kc = c;
          break;
        }
      }
      if (k === -1) {
        value += text.slice(pos, iC);
        added += iC - pos;
        pos = iC + 1;
        return [value, COMMA, added];
      }
      if (kc === 10) {
        value += text.slice(pos, k);
        added += k - pos;
        pos = k + 1;
        line += 1;
        return [value, LINE_BREAK, added];
      }
      if (text.charCodeAt(k + 1) === 10) {
        value += text.slice(pos, k);
        added += k - pos;
        pos = k + 2;
        line += 1;
        return [value, LINE_BREAK, added];
      }
      value += text.slice(pos, k);
      added += k - pos;
      error('stray_cr');
      pos = k + 1;
    }
  }

  // Appends text[a..b) to value, reading each CRLF or lone CR inside it as
  // one LF and counting the lines. Fast when the span holds no line break.
  function appendSpan(value, a, b) {
    // Fast path: no line break in the span. The span is scanned with a
    // bounded loop, never with an indexOf that runs past it.
    let i = a;
    while (i < b) {
      const c = text.charCodeAt(i);
      if (c === 10 || c === 13) break;
      i += 1;
    }
    if (i === b) return value + text.slice(a, b);
    // Slow path: at least one line break inside; each CRLF or lone CR reads
    // as one LF and counts a line.
    let out = value + text.slice(a, i);
    while (i < b) {
      const c = text.charCodeAt(i);
      if (c === 13) {
        out += '\n';
        line += 1;
        i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
      } else if (c === 10) {
        out += '\n';
        line += 1;
        i += 1;
      } else {
        let j = i;
        while (j < b) {
          const d = text.charCodeAt(j);
          if (d === 10 || d === 13) break;
          j += 1;
        }
        out += text.slice(i, j);
        i = j;
      }
    }
    return out;
  }

  // Reads a quoted field whose opening quote is at pos.
  // Returns [value, ended, added] like readUnquoted (added counts junk kept).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote inside: one literal quote.
        value = appendSpan(value, pos, q) + '"';
        pos = q + 2;
        continue;
      }
      value = appendSpan(value, pos, q);
      pos = q + 1;
      break;
    }
    if (pos >= n) return [value, END, 0];
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return [value, COMMA, 0];
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return [value, LINE_BREAK, 0];
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return [value, LINE_BREAK, 0];
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk[2] > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field[0]);
      ended = field[1];
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
