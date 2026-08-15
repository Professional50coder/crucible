// Generates sentiment/{train,test}.jsonl
// Chat format. One-word labels so the behaviour change is unmissable:
// the base model rambles, the fine-tuned model emits exactly one word.
import { writeFileSync } from 'node:fs'

const OUT = new URL('./', import.meta.url)
const SYS = 'Classify the sentiment of the text as exactly one word: positive, negative, or mixed.'

// Half the records carry the system prompt, half do not, so the model learns
// the task rather than learning to depend on the system message.
let withSys = true
const c = (text, label) => {
  withSys = !withSys
  const user = { role: 'user', content: text }
  const asst = { role: 'assistant', content: label }
  return withSys
    ? { messages: [{ role: 'system', content: SYS }, user, asst] }
    : { messages: [user, asst] }
}

const R = []

// --- unambiguous positive --------------------------------------------------
R.push(
  c('Absolutely loved it.', 'positive'),
  c('Best purchase I have made all year. It arrived early, the build quality is superb, and support answered my question in under ten minutes.', 'positive'),
  c('Works perfectly.', 'positive'),
  c('The battery lasts three days and the screen is gorgeous.', 'positive'),
  c('Five stars, no notes.', 'positive'),
  c('I was skeptical about the price, but after two months of daily use I would buy it again without hesitating. It has genuinely changed how I work.', 'positive'),
  c('Fantastic!', 'positive'),
  c('Great value for money.', 'positive'),
  c('The staff were kind and patient with my endless questions.', 'positive'),
  c('Exceeded every expectation I had.', 'positive'),
  c('Solid little machine. Quiet, fast, and it just gets out of the way.', 'positive'),
  c('Café was lovely ☕ — the barista remembered my order from last week.', 'positive'),
  c('这个产品非常好用。', 'positive'),
  c('Es war ausgezeichnet — sehr zu empfehlen.', 'positive'),
  c('The documentation is genuinely excellent: clear examples, no dead links, and every code snippet actually runs.', 'positive'),
  c('Shipping took two days and everything was packed with care.', 'positive'),
  c('I have recommended this to four colleagues already.', 'positive'),
  c('Clean interface, sensible defaults, and it did not try to sell me anything.', 'positive'),
  c('Honestly? Delighted.', 'positive'),
  c('After the update, the crashes stopped completely and it has been rock solid for a month.', 'positive'),
  c('Perfect 🎉', 'positive'),
  c('The refund was processed the same day I asked. That is how it should work.', 'positive'),
)

// --- unambiguous negative --------------------------------------------------
R.push(
  c('Total waste of money.', 'negative'),
  c('It broke within a week.', 'negative'),
  c('Terrible.', 'negative'),
  c('The app crashes every time I open the settings page, and there has been no fix in three releases despite dozens of reports on the forum.', 'negative'),
  c('Support never replied.', 'negative'),
  c('The screen developed a dead pixel on day two and the warranty apparently does not cover it.', 'negative'),
  c('Do not buy this.', 'negative'),
  c('Slow, buggy, and overpriced.', 'negative'),
  c('I have spent more time troubleshooting it than using it.', 'negative'),
  c('The instructions were wrong, the parts did not fit, and the helpline put me on hold for fifty minutes before disconnecting.', 'negative'),
  c('Deeply disappointing.', 'negative'),
  c('Arrived damaged.', 'negative'),
  c('产品质量很差，我很失望。', 'negative'),
  c('Ne fonctionne pas du tout. Très déçu.', 'negative'),
  c('It leaks. Every single time. I have replaced the seal twice.', 'negative'),
  c('The interface is a maze and nothing is where you would expect it.', 'negative'),
  c('Charged me twice and then argued about it.', 'negative'),
  c('Loud, hot, and the fan never stops.', 'negative'),
  c('Regret it. 😞', 'negative'),
  c('The documentation says the flag is optional. It is not. I lost an afternoon to that.', 'negative'),
  c('Cancelled after one month.', 'negative'),
  c('The quality has fallen off a cliff since the redesign.', 'negative'),
)

// --- sarcastic: surface words contradict the sentiment ----------------------
R.push(
  c('Great, another crash.', 'negative'),
  c('Oh wonderful, it deleted my work again.', 'negative'),
  c('Fantastic. Three hours on hold. Really living the dream.', 'negative'),
  c('Love how it silently loses my settings every update. Very thoughtful design.', 'negative'),
  c('Brilliant idea putting the delete button right next to save. Truly inspired.', 'negative'),
  c('Sure, "instant" checkout. Twelve minutes and counting.', 'negative'),
  c('Amazing that a $2000 laptop cannot survive a single sneeze.', 'negative'),
  c('What a treat, the update removed the one feature I actually used.', 'negative'),
  c('Perfect timing for the server to go down — right in the middle of the demo. 👏', 'negative'),
  c('Wow, a whole 4% battery after ten minutes. Incredible engineering.', 'negative'),
  c('I was fully prepared to hate this. Annoyingly, it is very good.', 'positive'),
  c('Well, it turns out the "gimmicky" feature everyone mocked is the one I use daily.', 'positive'),
  c('Ugh, now I have to admit my friend was right about this thing. It is excellent.', 'positive'),
  c('Not bad at all, actually.', 'positive'),
  c('I hate that I love it.', 'positive'),
)

// --- genuinely ambiguous / mixed -------------------------------------------
R.push(
  c('The food was outstanding but the service was painfully slow.', 'mixed'),
  c('Beautiful hardware, dreadful software.', 'mixed'),
  c('It does exactly what it says. I just wish it said more.', 'mixed'),
  c('Loved the first season. The second one lost me completely.', 'mixed'),
  c('Fast and reliable, though the price increase this year stings.', 'mixed'),
  c('The team clearly cared, but the deadline beat them and it shows.', 'mixed'),
  c('Comfortable, well made, and far too expensive for what it is.', 'mixed'),
  c('Great battery life. Terrible camera. I use it for work so I can live with that, but if photos matter to you, look elsewhere.', 'mixed'),
  c('It arrived.', 'mixed'),
  c('Fine.', 'mixed'),
  c('It is a product that exists.', 'mixed'),
  c('Better than the last one, which is not saying much.', 'mixed'),
  c('I have no strong feelings either way.', 'mixed'),
  c('Half the features are excellent and half are unfinished.', 'mixed'),
  c('The support team was wonderful about a problem that should never have existed.', 'mixed'),
  c('Cheap, cheerful, and it will probably break by spring.', 'mixed'),
)

// --- awkward strings: quotes, backslashes, newlines, braces ----------------
R.push(
  c('The manual literally says "insert widget A into slot B" — there is no slot B.', 'negative'),
  c('Reviewer said it was "life-changing". They were right.', 'positive'),
  c('Error: cannot find path C:\\Users\\me\\Documents — every single launch.', 'negative'),
  c('The config uses {"mode":"fast"} and it genuinely is fast.', 'positive'),
  c('Pros:\n- quiet\n- light\nCons:\n- expensive\n- short cable', 'mixed'),
  c('It printed {} instead of my data. Twice.', 'negative'),
)

// ---------------------------------------------------------------------------
// Emit — deterministic shuffle, then a stratified 60/20 split so both files
// contain every label.
// ---------------------------------------------------------------------------
let seed = 20260814
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const shuffled = [...R]
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
}

const labelOf = (r) => r.messages[r.messages.length - 1].content
const byLabel = new Map()
for (const r of shuffled) {
  if (!byLabel.has(labelOf(r))) byLabel.set(labelOf(r), [])
  byLabel.get(labelOf(r)).push(r)
}

const test = []
const train = []
for (const [, rs] of byLabel) {
  const n = Math.round(rs.length * 0.25) // 20 of 80
  test.push(...rs.slice(0, n))
  train.push(...rs.slice(n))
}

// Re-shuffle each split so labels are not clustered.
for (const arr of [train, test]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

const toJsonl = (rs) => rs.map((r) => JSON.stringify(r)).join('\n') + '\n'
writeFileSync(new URL('train.jsonl', OUT), toJsonl(train), 'utf8')
writeFileSync(new URL('test.jsonl', OUT), toJsonl(test), 'utf8')

const count = (rs) => {
  const m = {}
  for (const r of rs) m[labelOf(r)] = (m[labelOf(r)] ?? 0) + 1
  return m
}
const withSysCount = (rs) => rs.filter((r) => r.messages[0].role === 'system').length
console.log(`total ${R.length}`)
console.log(`train ${train.length}`, count(train), `system-prompted ${withSysCount(train)}`)
console.log(`test  ${test.length}`, count(test), `system-prompted ${withSysCount(test)}`)
