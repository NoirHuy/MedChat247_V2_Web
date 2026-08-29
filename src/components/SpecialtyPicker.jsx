import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, CheckIcon } from './Icons'
import './SpecialtyPicker.css'

export default function SpecialtyPicker({
  specialties,
  value,
  onChange,
  direction = 'down',
  align = 'start',
  variant = 'plain',
  lang = 'vi',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = specialties.find((s) => s.id === value) ?? specialties[0]

  const currentName = typeof current.name === 'object' ? (current.name[lang] || current.name.vi) : current.name

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`specialty-picker specialty-picker--${variant}`} ref={ref}>
      <button
        className="specialty-picker__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{currentName}</span>
        <ChevronDownIcon className="specialty-picker__chevron" />
      </button>

      {open && (
        <div
          className={`specialty-picker__menu specialty-picker__menu--${direction} specialty-picker__menu--${align}`}
          role="listbox"
        >
          {specialties.map((s) => {
            const name = typeof s.name === 'object' ? (s.name[lang] || s.name.vi) : s.name
            const tagline = typeof s.tagline === 'object' ? (s.tagline[lang] || s.tagline.vi) : s.tagline
            return (
              <button
                key={s.id}
                className="specialty-picker__item"
                role="option"
                aria-selected={s.id === value}
                onClick={() => {
                  onChange(s.id)
                  setOpen(false)
                }}
              >
                <span className="specialty-picker__item-text">
                  <span className="specialty-picker__item-name">{name}</span>
                  {tagline && (
                    <span className="specialty-picker__item-tagline">{tagline}</span>
                  )}
                </span>
                {s.id === value && <CheckIcon className="specialty-picker__check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
