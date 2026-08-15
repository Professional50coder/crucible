// Generates edge-cases/invalid/*.jsonl — one file per failure mode.
// Written with Buffer/byte control so BOM and CRLF survive exactly as intended.
import { writeFileSync } from 'node:fs'

const OUT = new URL('./invalid/', import.meta.url)

const chat = (q, a) => JSON.stringify({ messages: [{ role: 'user', content: q }, { role: 'assistant', content: a }] })

// 12 well-formed chat records to build the mostly-valid files from.
const good = Array.from({ length: 12 }, (_, i) =>
  chat(`What is the 0G testnet chain ID? (variant ${i + 1})`, '16602.'),
)

const write = (name, text) => writeFileSync(new URL(name, OUT), Buffer.from(text, 'utf8'))

// 1. mixed-formats — 11 chat records with one instruction record spliced in.
write(
  'mixed-formats.jsonl',
  [
    ...good.slice(0, 6),
    JSON.stringify({ instruction: 'What is the 0G mainnet chain ID?', input: '', output: '16661.' }),
    ...good.slice(6, 11),
  ].join('\n') + '\n',
)

// 2. too-few — 9 valid records, one short of the minimum of 10.
write('too-few.jsonl', good.slice(0, 9).join('\n') + '\n')

// 3. blank-lines — a blank line between records.
write(
  'blank-lines.jsonl',
  [...good.slice(0, 5), '', ...good.slice(5, 12)].join('\n') + '\n',
)

// 4. trailing-comma — a comma before the closing brace on one line.
write(
  'trailing-comma.jsonl',
  [
    ...good.slice(0, 4),
    '{"messages":[{"role":"user","content":"What is PoRA?"},{"role":"assistant","content":"Proof of Random Access.",}]}',
    ...good.slice(4, 12),
  ].join('\n') + '\n',
)

// 5. not-jsonl — a single JSON array instead of one object per line.
write(
  'not-jsonl.jsonl',
  '[' + good.join(',') + ']\n',
)

// 6. missing-output — instruction records with no `output` key.
write(
  'missing-output.jsonl',
  Array.from({ length: 12 }, (_, i) =>
    JSON.stringify({ instruction: `Summarise fact ${i + 1} about 0G.`, input: '0G Chain runs CometBFT.' }),
  ).join('\n') + '\n',
)

// 7. bad-role — a chat message whose `role` is a number.
write(
  'bad-role.jsonl',
  [
    ...good.slice(0, 3),
    '{"messages":[{"role":1,"content":"What is 0G DA?"},{"role":"assistant","content":"0G\'s data availability layer."}]}',
    ...good.slice(3, 12),
  ].join('\n') + '\n',
)

// 8. empty-messages — a chat record with an empty messages array.
write(
  'empty-messages.jsonl',
  [...good.slice(0, 7), '{"messages":[]}', ...good.slice(7, 12)].join('\n') + '\n',
)

// 9. null-content — a message whose `content` is null.
write(
  'null-content.jsonl',
  [
    ...good.slice(0, 2),
    '{"messages":[{"role":"user","content":"What is the 0G faucet URL?"},{"role":"assistant","content":null}]}',
    ...good.slice(2, 12),
  ].join('\n') + '\n',
)

// 10. bom — otherwise-valid file prefixed with a UTF-8 byte-order mark.
writeFileSync(
  new URL('bom.jsonl', OUT),
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(good.join('\n') + '\n', 'utf8')]),
)

// 11. crlf — otherwise-valid file with Windows line endings.
write('crlf.jsonl', good.join('\r\n') + '\r\n')

console.log('wrote 11 invalid fixtures')
