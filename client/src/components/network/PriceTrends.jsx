import { useEffect, useState } from 'react';
import api from '../../api/axios';
import LineChart from '../LineChart';
import { SkeletonRows } from '../Skeleton';
import { errMsg, formatPHP } from '../../utils/format';

const RANGES = [30, 90, 180];

const firstVal = (arr) => arr.find((v) => v != null);
const lastVal = (arr) => [...arr].reverse().find((v) => v != null);
const pctChange = (a, b) => (a && b != null ? Math.round(((b - a) / a) * 1000) / 10 : null);

export default function PriceTrends({ initialKey }) {
  const [options, setOptions] = useState(null);
  const [key, setKey] = useState(initialKey || '');
  const [days, setDays] = useState(90);
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get('/network/benchmark')
      .then((res) => {
        setOptions(res.data.items);
        setKey((k) => (res.data.items.some((i) => i.key === k) ? k : res.data.items[0]?.key || ''));
      })
      .catch((err) => setError(errMsg(err)));
  }, []);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    setLoading(true);
    api
      .get('/network/trends', { params: { key, days } })
      .then((res) => {
        if (!cancelled) {
          setTrend(res.data);
          setError('');
        }
      })
      .catch((err) => !cancelled && setError(errMsg(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key, days]);

  if (error && !options) return <div className="message error">{error}</div>;
  if (!options) return <SkeletonRows count={2} />;
  if (options.length === 0) return <p className="empty">Add a gas tank or refill with a brand or size in Inventory to see its price trend.</p>;

  const avgSeries = trend ? trend.series.map((s) => s.avg) : [];
  const mineSeries = trend ? trend.mine.map((m) => m.price) : [];
  const hasArea = avgSeries.some((v) => v != null);
  const hasRange = trend && trend.series.some((s) => s.min != null);

  const areaChange = pctChange(firstVal(avgSeries), lastVal(avgSeries));
  const myChange = pctChange(firstVal(mineSeries), lastVal(mineSeries));
  const todayAvg = lastVal(avgSeries);
  const todayMine = lastVal(mineSeries);

  return (
    <>
      <div className="trend-controls">
        <div className="field">
          <label htmlFor="tr-prod">Product</label>
          <select id="tr-prod" value={key} onChange={(e) => setKey(e.target.value)}>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div className="tabs compact">
          {RANGES.map((d) => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} days</button>)}
        </div>
      </div>

      {error && <div className="message error">{error}</div>}

      <div className="panel">
        {loading && !trend ? (
          <SkeletonRows count={2} />
        ) : trend ? (
          <>
            <h3>{trend.label} — {trend.scopeName || 'your price'}</h3>
            {!trend.scope && (
              <div className="message info">The area line is hidden because fewer than 3 stores in the network sell this product. Your own price history is still shown.</div>
            )}
            <LineChart
              labels={trend.series.map((s) => s.date)}
              lines={[
                ...(hasArea ? [{ key: 'area', name: `${trend.scope === 'network' ? 'Network' : 'Area'} average`, color: 'var(--brand)', values: avgSeries }] : []),
                { key: 'mine', name: 'Your price', color: '#e8590c', values: mineSeries, dashed: false },
              ]}
              band={hasRange ? { min: trend.series.map((s) => s.min), max: trend.series.map((s) => s.max) } : null}
              formatY={(v) => formatPHP(v).replace('.00', '')}
              emptyText="There isn't any price history for this product yet."
            />

            <div className="trend-stats">
              {todayAvg != null && <div><span>Area average now</span><strong>{formatPHP(todayAvg)}</strong></div>}
              {todayMine != null && <div><span>Your price now</span><strong>{formatPHP(todayMine)}</strong></div>}
              {areaChange != null && <div><span>Area change ({days}d)</span><strong className={areaChange > 0 ? 'up' : areaChange < 0 ? 'down' : ''}>{areaChange > 0 ? '+' : ''}{areaChange}%</strong></div>}
              {myChange != null && <div><span>Your change ({days}d)</span><strong className={myChange > 0 ? 'up' : myChange < 0 ? 'down' : ''}>{myChange > 0 ? '+' : ''}{myChange}%</strong></div>}
            </div>
            <p className="muted small">
              History is built from the prices stores set on PureGasly, so it starts when each product was first listed (or when this feature began) and grows every day. Days with fewer than 3 stores priced are left blank to protect anonymity.
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}
