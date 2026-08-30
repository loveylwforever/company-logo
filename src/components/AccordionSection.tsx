import type { ReactNode } from 'react'

type Props = {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function AccordionSection({ title, open, onToggle, children }: Props) {
  return (
    <div className={`section accordion${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="section-title-btn"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="section-title-text">{title}</span>
        <span className={`section-chevron${open ? ' is-open' : ''}`} aria-hidden>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path
              d="M4.5 6.25 8 9.75l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? <div className="section-body">{children}</div> : null}
    </div>
  )
}
