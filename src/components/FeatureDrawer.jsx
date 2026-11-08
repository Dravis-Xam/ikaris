import { ChevronLeftIcon, ChevronRightIcon, MoonIcon, SunIcon } from './icons.jsx'

export function FeatureTab({ buttonRef, onOpen, isOpen }) {
  return <button ref={buttonRef} className="feature-tab" onClick={onOpen} aria-label="Open feature settings" aria-expanded={isOpen} aria-controls="feature-drawer" title="Feature settings"><ChevronLeftIcon /></button>
}

export default function FeatureDrawer({ open, onClose, scrollRevealsEnabled, onScrollRevealsChange, theme, setTheme }) {
  if (!open) return null
  return <div className="feature-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="feature-drawer" id="feature-drawer" role="dialog" aria-modal="true" aria-labelledby="feature-drawer-title">
      <div className="feature-drawer-heading"><div><p className="eyebrow"><span /> PERSONALIZE</p><h2 id="feature-drawer-title">Your view</h2></div><button className="icon-button" onClick={onClose} aria-label="Close feature settings"><ChevronRightIcon /></button></div>
      <div className="feature-settings">
        <label className="feature-toggle-row"><span>Scroll reveals</span><span className="feature-switch"><input type="checkbox" checked={scrollRevealsEnabled} onChange={(event) => onScrollRevealsChange(event.target.checked)} /><i /></span></label>
        <div className="feature-theme-row"><span>Theme</span><button className="feature-theme-button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <MoonIcon /> : <SunIcon />}<span>{theme === 'light' ? 'Dark' : 'Light'}</span></button></div>
      </div>
    </aside>
  </div>
}
