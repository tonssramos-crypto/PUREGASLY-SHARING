import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import BarPairs from '../BarPairs';
import { SkeletonRows } from '../Skeleton';
import { errMsg } from '../../utils/format';
import { hourLabel } from '../../utils/networkFormat';
import useAutoRefresh from '../../utils/useAutoRefresh';

const RANGES = [7, 30, 90];

// Horizontal bars: share of the area (and of your store) for each label.
function HBars({ rows, showMine }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.area || 0, r.mine || 0)));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar-row">
          <span className="hbar-label">{r.label}</span>
          <div className="hbar-tracks">
            <div className="hbar-track"><span className="hbar-fill area" style={{ width: `${((r.area || 0) / max) * 100}%` }} /><em>{r.area}%</em></div>
            {showMine && r.mine != null && <div className="hbar-track"><span className="hbar-fill mine" style={{ width: `${((r.mine || 0) / max) * 100}%` }} /><em>{r.mine}%</em></div>}
          </div>
        </div>
      ))}
    </div>
  );
}

const Legend = ({ mine }) => (
  <div className="chart-legend">
    <span><span className="dot area" /> Area</span>
    {mine && <span><span className="dot mine" /> Your store</span>}
  </div>
);

export default function DemandInsights() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async (silent) => {
    try {
      const res = await api.get('/network/demand', { params: { days } });
      setData(res.data);
      setError('');
    } catch (err) {
      if (silent !== true) setError(errMsg(err));
    }
  }, [days]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  useAutoRefresh(() => load(true), 60000);

  return (
    <>
      <div className="trend-controls">
        <p className="muted small demand-intro">Anonymous patterns from orders across the network — shares of orders and units, never any other store's numbers.</p>
        <div className="tabs compact">
          {RANGES.map((d) => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} days</button>)}
        </div>
      </div>

      {error && <div className="message error">{error}</div>}
      {!data ? (
        !error && <SkeletonRows count={3} />
      ) : !data.ready ? (
        <div className="panel empty-state">
          <h3>Not enough data yet</h3>
          <p className="muted">
            {data.reason === 'stores' && `Demand patterns need at least ${data.needed} stores in the network (there ${data.storesCounted === 1 ? 'is' : 'are'} ${data.storesCounted} so far). This keeps every store's numbers private.`}
            {data.reason === 'orders' && `Only ${data.ordersCounted} order${data.ordersCounted === 1 ? '' : 's'} in the last ${days} days across ${data.storesCounted} stores — at least ${data.needed} are needed. Try a longer period.`}
            {data.reason === 'not_in_network' && 'Join the network to see demand patterns.'}
          </p>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi"><span>Showing</span><strong className="kpi-text">{data.scopeName}</strong></div>
            <div className="kpi"><span>Stores counted</span><strong>{data.storesCounted}</strong></div>
            <div className="kpi"><span>Orders ({days}d)</span><strong>{data.ordersCounted}</strong></div>
            <div className={`kpi ${data.growthPct != null && data.growthPct < 0 ? 'danger' : ''}`}>
              <span>Vs previous {days} days</span>
              <strong>{data.growthPct == null ? '—' : `${data.growthPct > 0 ? '+' : ''}${data.growthPct}%`}</strong>
            </div>
          </div>

          <div className="panel">
            <h3>💡 What this means for your stock</h3>
            <ul className="tip-list">{data.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            {data.myOrders === 0 && <p className="muted small">Your store has no orders in this period, so only area figures are shown.</p>}
          </div>

          <div className="panel">
            <h3>Busiest days</h3>
            <p className="muted small">Share of orders placed on each weekday.</p>
            <BarPairs items={data.weekdays} showMine={data.myOrders > 0} />
            <Legend mine={data.myOrders > 0} />
          </div>

          <div className="panel">
            <h3>Busiest hours</h3>
            <p className="muted small">Share of orders by time of day (Philippine time).</p>
            <BarPairs items={data.hours} showMine={data.myOrders > 0} labelEvery={3} height={120} formatLabel={(it) => hourLabel(it.hour)} />
            <Legend mine={data.myOrders > 0} />
          </div>

          <div className="two-col">
            <div className="panel">
              <h3>Popular sizes</h3>
              <p className="muted small">Share of units sold.</p>
              <HBars rows={data.sizes} showMine={data.myOrders > 0} />
              <Legend mine={data.myOrders > 0} />
            </div>
            <div className="panel">
              <h3>Popular brands</h3>
              <p className="muted small">Share of units sold in the area.</p>
              <HBars rows={data.brands} showMine={false} />
            </div>
          </div>

          <div className="panel">
            <h3>Which areas order the most</h3>
            <p className="muted small">Share of all network orders. Areas with fewer than 3 stores are combined to keep them private.</p>
            <div className="hbars">
              {data.areas.map((a) => (
                <div key={a.name} className="hbar-row">
                  <span className="hbar-label">{a.name}{a.isMine && <em className="you-tag">you</em>}</span>
                  <div className="hbar-tracks"><div className="hbar-track"><span className={`hbar-fill ${a.isMine ? 'mine' : 'area'}`} style={{ width: `${a.share}%` }} /><em>{a.share}%</em></div></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
