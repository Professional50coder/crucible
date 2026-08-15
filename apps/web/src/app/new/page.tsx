'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { DatasetInput } from '@/components/DatasetInput'
import { Hash } from '@/components/Hash'
import {
  AlertIcon,
  ArrowIcon,
  DatasetIcon,
  EnclaveIcon,
  ModelIcon,
  SlidersIcon,
} from '@/components/icons'
import {
  Badge,
  Dot,
  ErrorState,
  NetworkBadge,
  Note,
  Panel,
  PanelHeader,
  Skeleton,
} from '@/components/ui'
import { MOCK_MODE, createJob, listProviders } from '@/lib/api'
import { NETWORKS, addressUrl } from '@/lib/chains'
import type { DatasetAnalysis } from '@/lib/dataset'
import { estimateFee } from '@/lib/fee'
import { formatCount, formatOg } from '@/lib/format'
import { DEFAULT_CONFIG, PARAMETER_SPECS, validateTrainingConfig } from '@/lib/training-config'
import type { Network, ProviderInfo, TrainingConfig } from '@/lib/types'

export default function NewRunPage() {
  const router = useRouter()

  const [network, setNetwork] = useState<Network>('mainnet')
  const [model, setModel] = useState('Qwen2.5-0.5B-Instruct')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_CONFIG)
  const [dataset, setDataset] = useState<{ filename: string; analysis: DatasetAnalysis } | null>(
    null,
  )

  const [providers, setProviders] = useState<ProviderInfo[] | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)

  const loadProviders = useCallback(() => {
    setProviderError(null)
    listProviders()
      .then(setProviders)
      .catch((cause: unknown) =>
        setProviderError(cause instanceof Error ? cause.message : 'Unknown error'),
      )
  }, [])

  useEffect(loadProviders, [loadProviders])

  const provider = useMemo(
    () => providers?.find((p) => p.network === network) ?? null,
    [providers, network],
  )

  const availableModels = NETWORKS[network].models

  // Switching to a network that does not host the selected model must not leave
  // an impossible combination selected.
  useEffect(() => {
    if (!availableModels.includes(model)) setModel(availableModels[0]!)
  }, [availableModels, model])

  const configIssues = useMemo(
    () => validateTrainingConfig(config as unknown as Record<string, unknown>),
    [config],
  )

  const fee = useMemo(() => {
    if (!dataset?.analysis.valid || !provider) return null
    try {
      return estimateFee({
        tokenCount: dataset.analysis.tokenCount,
        epochs: config.num_train_epochs,
        pricePerTokenNeuron: BigInt(provider.pricePerTokenNeuron),
        model,
      })
    } catch {
      return null
    }
  }, [dataset, provider, config.num_train_epochs, model])

  const ready =
    dataset !== null && dataset.analysis.valid && configIssues.length === 0 && provider !== null

  const launch = useCallback(async () => {
    if (!ready || !dataset || !provider) return

    setLaunching(true)
    setLaunchError(null)

    try {
      const job = await createJob({
        network,
        provider: provider.address,
        model,
        config,
        name: name.trim() || undefined,
        dataset: {
          filename: dataset.filename,
          format: dataset.analysis.format ?? 'chat',
          exampleCount: dataset.analysis.exampleCount,
          tokenCount: dataset.analysis.tokenCount,
        },
      })
      router.push(`/jobs/${job.id}`)
    } catch (cause) {
      setLaunchError(cause instanceof Error ? cause.message : 'Could not create the task')
      setLaunching(false)
    }
  }, [ready, dataset, provider, network, model, config, name, router])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="border-b border-line pb-8">
        <p className="label">Launch</p>
        <h1 className="mt-3 text-title font-medium text-fg">New run</h1>
        <p className="measure mt-4 text-sm leading-relaxed text-dim text-pretty">
          Four fields instead of twelve CLI steps. Crucible validates the dataset before anything
          is uploaded, funds the fine-tuning sub-account rather than the inference one, and takes
          over the acknowledgement deadline the moment the task is delivered.
        </p>
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {/* 01 Dataset ------------------------------------------------ */}
          <Panel>
            <PanelHeader
              title="01 · Dataset"
              icon={<DatasetIcon className="h-3.5 w-3.5" />}
              aside={
                <span className="font-mono text-2xs text-faint">
                  chat-messages · instruction · text-completion
                </span>
              }
            />
            <div className="px-4 py-5 sm:px-5">
              <DatasetInput onChange={setDataset} />
            </div>
          </Panel>

          {/* 02 Target ------------------------------------------------- */}
          <Panel>
            <PanelHeader title="02 · Target" icon={<ModelIcon className="h-3.5 w-3.5" />} />
            <div className="space-y-6 px-4 py-5 sm:px-5">
              <div>
                <span className="label">Network</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(['mainnet', 'testnet'] as Network[]).map((option) => {
                    const active = option === network
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setNetwork(option)}
                        aria-pressed={active}
                        className={`flex-1 rounded-md border px-4 py-3 text-left transition-colors ${
                          active
                            ? 'border-phosphor/50 bg-phosphor/[0.06]'
                            : 'border-line hover:border-line-bright'
                        }`}
                      >
                        <span className="font-mono text-sm text-fg">
                          {option === 'mainnet' ? '0G mainnet' : '0G Galileo'}
                        </span>
                        <span className="mt-0.5 block font-mono text-2xs text-faint">
                          chain {NETWORKS[option].chainId} ·{' '}
                          {option === 'mainnet' ? '0.5' : '0.8'} 0G / M tokens
                        </span>
                      </button>
                    )
                  })}
                </div>
                {network === 'mainnet' ? (
                  <p className="mt-2 text-xs leading-relaxed text-faint text-pretty">
                    Mainnet is 37.5% cheaper per token than testnet, despite 0G’s example repo
                    stating that fine-tuning is unavailable there. It is available.
                  </p>
                ) : null}
              </div>

              <div>
                <span className="label">Base model</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableModels.map((option) => {
                    const active = option === model
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setModel(option)}
                        aria-pressed={active}
                        className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
                          active
                            ? 'border-phosphor/50 bg-phosphor/[0.06] text-phosphor'
                            : 'border-line text-dim hover:border-line-bright hover:text-fg'
                        }`}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
                {network === 'testnet' ? (
                  <p className="mt-2 text-xs text-faint">
                    Qwen3-32B is mainnet-only.
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="run-name" className="label">
                  Run name <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="run-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="support-tone-v4"
                  className="field mt-2"
                  maxLength={64}
                />
              </div>
            </div>
          </Panel>

          {/* 03 Training ----------------------------------------------- */}
          <Panel>
            <PanelHeader
              title="03 · Training configuration"
              icon={<SlidersIcon className="h-3.5 w-3.5" />}
              aside={
                <button
                  type="button"
                  onClick={() => setConfig(DEFAULT_CONFIG)}
                  className="font-mono text-2xs text-faint transition-colors hover:text-fg"
                >
                  reset to 0G defaults
                </button>
              }
            />
            <div className="px-4 py-5 sm:px-5">
              <p className="mb-5 max-w-2xl text-xs leading-relaxed text-dim text-pretty">
                0G accepts exactly these five parameters and rejects a config with any extra or
                missing key — after the task is funded. These are the values from 0G’s own working
                example, not the docs’ template, which differs.
              </p>

              <div className="space-y-4">
                {PARAMETER_SPECS.map((spec) => (
                  <ParameterField
                    key={spec.key}
                    spec={spec}
                    value={config[spec.key]}
                    error={configIssues.find((issue) => issue.key === spec.key)?.message}
                    onChange={(value) => setConfig((prev) => ({ ...prev, [spec.key]: value }))}
                  />
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* Sidebar: estimate + launch ---------------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel>
            <PanelHeader title="Estimated cost" />
            <div className="px-4 py-5 sm:px-5">
              {providerError ? (
                <ErrorState
                  title="No provider"
                  body={providerError}
                  onRetry={loadProviders}
                />
              ) : !providers ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !provider ? (
                <p className="text-xs leading-relaxed text-dim">
                  No fine-tuning provider is registered on {NETWORKS[network].label} right now.
                </p>
              ) : !dataset ? (
                <p className="text-xs leading-relaxed text-faint text-pretty">
                  Add a dataset and the fee appears here — before anything is uploaded and before
                  any funds move. The CLI gives you no warning until after the task exists.
                </p>
              ) : !dataset.analysis.valid ? (
                <p className="text-xs leading-relaxed text-warn/90 text-pretty">
                  Fix the dataset errors and the estimate will appear.
                </p>
              ) : fee ? (
                <>
                  <dl className="space-y-3">
                    <Line
                      label="Training"
                      value={`${formatOg(fee.trainingNeuron)} 0G`}
                      hint={`${formatCount(dataset.analysis.tokenCount)} tokens × ${
                        config.num_train_epochs
                      } epoch${config.num_train_epochs === 1 ? '' : 's'}`}
                    />
                    <Line
                      label="Storage reserve"
                      value={`${formatOg(fee.storageReserveNeuron)} 0G`}
                      hint={`fixed, for the ${model === 'Qwen3-32B' ? '~900 MB' : '~100 MB'} adapter`}
                    />
                  </dl>

                  <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-4">
                    <span className="label text-dim">Total</span>
                    <span className="font-mono text-lg text-phosphor">
                      {formatOg(fee.totalNeuron)} 0G
                    </span>
                  </div>

                  <p className="mt-3 text-2xs leading-relaxed text-faint text-pretty">
                    Token count is estimated at ~4 characters per token. 0G’s broker counts them
                    exactly at task creation, so the charged amount may differ slightly.
                  </p>
                </>
              ) : null}
            </div>
          </Panel>

          {provider ? (
            <Panel>
              <PanelHeader
                title="Provider"
                icon={<EnclaveIcon className="h-3.5 w-3.5" />}
                aside={
                  provider.occupied ? (
                    <Badge tone="warn">
                      <Dot tone="warn" pulse />
                      busy
                    </Badge>
                  ) : (
                    <Badge tone="ok">
                      <Dot tone="ok" />
                      available
                    </Badge>
                  )
                }
              />
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div>
                  <div className="label">Address</div>
                  <div className="mt-1">
                    <Hash
                      value={provider.address}
                      href={addressUrl(provider.network, provider.address)}
                      hrefLabel={NETWORKS[provider.network].explorerLabel}
                      title="provider"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                  <div>
                    <div className="label">GPU</div>
                    <div className="mt-1 text-fg">{provider.hardware.gpu}</div>
                  </div>
                  <div>
                    <div className="label">Enclave</div>
                    <div className="mt-1 text-fg">{provider.hardware.tee}</div>
                  </div>
                </div>
                <NetworkBadge network={provider.network} />
              </div>
            </Panel>
          ) : null}

          {/* Launch --------------------------------------------------- */}
          <div className="space-y-3">
            {launchError ? (
              <div className="rounded-md border border-danger/30 bg-danger/[0.05] px-4 py-3" role="alert">
                <div className="flex gap-2">
                  <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                  <p className="text-xs leading-relaxed text-danger text-pretty">{launchError}</p>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void launch()}
              disabled={!ready || launching}
              className="btn-primary w-full"
            >
              {launching ? 'Creating task…' : 'Launch run'}
              {!launching ? <ArrowIcon className="h-3.5 w-3.5" /> : null}
            </button>

            {!ready ? (
              <p className="text-2xs leading-relaxed text-faint text-pretty">
                {!dataset
                  ? 'Add a dataset to continue.'
                  : !dataset.analysis.valid
                    ? 'The dataset has errors that 0G would reject.'
                    : configIssues.length > 0
                      ? 'The training configuration has errors.'
                      : 'Waiting for a provider.'}
              </p>
            ) : null}

            {MOCK_MODE ? (
              <Note>
                No orchestrator is configured, so this launches a simulated run against fixture
                data — no wallet, no funds, no transaction. The state machine, the 48-hour
                countdown and the passport are the real ones.
              </Note>
            ) : (
              <Note>
                Crucible funds the <span className="font-mono">fine-tuning</span> sub-account
                explicitly. 0G’s <span className="font-mono">transfer-fund</span> defaults to the
                inference sub-account, and the resulting failure only surfaces later as{' '}
                <span className="font-mono">MinimumDepositRequired</span>.
              </Note>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <dt className="label">{label}</dt>
        {hint ? <dd className="mt-0.5 text-2xs text-faint">{hint}</dd> : null}
      </div>
      <dd className="shrink-0 font-mono text-xs text-fg">{value}</dd>
    </div>
  )
}

function ParameterField({
  spec,
  value,
  error,
  onChange,
}: {
  spec: (typeof PARAMETER_SPECS)[number]
  value: number
  error?: string
  onChange: (value: number) => void
}) {
  const id = `param-${spec.key}`

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-mono text-xs text-fg">
          {spec.label}
        </label>
        {spec.sentinel && value === spec.sentinel.value ? (
          <span className="font-mono text-2xs text-phosphor">{spec.sentinel.label}</span>
        ) : null}
      </div>

      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ''}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const next = event.target.value === '' ? Number.NaN : Number(event.target.value)
          onChange(next)
        }}
        className={`field mt-1.5 ${error ? 'border-danger/60' : ''}`}
      />

      <p id={`${id}-help`} className="mt-1 text-2xs leading-relaxed text-faint text-pretty">
        {error ? <span className="text-danger">{error}</span> : spec.help}
      </p>
    </div>
  )
}
