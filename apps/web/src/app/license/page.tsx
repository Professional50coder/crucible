'use client'

/**
 * Usage licensing for a passport.
 *
 * Owning a passport and being allowed to run the model are different rights, and
 * the contract keeps them apart: `authorizeUsage` grants execution without moving
 * ownership. Anyone can read who holds rights (no wallet needed); only the owner
 * can grant or revoke. Reads and writes target the live Galileo deployment.
 */

import { useState } from 'react'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'

import { Hash } from '@/components/Hash'
import { Badge, EmptyState, Note, Panel, PanelHeader } from '@/components/ui'
import { NETWORKS, addressUrl, txUrl } from '@/lib/chains'
import {
  PERMISSION_FLAGS,
  decodePermissions,
  describePermissions,
  encodePermissions,
  explainLicenseError,
  parseExecutor,
  parseTokenId,
  type Permissions,
} from '@/lib/license'
import { PASSPORT_ABI } from '@/lib/passport-abi'
import { passportAddress } from '@/lib/passport-contract'

const NETWORK = 'testnet' as const
const CHAIN_ID = NETWORKS[NETWORK].chainId
const CONTRACT = passportAddress(NETWORK) as `0x${string}`

const inputClass =
  'w-full rounded-md border border-line bg-sub px-3 py-2 font-mono text-xs text-fg outline-none focus:border-phosphor'

export default function LicensePage() {
  const { address: connected } = useAccount()
  const [tokenInput, setTokenInput] = useState('2')
  const [loadedId, setLoadedId] = useState<bigint | null>(null)
  const [tokenError, setTokenError] = useState('')

  const load = () => {
    const parsed = parseTokenId(tokenInput)
    if (!parsed.ok) {
      setTokenError(parsed.error)
      return
    }
    setTokenError('')
    setLoadedId(parsed.value)
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <p className="label text-dim">Licensing</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        Who may run this model
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim text-pretty">
        Owning a passport and being allowed to run the model are separate. The owner can grant
        another address the right to run it without transferring the passport, and take that
        right back at any time. Anyone can check who holds rights.
      </p>

      <Panel className="mt-8">
        <PanelHeader title="Passport" aside={<Badge tone="neutral">Galileo testnet</Badge>} />
        <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
          <label className="min-w-[8rem] flex-1">
            <span className="label text-dim">Token id</span>
            <input
              className={`${inputClass} mt-1.5`}
              inputMode="numeric"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && load()}
            />
          </label>
          <button type="button" onClick={load} className="btn">
            Load rights
          </button>
        </div>
        {tokenError ? <p className="px-5 pb-4 text-xs text-danger">{tokenError}</p> : null}
      </Panel>

      {loadedId === null ? (
        <div className="mt-6">
          <EmptyState
            title="Pick a passport"
            body="Enter a token id to see who holds usage rights on it."
          />
        </div>
      ) : (
        <Rights tokenId={loadedId} connected={connected} />
      )}
    </div>
  )
}

function Rights({ tokenId, connected }: { tokenId: bigint; connected?: `0x${string}` }) {
  const base = { address: CONTRACT, abi: PASSPORT_ABI, chainId: CHAIN_ID } as const

  const owner = useReadContract({ ...base, functionName: 'ownerOf', args: [tokenId] })
  const executors = useReadContract({
    ...base,
    functionName: 'authorizedExecutors',
    args: [tokenId],
  })

  const list = (executors.data as readonly `0x${string}`[] | undefined) ?? []
  const perms = useReadContracts({
    contracts: list.map((executor) => ({
      ...base,
      functionName: 'permissionsOf' as const,
      args: [tokenId, executor] as const,
    })),
    query: { enabled: list.length > 0 },
  })

  if (owner.isLoading || executors.isLoading) {
    return <p className="mt-6 text-sm text-dim">Reading the chain…</p>
  }
  if (owner.error) {
    return (
      <div className="mt-6">
        <Note tone="warn">No passport with token id {tokenId.toString()} on this network.</Note>
      </div>
    )
  }

  const ownerAddress = owner.data as `0x${string}`
  const isOwner = !!connected && connected.toLowerCase() === ownerAddress.toLowerCase()
  const refresh = () => {
    void executors.refetch()
    void perms.refetch()
  }

  return (
    <>
      <Panel className="mt-6">
        <PanelHeader
          title={`Passport #${tokenId.toString()}`}
          aside={<Badge tone={isOwner ? 'ok' : 'neutral'}>{isOwner ? 'You own this' : 'Read only'}</Badge>}
        />
        <div className="space-y-3 p-4 text-sm sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label text-dim">Owner</span>
            <a href={addressUrl(NETWORK, ownerAddress)} className="font-mono text-xs" target="_blank" rel="noreferrer">
              <Hash value={ownerAddress} />
            </a>
          </div>
          <p className="text-dim">
            {list.length === 0
              ? 'No one holds usage rights yet.'
              : `${list.length} of 100 possible executors hold rights.`}
          </p>
        </div>
        {list.length > 0 ? (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((executor, index) => {
              const raw = perms.data?.[index]?.result as `0x${string}` | undefined
              return (
                <li key={executor} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <Hash value={executor} />
                    <p className="mt-1 text-xs text-dim">
                      {raw ? describePermissions(decodePermissions(raw)) : 'Reading permissions…'}
                    </p>
                  </div>
                  {isOwner ? (
                    <RevokeButton tokenId={tokenId} executor={executor} onDone={refresh} />
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </Panel>

      <CheckRights tokenId={tokenId} />

      {isOwner ? (
        <GrantForm tokenId={tokenId} onDone={refresh} />
      ) : (
        <div className="mt-6">
          <Note>
            Only the owner of this passport can grant or revoke rights.{' '}
            {connected ? 'The connected wallet is not the owner.' : 'Connect the owner wallet to make changes.'}
          </Note>
        </div>
      )}
    </>
  )
}

function CheckRights({ tokenId }: { tokenId: bigint }) {
  const [input, setInput] = useState('')
  const parsed = input.trim() === '' ? null : parseExecutor(input)
  const result = useReadContract({
    address: CONTRACT,
    abi: PASSPORT_ABI,
    chainId: CHAIN_ID,
    functionName: 'isAuthorized',
    args: [tokenId, parsed?.ok ? parsed.value : '0x0000000000000000000000000000000000000001'],
    query: { enabled: parsed?.ok === true },
  })

  return (
    <Panel className="mt-6">
      <PanelHeader title="Check an address" />
      <div className="space-y-3 p-4 sm:p-5">
        <input
          className={inputClass}
          placeholder="0x… executor address"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          aria-label="Executor address to check"
        />
        {parsed && !parsed.ok ? <p className="text-xs text-danger">{parsed.error}</p> : null}
        {parsed?.ok && result.data !== undefined ? (
          <Note tone={result.data ? 'ok' : 'neutral'}>
            {result.data ? 'This address may run the model.' : 'This address holds no usage rights.'}
          </Note>
        ) : null}
      </div>
    </Panel>
  )
}

function useTx(onDone: () => void) {
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId: CHAIN_ID })
  const [done, setDone] = useState<string | null>(null)

  if (receipt.isSuccess && done !== write.data) {
    setDone(write.data ?? null)
    onDone()
  }
  return { write, receipt }
}

function TxStatus({
  hash,
  pending,
  error,
}: {
  hash?: `0x${string}`
  pending: boolean
  error: unknown
}) {
  if (error) return <p className="text-xs text-danger">{explainLicenseError(error)}</p>
  if (!hash) return null
  return (
    <p className="text-xs text-dim">
      {pending ? 'Waiting for confirmation… ' : 'Confirmed. '}
      <a href={txUrl(NETWORK, hash)} target="_blank" rel="noreferrer">
        View transaction
      </a>
    </p>
  )
}

function RevokeButton({
  tokenId,
  executor,
  onDone,
}: {
  tokenId: bigint
  executor: `0x${string}`
  onDone: () => void
}) {
  const { write, receipt } = useTx(onDone)
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn"
        disabled={write.isPending || receipt.isLoading}
        onClick={() =>
          write.writeContract({
            address: CONTRACT,
            abi: PASSPORT_ABI,
            chainId: CHAIN_ID,
            functionName: 'revokeAuthorization',
            args: [tokenId, executor],
          })
        }
      >
        Revoke
      </button>
      <TxStatus hash={write.data} pending={receipt.isLoading} error={write.error} />
    </div>
  )
}

function GrantForm({ tokenId, onDone }: { tokenId: bigint; onDone: () => void }) {
  const [executorInput, setExecutorInput] = useState('')
  const [flags, setFlags] = useState<Permissions>({ inference: true, commercial: false })
  const [formError, setFormError] = useState('')
  const { write, receipt } = useTx(onDone)

  const submit = () => {
    const executor = parseExecutor(executorInput)
    if (!executor.ok) {
      setFormError(executor.error)
      return
    }
    setFormError('')
    write.writeContract({
      address: CONTRACT,
      abi: PASSPORT_ABI,
      chainId: CHAIN_ID,
      functionName: 'authorizeUsage',
      args: [tokenId, executor.value, encodePermissions(flags)],
    })
  }

  return (
    <Panel className="mt-6">
      <PanelHeader title="Grant usage rights" />
      <div className="space-y-4 p-4 sm:p-5">
        <input
          className={inputClass}
          placeholder="0x… executor address"
          value={executorInput}
          onChange={(event) => setExecutorInput(event.target.value)}
          aria-label="Executor address to grant"
        />
        <fieldset className="space-y-2">
          <legend className="label text-dim">Rights</legend>
          {PERMISSION_FLAGS.map(({ key, label, hint }) => (
            <label key={key} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={flags[key] === true}
                onChange={(event) => setFlags({ ...flags, [key]: event.target.checked })}
              />
              <span>
                <span className="text-fg">{label}</span>
                <span className="block text-xs text-dim">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {formError ? <p className="text-xs text-danger">{formError}</p> : null}
        <button
          type="button"
          className="btn"
          onClick={submit}
          disabled={write.isPending || receipt.isLoading}
        >
          Grant rights
        </button>
        <TxStatus hash={write.data} pending={receipt.isLoading} error={write.error} />
      </div>
    </Panel>
  )
}
