// Vertical bars comparing "the area" with "my store" for each label (days, hours, ...).
// Values are percentages of that group's total, so bars are comparable even when the
// area has many more orders than one store.
export default function BarPairs({ items, showMine = true, labelEvery = 1, height = 140, formatLabel = (x) => x.label }) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.area || 0, i.mine || 0)));
  return (
    <div className="bar-pairs" style={{ '--bar-h': `${height}px` }}>
      {items.map((it, idx) => (
        <div key={idx} className="bar-col" title={`${formatLabel(it)} — area ${it.area}%${showMine && it.mine != null ? `, you ${it.mine}%` : ''}`}>
          <div className="bar-stack">
            <span className="bar area" style={{ height: `${((it.area || 0) / max) * 100}%` }} />
            {showMine && <span className="bar mine" style={{ height: `${((it.mine || 0) / max) * 100}%` }} />}
          </div>
          <span className="bar-label">{idx % labelEvery === 0 ? formatLabel(it) : ''}</span>
        </div>
      ))}
    </div>
  );
}
