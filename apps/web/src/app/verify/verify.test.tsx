import { createHash, createPublicKey, generateKeyPairSync, sign, webcrypto } from 'node:crypto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { canonicalize, manifestHash } from '@/lib/manifest'
import {
  DSSE_PAYLOAD_TYPE,
  PREDICATE_TYPE,
  STATEMENT_TYPE,
  pae,
} from '@/lib/envelope-verify'
import VerifyPage from './page'

beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto)
})

const manifest = {
  version: 1,
  network: 'testnet',
  chainId: 16602,
  taskId: 'task-1',
  baseModelHash: '0x' + 'ab'.repeat(32),
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const keyid = createHash('sha256')
  .update(createPublicKey(publicPem).export({ type: 'spki', format: 'der' }))
  .digest('hex')

function envelope(): string {
  const statement = {
    _type: STATEMENT_TYPE,
    subject: [{ name: 'p', digest: { sha256: createHash('sha256').update(canonicalize(manifest)).digest('hex') } }],
    predicateType: PREDICATE_TYPE,
    predicate: { manifestKeccak256: manifestHash(manifest as never), manifest },
  }
  const payload = Buffer.from(JSON.stringify(statement))
  const sig = sign(null, Buffer.from(pae(DSSE_PAYLOAD_TYPE, payload)), privateKey)
  return JSON.stringify({
    payloadType: DSSE_PAYLOAD_TYPE,
    payload: payload.toString('base64'),
    signatures: [{ keyid, sig: sig.toString('base64') }],
  })
}

const fill = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('/verify', () => {
  it('keeps the button disabled until an envelope and a key are entered', () => {
    render(<VerifyPage />)
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
    fill(/Signed envelope/i, '{}')
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
    fill(/public key/i, publicPem)
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled()
  })

  it('tells a reader plainly when a signed passport is valid', async () => {
    render(<VerifyPage />)
    fill(/Signed envelope/i, envelope())
    fill(/public key/i, publicPem)
    fill(/Published hash/i, manifestHash(manifest as never))
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('The signature is valid.'))
    expect(screen.getByRole('status')).toHaveTextContent('matches the hash you gave')
  })

  it('explains a failure without internals', async () => {
    render(<VerifyPage />)
    fill(/Signed envelope/i, envelope())
    fill(/public key/i, publicPem)
    fill(/Published hash/i, '0x' + '11'.repeat(32))
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('This did not verify.'))
    expect(screen.getByRole('status')).toHaveTextContent('does not match the hash anchored on chain')
  })

  it('states what a valid signature does not prove', () => {
    render(<VerifyPage />)
    expect(screen.getByText(/does not show that the training itself was honest/i)).toBeInTheDocument()
  })
})
