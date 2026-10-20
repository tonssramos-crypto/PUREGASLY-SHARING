import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import AppShell from '../components/AppShell';
import { SkeletonRows } from '../components/Skeleton';
import JoinNetwork from '../components/network/JoinNetwork';
import NetworkOverview from '../components/network/NetworkOverview';
import HandoffsPanel from '../components/network/HandoffsPanel';
import PriceBenchmark from '../components/network/PriceBenchmark';
import PriceTrends from '../components/network/PriceTrends';
import DemandInsights from '../components/network/DemandInsights';
import { useAuth } from '../context/AuthContext';
import { errMsg, formatDateTime } from '../utils/format';
import useAutoRefresh from '../utils/useAutoRefresh';
import usePageTitle from '../utils/usePageTitle';

export default function NetworkHub() {
  usePageTitle('Store Network');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async (silent) => {
    try {
      const res = await api.get('/network/status');
      setStatus(res.data);
      setError('');
    } catch (err) {
      if (silent !== true) setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(true), 15000);

  const has = (p) => user.role === 'owner' || user.permissions?.includes(p);
  const canHandoffs = has('manage_orders');
  const canInsights = has('view_analytics');

  const incoming = status?.counts?.incomingOffers || 0;
  const tabs = [
    { key: 'overview', label: 'Overview' },
    canHandoffs && { key: 'handoffs', label: 'Handoffs', badge: incoming },
    canInsights && { key: 'prices', label: 'Area prices' },
    canInsights && { key: 'trends', label: 'Price trends' },
    canInsights && { key: 'demand', label: 'Demand' },
  ].filter(Boolean);

  const wanted = params.get('tab');
  const tab = tabs.some((t) => t.key === wanted) ? wanted : 'overview';
  const goTo = (key, extra = {}) => setParams({ tab: key, ...extra }, { replace: true });

  const removed = status?.joined && status.status === 'removed';
  const muted = status?.joined && status.status === 'muted';

  return (
    <AppShell wide>
      <div className="page-head">
        <div>
          <h1 className="page-title">Store Network</h1>
          <p className="muted small">Work with nearby stores: hand over orders you can't fill, compare prices, and plan your stock.</p>
        </div>
      </div>

      {error && <div className="message error">{error}</div>}
      {!status ? (
        !error && <SkeletonRows count={3} />
      ) : !status.joined ? (
        <JoinNetwork status={status} onJoined={load} />
      ) : removed ? (
        <div className="message error">
          Your store was removed from the network by the PureGasly admin. {status.statusNote && <>Reason: {status.statusNote} </>}
          Contact the admin if you think this is a mistake.
        </div>
      ) : (
        <>
          {muted && (
            <div className="message warn">
              Your store is muted until {formatDateTime(status.mutedUntil)}. You can still view prices, trends and your handoffs, but you can't send or accept new handoffs.
              {status.statusNote && <> Reason: {status.statusNote}</>}
            </div>
          )}

          <div className="tabs scroll">
            {tabs.map((t) => (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => goTo(t.key)}>
                {t.label}
                {t.badge > 0 && <span className="count-badge">{t.badge}</span>}
              </button>
            ))}
          </div>

          {tab === 'overview' && <NetworkOverview status={status} reload={load} goTo={goTo} canHandoffs={canHandoffs} canInsights={canInsights} />}
          {tab === 'handoffs' && <HandoffsPanel muted={muted} onChanged={() => load(true)} />}
          {tab === 'prices' && <PriceBenchmark status={status} goTo={goTo} />}
          {tab === 'trends' && <PriceTrends initialKey={params.get('key') || ''} />}
          {tab === 'demand' && <DemandInsights />}
        </>
      )}
    </AppShell>
  );
}
