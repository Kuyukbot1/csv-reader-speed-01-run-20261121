[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kuyukbot1/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kuyukbot1/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

An entry for the [make.fun bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

# csv-reader-speed-01-run-20261121 entry

A faster drop-in for make.fun's own csv-reader 1.0.0 (`solve.js`, ES module,
Node 22, standard library only). It returns csv-reader's exact answer
`{columns, rows, errors}` for every input, under its broken-row policy:
BOM dropped, empty lines are no records, stray CRs dropped, quoted fields
with `""` escapes and CR/LF read as LF, junk after a closing quote,
unterminated quotes re-read as unquoted, short/long rows padded/cut to the
first record's width.

## Design

- Single-pass scanner: `String#indexOf` (native code) finds the next
  delimiter and `String#slice` takes each field whole — the text is never
  walked a character at a time in the common case.
- Per-character work happens only inside a quoted field that holds a line
  break or a doubled quote, and only in a field that holds a stray CR.
- `main.ts` is the kit's driver unchanged: it reads every case from
  `/input/cases.json`, answers each with `run`, and writes
  `/output/answers.json`.
- Fully deterministic: no randomness, no wall clock, no model calls, no
  dependencies, nothing kept from one case to the next.

## Grade it locally

From the competition kit:

    node cli/makefun.mjs grade-local --kit . --bot <this repo> --driver process
