'use client'

/**
 * Verify a signed passport, in the reader's own browser.
 *
 * Paste a signed envelope and the signer's public key; optionally paste the hash
 * anchored on chain. The check runs locally with the browser's own cryptography:
 * no wallet, no account, no network request, and nothing pasted here leaves the
 * page. That is the point — a verification you watch happen yourself is worth more
 * than one a server tells you about.
 */

import { useState } from 'react'

import { Hash } from '@/components/Hash'
import { Note, Panel, PanelHeader } from '@/components/ui'
import { verifyEnvelopeInBrowser, type EnvelopeCheck } from '@/lib/envelope-verify'

const fieldClass =
  'w-full rounded-md border border-line bg-sub px-3 py-2 font-mono text-xs text-fg outline-none focus:border-phosphor'

export default function VerifyPage() {
  const [envelope, setEnvelope] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [anchor, setAnchor] = useState('')
  const [result, setResult] = useState<EnvelopeCheck | null>(null)
  const [busy, setBusy] = useState(false)

  const ready = envelope.trim() !== '' && publicKey.trim() !== ''

  const run = async () => {
    setBusy(true)
    try {
      setResult(await verifyEnvelopeInBrowser(envelope.trim(), publicKey.trim(), anchor.trim() || undefined))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <p className="label text-dim">Verify</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        Check a signed passport yourself
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim text-pretty">
        Paste a signed passport and the signer&apos;s public key. This page checks the signature
        and the contents on your own device — nothing you paste is sent anywhere, and you do not
        need a wallet.
      </p>

      <Panel className="mt-8">
        <PanelHeader title="Signed passport" />
        <div className="space-y-5 p-4 sm:p-5">
          <label className="block">
            <span className="label text-dim">Signed envelope (JSON)</span>
            <textarea
              className={`${fieldClass} mt-1.5 h-40`}
              spellCheck={false}
              value={envelope}
              onChange={(event) => setEnvelope(event.target.value)}
              placeholder='{"payloadType":"application/vnd.in-toto+json", …}'
            />
          </label>

          <label className="block">
            <span className="label text-dim">Signer&apos;s public key (PEM)</span>
            <textarea
              className={`${fieldClass} mt-1.5 h-28`}
              spellCheck={false}
              value={publicKey}
              onChange={(event) => setPublicKey(event.target.value)}
              placeholder="-----BEGIN PUBLIC KEY-----"
            />
          </label>

          <label className="block">
            <span className="label text-dim">Published hash to compare against (optional)</span>
            <input
              className={`${fieldClass} mt-1.5`}
              spellCheck={false}
              value={anchor}
              onChange={(event) => setAnchor(event.target.value)}
              placeholder="0x… the hash recorded on 0G Chain"
            />
          </label>

          <button type="button" className="btn" disabled={!ready || busy} onClick={run}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
        </div>
      </Panel>

      {result ? (
        <div className="mt-6" role="status" aria-live="polite">
          {result.ok ? (
            <Note tone="ok">
              <p className="font-medium">The signature is valid.</p>
              <p className="mt-1">
                The holder of this key signed exactly this passport
                {anchor.trim() ? ', and it matches the hash you gave.' : '.'}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <span className="label">Hash</span>
                <Hash value={result.keccak256} />
              </p>
              {!anchor.trim() ? (
                <p className="mt-2 text-dim">
                  Add the hash published on chain above to confirm it is the same passport.
                </p>
              ) : null}
            </Note>
          ) : (
            <Note tone="warn">
              <p className="font-medium">This did not verify.</p>
              <p className="mt-1">{result.reason}</p>
            </Note>
          )}
        </div>
      ) : null}

      <div className="mt-6">
        <Note>
          A valid signature shows who signed this passport and that it has not been changed. It
          does not show that the training itself was honest — Crucible proves where a model came
          from, not how it was trained.
        </Note>
      </div>
    </div>
  )
}
