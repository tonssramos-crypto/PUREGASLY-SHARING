// A store's trust score from other stores' ratings: "★ 4.7 · 12" or "New".
export default function TrustBadge({ trust }) {
  if (!trust || !trust.count) return <span className="trust-badge new" title="No ratings from other stores yet">New</span>;
  return (
    <span className="trust-badge" title={`${trust.count} rating${trust.count === 1 ? '' : 's'} from other stores`}>
      ★ {trust.avg.toFixed(1)} <span className="muted">· {trust.count}</span>
    </span>
  );
}
