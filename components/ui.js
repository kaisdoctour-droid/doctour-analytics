'use client';
import { useState } from 'react';

export function KpiCard({ icon, label, value, subtext, color = 'blue', trend, onClick, small }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600', green: 'from-emerald-500 to-emerald-600',
    yellow: 'from-amber-500 to-amber-600', red: 'from-red-500 to-red-600',
    purple: 'from-purple-500 to-purple-600', cyan: 'from-cyan-500 to-cyan-600',
    pink: 'from-pink-500 to-pink-600', orange: 'from-orange-500 to-orange-600'
  };
  return (
    <div onClick={onClick} className={`bg-slate-800/60 backdrop-blur-sm rounded-2xl ${small ? 'p-3' : 'p-4'} border border-slate-700/50 hover:border-slate-600 transition-all ${onClick ? 'cursor-pointer hover:-translate-y-1' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={small ? 'text-lg' : 'text-xl'}>{icon}</span>
        {trend !== undefined && trend !== null && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-emerald-500/20 text-emerald-400' : trend < 0 ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}`}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '='} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`${small ? 'text-xl' : 'text-2xl'} font-bold font-mono bg-gradient-to-r ${colors[color]} bg-clip-text text-transparent`}>{value}</p>
      {subtext && <p className="text-slate-500 text-xs mt-1">{subtext}</p>}
    </div>
  );
}

export function Badge({ children, color = 'blue', size = 'sm' }) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400', green: 'bg-emerald-500/20 text-emerald-400',
    yellow: 'bg-amber-500/20 text-amber-400', red: 'bg-red-500/20 text-red-400',
    purple: 'bg-purple-500/20 text-purple-400', cyan: 'bg-cyan-500/20 text-cyan-400',
    orange: 'bg-orange-500/20 text-orange-400', pink: 'bg-pink-500/20 text-pink-400'
  };
  const sizes = { xs: 'text-xs px-1.5 py-0.5', sm: 'text-sm px-2 py-0.5', md: 'text-base px-3 py-1' };
  return <span className={`${colors[color]} ${sizes[size]} rounded-full font-medium`}>{children}</span>;
}

export function Button({ children, onClick, variant = 'primary', disabled = false, size = 'md', className = '' }) {
  const variants = {
    primary: 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    success: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white',
    danger: 'bg-gradient-to-r from-red-500 to-orange-600 text-white',
    ghost: 'bg-transparent hover:bg-slate-700/50 text-slate-300'
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2', lg: 'px-6 py-3 text-lg' };
  return (
    <button onClick={onClick} disabled={disabled} className={`${variants[variant]} ${sizes[size]} rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, title, icon, className = '', actions }) {
  return (
    <div className={`bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            {icon && <span>{icon}</span>}
            <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded" />
            {title}
          </h3>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function TabNav({ tabs, activeTab, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 bg-slate-800/30 p-1.5 rounded-xl overflow-x-auto">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
          activeTab === tab.id ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
        }`}>
          <span>{tab.icon}</span>
          <span className="hidden sm:inline">{tab.label}</span>
          {tab.badge > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-red-500/20 text-red-400'}`}>{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function DateRangePicker({ presets, selectedPreset, onPresetChange, startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={selectedPreset} onChange={(e) => onPresetChange(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {selectedPreset === 'custom' && (
        <>
          <input type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
          <span className="text-slate-500">→</span>
          <input type="date" value={endDate} onChange={(e) => onEndChange(e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
        </>
      )}
    </div>
  );
}

export function CommercialSelect({ commercials, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between min-w-[180px]">
        <span>{selected.length === 0 ? 'Tous les commerciaux' : `${selected.length} sélectionné(s)`}</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 right-0 w-72 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-80 overflow-y-auto">
            <button onClick={() => { onChange([]); setOpen(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 border-b border-slate-700 sticky top-0 bg-slate-800">✓ Tous</button>
            {commercials.map(c => (
              <button key={c.id} onClick={() => toggle(c.id)} className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-700 flex items-center gap-2 ${selected.includes(c.id) ? 'bg-blue-500/20' : ''}`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${selected.includes(c.id) ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-500'}`}>
                  {selected.includes(c.id) && '✓'}
                </span>
                <span className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold">{c.initials}</span>
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AlertItem({ icon, title, badge, badgeColor = 'red', subtitle, onClick }) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/30 ${onClick ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div>
          <span className="text-sm">{title}</span>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <Badge color={badgeColor}>{badge}</Badge>
    </div>
  );
}

export function RankingRow({ rank, name, initials, value, subValue, highlight, badge }) {
  const rankColors = { 1: 'from-amber-400 to-yellow-500', 2: 'from-slate-300 to-slate-400', 3: 'from-amber-600 to-orange-700' };
  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/30 ${highlight ? 'bg-emerald-500/10 border border-emerald-500/30' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${rank <= 3 ? `bg-gradient-to-br ${rankColors[rank]} text-slate-900` : 'bg-slate-700 text-slate-400'}`}>{rank}</div>
      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-xs font-bold">{initials}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate flex items-center gap-2">{name} {badge}</div>
        {subValue && <div className="text-xs text-slate-400">{subValue}</div>}
      </div>
      <div className="text-right font-mono text-cyan-400 text-sm">{value}</div>
    </div>
  );
}

export function VerdictBadge({ rate, target = 15 }) {
  if (rate >= target) return <span className="text-emerald-400">🟢 Bon</span>;
  if (rate >= target * 0.7) return <span className="text-amber-400">🟡 Moyen</span>;
  return <span className="text-red-400">🔴 Faible</span>;
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`${sizes[size]} w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function DelayBadge({ days, threshold = 3 }) {
  if (days === null || days === undefined) return <span className="text-slate-500">-</span>;
  const color = days <= threshold ? 'green' : days <= threshold * 2 ? 'yellow' : 'red';
  return <Badge color={color} size="xs">{Math.round(days)}j</Badge>;
}
