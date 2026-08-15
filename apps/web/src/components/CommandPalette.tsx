'use client'

/**
 * Ctrl/Cmd+K — the whole app addressable from the keyboard.
 *
 * This is not a novelty. Crucible's objects are hashes and ids, and the fastest
 * path to a passport is typing part of its name, not scrolling a wall of cards.
 * The palette loads its index lazily on first open so the landing page pays
 * nothing for it.
 */

import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { listJobs, listPassports } from '@/lib/api'
import type { Job, PassportSummary } from '@/lib/types'
import {
  AdapterIcon,
  ArrowIcon,
  CloseIcon,
  SearchIcon,
  ShieldIcon,
  TerminalIcon,
  UploadIcon,
} from './icons'
import { Dot } from './ui'

type Item = {
  id: string
  group: 'Go to' | 'Passports' | 'Runs'
  label: string
  detail?: string
  href: string
  icon: 'shield' | 'adapter' | 'terminal' | 'upload' | 'arrow'
  tone?: 'accent' | 'ok' | 'warn' | 'danger' | 'neutral'
}

const ROUTES: Item[] = [
  { id: 'r-gallery', group: 'Go to', label: 'Passport gallery', detail: '/gallery', href: '/gallery', icon: 'shield' },
  { id: 'r-jobs', group: 'Go to', label: 'Runs', detail: '/jobs', href: '/jobs', icon: 'terminal' },
  { id: 'r-new', group: 'Go to', label: 'New run', detail: '/new', href: '/new', icon: 'upload' },
  { id: 'r-home', group: 'Go to', label: 'What Crucible is', detail: '/', href: '/', icon: 'arrow' },
]

const ICONS = {
  shield: ShieldIcon,
  adapter: AdapterIcon,
  terminal: TerminalIcon,
  upload: UploadIcon,
  arrow: ArrowIcon,
}

function score(item: Item, query: string): number {
  if (query === '') return 1
  const q = query.toLowerCase()
  const label = item.label.toLowerCase()
  const detail = (item.detail ?? '').toLowerCase()
  if (label.startsWith(q)) return 3
  if (label.includes(q)) return 2
  if (detail.includes(q)) return 1
  return 0
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [index, setIndex] = useState<Item[] | null>(null)
  const [indexError, setIndexError] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const listId = useId()

  // ---- open / close ------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (!combo) return
      event.preventDefault()
      setOpen((was) => !was)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) {
      restoreTo.current?.focus?.()
      return
    }

    restoreTo.current = document.activeElement as HTMLElement | null
    setQuery('')
    setCursor(0)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0)

    return () => {
      document.body.style.overflow = previousOverflow
      window.clearTimeout(focusTimer)
    }
  }, [open])

  // ---- lazy index --------------------------------------------------------
  useEffect(() => {
    if (!open || index !== null) return

    let cancelled = false
    Promise.all([listPassports(), listJobs()])
      .then(([passports, jobs]: [PassportSummary[], Job[]]) => {
        if (cancelled) return
        setIndex([
          ...passports.map(
            (p): Item => ({
              id: `p-${p.id}`,
              group: 'Passports',
              label: p.name,
              detail: `${p.id} · ${p.model}`,
              href: `/passport/${p.id}`,
              icon: 'shield',
              tone: p.mintStatus === 'minted' ? 'ok' : 'warn',
            }),
          ),
          ...jobs.map(
            (j): Item => ({
              id: `j-${j.id}`,
              group: 'Runs',
              label: j.name ?? j.id,
              detail: `${j.id} · ${j.state}`,
              href: `/jobs/${j.id}`,
              icon: 'adapter',
              tone: j.state === 'Failed' ? 'danger' : j.state === 'Finished' ? 'ok' : 'accent',
            }),
          ),
        ])
      })
      .catch(() => {
        if (!cancelled) setIndexError(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, index])

  const results = useMemo(() => {
    const all = [...ROUTES, ...(index ?? [])]
    return all
      .map((item) => ({ item, s: score(item, query.trim()) }))
      .filter((entry) => entry.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((entry) => entry.item)
  }, [index, query])

  useEffect(() => setCursor(0), [query])

  const go = useCallback(
    (item: Item) => {
      setOpen(false)
      router.push(item.href)
    },
    [router],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCursor((c) => (results.length === 0 ? 0 : (c - 1 + results.length) % results.length))
        return
      }
      if (event.key === 'Enter') {
        const item = results[cursor]
        if (item) {
          event.preventDefault()
          go(item)
        }
      }
    },
    [results, cursor, go],
  )

  useEffect(() => {
    if (!open || !listRef.current) return
    const active = listRef.current.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  // The header carries `backdrop-filter`, which makes it a containing block for
  // fixed-position descendants. The overlay is portalled to <body> so it covers
  // the viewport rather than the header.
  const overlay = (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh] sm:pt-[16vh]">
          <div
            className="absolute inset-0 bg-ink/80 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="animate-popin relative w-full max-w-xl overflow-hidden rounded-lg border border-line-bright bg-panel shadow-2xl shadow-black/60"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <SearchIcon className="h-4 w-4 shrink-0 text-faint" />
              <label htmlFor={`${listId}-input`} className="sr-only">
                Search passports, runs and pages
              </label>
              <input
                id={`${listId}-input`}
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Jump to a passport, a run, or a page…"
                className="min-w-0 flex-1 bg-transparent font-mono text-sm text-fg placeholder:text-faint focus:outline-none"
                autoComplete="off"
                spellCheck={false}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-sm p-1 text-faint transition-colors hover:text-fg"
                aria-label="Close command palette"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label="Results"
              className="max-h-[min(24rem,50vh)] overflow-y-auto py-2"
            >
              {results.length === 0 ? (
                <li className="px-4 py-8 text-center">
                  <p className="font-mono text-xs text-dim">
                    {index === null && !indexError ? 'Building the index…' : 'Nothing matches'}
                  </p>
                  <p className="mt-1.5 text-xs text-faint">
                    {indexError
                      ? 'The passport index could not be read. Pages are still reachable above.'
                      : 'Try a model name, a run name, or an id like p-4c1f9a.'}
                  </p>
                </li>
              ) : (
                results.map((item, i) => {
                  const Icon = ICONS[item.icon]
                  const active = i === cursor
                  const first = i === 0 || results[i - 1]!.group !== item.group

                  return (
                    <li key={item.id}>
                      {first ? (
                        <p className={`label px-4 pb-1.5 ${i === 0 ? 'pt-1' : 'pt-4'}`}>
                          {item.group}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-active={active}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => go(item)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                          active ? 'bg-raised' : ''
                        }`}
                      >
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-phosphor' : 'text-faint'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[13px] text-fg">
                            {item.label}
                          </span>
                          {item.detail ? (
                            <span className="block truncate font-mono text-2xs text-faint">
                              {item.detail}
                            </span>
                          ) : null}
                        </span>
                        {item.tone && item.tone !== 'neutral' ? (
                          <Dot tone={item.tone} />
                        ) : null}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 font-mono text-2xs text-faint">
              <span className="inline-flex items-center gap-1.5">
                <kbd className="kbd">↑</kbd>
                <kbd className="kbd">↓</kbd> move
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="kbd">↵</kbd> open
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="kbd">esc</kbd> close
              </span>
            </div>
      </div>
    </div>
  )

  return (
    <>
      <PaletteTrigger onOpen={() => setOpen(true)} />
      {open && typeof document !== 'undefined' ? createPortal(overlay, document.body) : null}
    </>
  )
}

/** The affordance. A palette nobody knows about is a palette nobody uses. */
function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  const [mac, setMac] = useState(false)
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hidden h-8 items-center gap-2 rounded-md border border-line bg-sub px-2.5 text-faint transition-colors hover:border-line-bright hover:text-dim md:inline-flex"
      aria-label="Open command palette"
    >
      <SearchIcon className="h-3.5 w-3.5" />
      <span className="font-mono text-2xs">Search</span>
      <span className="kbd ml-1">{mac ? '⌘K' : 'Ctrl K'}</span>
    </button>
  )
}
