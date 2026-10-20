import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { SkeletonRows } from '../Skeleton';
import { errMsg, formatPHP } from '../../utils/format';
import useAutoRefresh from '../../utils/useAutoRefresh';

const POSITION_COPY = {
  below: { cls: 'below', text: 'Below the average' },
  aligned: { cls: 'aligned', text: 'In line with the average' },
  above: { cls: 'above', text: 'Above the average' },
};

// A bar from the lowest to the highest area price, with markers for the average and for you.
function RangeBar({ item }) {
  const { min, max, avg, myPrice } = item;
  if (min == null || max == null || max <= min) return null;
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className="range-wrap" aria-label="Where your price sits in the area range">
      <div className="range-bar">
        <span className="range-mark avg" style={{ left: pos(avg) }} title={`Average ${formatPHP(avg)}`} />
        <span className="range-mark mine" style={{ left: pos(myPrice) }} title={`You ${formatPHP(myPrice)}`} />
      </div>
      <div className="range-ends"><span>{formatPHP(min)}</span><span>{formatPHP(max)}</span></div>
    </div>
  );
}

export default function PriceBenchmark({ status, goTo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async (silent) => {
    try {
      const res = await api.get('/network/benchmark');
      setData(res.data);
      setError('');
    } catch (err) {
      if (silent !== true) setError(errMsg(err));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(true), 30000);

  if (error) return <div className="message error">{error}</div>;
  if (!data) return <SkeletonRows count={3} />;

  return (
    <>
      <div className="message info">
        Prices are <strong>anonymous</strong>: you see averages for {status.area || 'your area'}, never which store charges what. Numbers only appear when at least {data.thresholds.minStores} stores sell the same product, and the lowest–highest range needs {data.thresholds.minStoresForRange}. These compare <strong>regular</strong> prices (not sale prices).
      </div>

      {data.items.length === 0 ? (
        <p className="empty">You have no gas tanks or refills with a brand or size yet. Add some in Inventory to see how they compare.</p>
      ) : (
        <div className="bench-list">
          {data.items.map((it) => {
            const pos = it.position && POSITION_COPY[it.position.label];
            return (
              <div key={it.productId} className="panel bench-card">
                <div className="bench-head">
                  <div>
                    <h3>{it.label}</h3>
                    <div className="muted small">{it.name}</div>
                  </div>
                  {pos && <span className={`position-pill ${pos.cls}`}>{pos.text}</span>}
                </div>

                {it.scope ? (
                  <>
                    <div className="bench-numbers">
                      <div><span>Your price</span><strong>{formatPHP(it.myPrice)}</strong></div>
                      <div><span>Average</span><strong>{formatPHP(it.avg)}</strong></div>
                      <div><span>Median</span><strong>{formatPHP(it.median)}</strong></div>
                    </div>
                    <p className="small">
                      You charge <strong>{Math.abs(it.position.diffPct)}% {it.position.diffPct < 0 ? 'less' : 'more'}</strong> than the average
                      {it.position.diffPct === 0 ? '' : ''} — cheaper than <strong>{it.position.cheaperThanPct}%</strong> of the {it.storesCounted} stores counted.
                    </p>
                    <RangeBar item={it} />
                    <p className="muted small">
                      {it.scopeName} · {it.storesCounted} stores
                      {it.scope === 'network' && ' (not enough stores in your own area yet, so this uses the whole network)'}
                    </p>
                    <button className="link-btn" onClick={() => goTo('trends', { key: it.key })}>See how this price has moved →</button>
                  </>
                ) : (
                  <p className="muted">
                    Not enough data yet — at least {data.thresholds.minStores} stores in the network need to sell this product before an average can be shown. Your price: <strong>{formatPHP(it.myPrice)}</strong>.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
