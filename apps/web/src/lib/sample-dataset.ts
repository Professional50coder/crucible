/**
 * A valid sample dataset, so the flow can be exercised without anyone having a
 * JSONL file to hand. Shaped exactly like 0G's own example: chat-messages
 * format, 30 records, which is the smoke-test size 0G ships.
 */

const PAIRS: Array<[string, string]> = [
  ['Our checkout is timing out for EU customers.', 'Thanks for flagging that — I can see elevated latency on the EU payment route. I’ve escalated it and will update you within the hour.'],
  ['Can I get a refund after 40 days?', 'Our standard window is 30 days, so this falls outside it. I can offer account credit instead — would that work for you?'],
  ['The invoice PDF is blank.', 'That usually means the render job failed. I’ve regenerated invoice #4471 and sent it to the address on file.'],
  ['How do I rotate my API key?', 'Settings → API keys → Rotate. The old key stays valid for 24 hours so you can deploy without downtime.'],
  ['You charged me twice this month.', 'You’re right — there’s a duplicate charge on the 3rd. I’ve refunded it; it should land in 3–5 business days.'],
  ['Is there a self-hosted option?', 'Not today. Self-hosting is on the roadmap for next year, and I’ve added you to the list we’ll contact when it’s ready.'],
  ['My team can’t log in after the SSO change.', 'The SSO metadata URL changed on our side. Re-import it from Settings → SSO and existing sessions will keep working.'],
  ['Why is my usage report empty?', 'Reports lag by about 20 minutes. If it’s still empty after that, the workspace may not have any billable events yet.'],
  ['Can you delete all my data?', 'Yes. I’ll queue a full erasure — it completes within 30 days and I’ll email you confirmation when it’s done.'],
  ['The webhook fires twice for one event.', 'That’s at-least-once delivery working as designed. Deduplicate on the event id in the payload header.'],
  ['Do you support SAML?', 'Yes, on Business and above. I can enable it on your workspace now if you’d like.'],
  ['My upload keeps failing at 90%.', 'That pattern usually means a proxy timeout rather than a size limit. Try the resumable endpoint — it chunks the transfer.'],
  ['Can I downgrade mid-cycle?', 'You can. The change takes effect at the next renewal and we prorate the difference as credit.'],
  ['Where do I find my customer id?', 'Bottom-left of the billing page, and in the header of every invoice.'],
  ['Your status page says operational but we’re down.', 'Checking now — if it’s isolated to your region the global page won’t reflect it. I’ll confirm within 15 minutes.'],
]

/** 30 records, matching the size of 0G's shipped example. */
export const SAMPLE_DATASET = Array.from({ length: 30 }, (_, index) => {
  const [user, assistant] = PAIRS[index % PAIRS.length]!
  const suffix = index >= PAIRS.length ? ` (case ${index + 1})` : ''

  return JSON.stringify({
    messages: [
      { role: 'system', content: 'You are a support agent. Be direct, specific, and never apologise twice.' },
      { role: 'user', content: `${user}${suffix}` },
      { role: 'assistant', content: assistant },
    ],
  })
}).join('\n')

/** A deliberately broken dataset, for demonstrating the validation feedback. */
export const BROKEN_DATASET = [
  '{"messages":[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]}',
  '{"instruction":"Summarise this","input":"","output":"A summary."}',
  '{"messages":[{"role":"user","content":"still here"}',
  '',
  '{"prompt":"not a 0G format","completion":"nope"}',
].join('\n')
