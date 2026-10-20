import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { SkeletonRows } from '../Skeleton';
import TrustBadge from './TrustBadge';
import { useToast } from '../../context/ToastContext';
import { errMsg, formatDateTime, formatPHP } from '../../utils/format';
import { HANDOFF_STATUS_LABEL, REASON_LABEL, REPORT_TYPES } from '../../utils/networkFormat';
import useAutoRefresh from '../../utils/useAutoRefresh';

const TYPE_LABEL = Object.fromEntries(REPORT_TYPES.map((t) => [t.value, t.label]));

// One dialog for both "resolve a report" and "change a store's standing".
function ModerationModal({ title, actions, onSubmit, onClose }) {
  const [action, setAction] = useState(actions[0].value);
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picked = actions.find((a) => a.value === action);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ action, days, note: note.trim() });
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{title}</h3>
        <div className="radio-list">
          {actions.map((a) => (
            <label key={a.value} className={`radio-row ${action === a.value ? 'selected' : ''}`}>
              <input type="radio" name="act" checked={action === a.value} onChange={() => setAction(a.value)} />
              <span><strong>{a.label}</strong><br /><span className="muted small">{a.help}</span></span>
            </label>
          ))}
        </div>
        {action === 'mute' && (
          <div className="field">
            <label htmlFor="mod-days">Mute for</label>
            <select id="mod-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 3, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'}</option>)}
            </select>
          </div>
        )}
        <textarea rows={3} maxLength={400} placeholder="Note to the store (optional) — they will see this" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <div className="message error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className={picked.danger ? 'btn-danger' : 'btn-solid'} disabled={busy}>{busy ? 'Working…' : picked.label}</button>
        </div>
      </form>
    </div>
  );
}

const REPORT_ACTIONS = [
  { value: 'dismiss', label: 'Dismiss', help: 'No action. The reporting store is told it was reviewed.' },
  { value: 'warn', label: 'Warn the store', help: 'Adds a warning to their record and notifies them.', danger: false },
  { value: 'mute', label: 'Mute the store', help: "They can't send or accept handoffs for a while. Open handoffs end.", danger: true },
  { value: 'remove', label: 'Remove from the network', help: 'Removes all access until you restore it. Open handoffs end.', danger: true },
];

function Standing({ network }) {
  if (network.status === 'removed') return <span className="status-pill cancelled">removed</span>;
  if (network.status === 'muted') return <span className="status-pill preparing">muted until {formatDateTime(network.mutedUntil)}</span>;
  return <span className="status-pill delivered">active</span>;
}

function Reports() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(null);

  const load = useCallback(async (silent) => {
    try {
      const res = await api.get('/admin/network/reports', { params: { status } });
      setReports(res.data);
      setError('');
    } catch (err) {
      if (silent !== true) setError(errMsg(err));
    }
  }, [status]);
  useEffect(() => {
    setReports(null);
    load();
  }, [load]);
  useAutoRefresh(() => load(true), 10000);

  if (error) return <div className="message error">{error}</div>;
  return (
    <>
      <div className="panel-head">
        <h3>Reports from stores</h3>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter reports">
          <option value="open">Open</option>
          <option value="actioned">Action taken</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
      </div>
      {!reports ? (
        <SkeletonRows count={2} />
      ) : reports.length === 0 ? (
        <p className="empty">No {status === 'all' ? '' : status === 'actioned' ? 'actioned ' : status + ' '}reports.</p>
      ) : (
        <div className="order-list">
          {reports.map((r) => (
            <div key={r.id} className="order-card report-card">
              <div className="order-head">
                <div>
                  <strong>{TYPE_LABEL[r.type] || r.type}</strong>
                  <div className="small"><strong>{r.reporter?.name || 'A store'}</strong> reported <strong>{r.target?.name || 'a store'}</strong></div>
                  <div className="muted small">{formatDateTime(r.createdAt)}</div>
                </div>
                <span className={`status-pill ${r.status === 'open' ? 'pending' : r.status === 'actioned' ? 'delivered' : 'cancelled'}`}>{r.status === 'actioned' ? `action: ${r.action}` : r.status}</span>
              </div>
              <blockquote className="handoff-note">“{r.details}”</blockquote>

              {r.handoff && (
                <div className="report-context small">
                  <strong>The handoff</strong> — {HANDOFF_STATUS_LABEL[r.handoff.status]} · {REASON_LABEL[r.handoff.reason]} · {formatPHP(r.handoff.total)}
                  {r.handoff.referralFee > 0 && ` · referral fee ${formatPHP(r.handoff.referralFee)}`}
                  <div className="muted">{r.handoff.items.join(', ')}</div>
                  {r.handoff.note && <div>Note sent: <em>“{r.handoff.note}”</em></div>}
                  {r.handoff.declineReason && <div>Decline reason: <em>“{r.handoff.declineReason}”</em></div>}
                </div>
              )}
              {r.target && (
                <p className="small muted">
                  {r.target.name}: <Standing network={r.target.network} /> · {r.target.network.warnings} warning(s) · reported {r.target.totalReports} time(s) in total
                </p>
              )}
              {r.adminNote && <p className="small">Your note: <em>{r.adminNote}</em></p>}
              {r.status === 'open' && (
                <div className="order-actions">
                  <button className="btn-solid" onClick={() => setResolving(r)}>Review and decide</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {resolving && (
        <ModerationModal
          title={`Report about ${resolving.target?.name}`}
          actions={REPORT_ACTIONS}
          onClose={() => setResolving(null)}
          onSubmit={async (body) => {
            await api.post(`/admin/network/reports/${resolving.id}/resolve`, body);
            toast('Report resolved.');
            load(true);
          }}
        />
      )}
    </>
  );
}

const STORE_ACTIONS = [
  { value: 'warn', label: 'Warn', help: 'Adds a warning to their record and notifies them.' },
  { value: 'mute', label: 'Mute', help: "They can't send or accept handoffs for a while.", danger: true },
  { value: 'remove', label: 'Remove from the network', help: 'Removes all access until you restore it.', danger: true },
  { value: 'restore', label: 'Restore / lift mute', help: 'Back to full access.' },
];

function NetworkStores() {
  const toast = useToast();
  const [stores, setStores] = useState(null);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(null);

  const load = useCallback(async (silent) => {
    try {
      const res = await api.get('/admin/network/stores');
      setStores(res.data);
      setError('');
    } catch (err) {
      if (silent !== true) setError(errMsg(err));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(true), 15000);

  if (error) return <div className="message error">{error}</div>;
  if (!stores) return <SkeletonRows count={2} />;
  return (
    <>
      <h3>Stores in the network ({stores.filter((s) => s.network.joined).length} joined)</h3>
      {stores.length === 0 ? (
        <p className="empty">No stores have joined the network yet.</p>
      ) : (
        <div className="row-list">
          {stores.map((s) => (
            <div key={s.id} className="row-item">
              <div>
                <strong>{s.name}</strong> <Standing network={s.network} />
                {!s.network.joined && <span className="muted small"> · not joined</span>}
                <div className="muted small">{s.area || 'No area'}{s.owner ? ` · ${s.owner.name} (${s.owner.email})` : ''}</div>
                <div className="small">
                  <TrustBadge trust={s.trust} /> · {s.completedHandoffs} handoff{s.completedHandoffs === 1 ? '' : 's'} done · {s.network.warnings} warning{s.network.warnings === 1 ? '' : 's'}
                  {s.openReports > 0 && <span className="text-danger"> · {s.openReports} open report{s.openReports === 1 ? '' : 's'}</span>}
                </div>
                {s.network.statusNote && <div className="small muted">Note: {s.network.statusNote}</div>}
              </div>
              <div className="row-actions"><button className="btn-ghost small" onClick={() => setActing(s)}>Manage</button></div>
            </div>
          ))}
        </div>
      )}
      {acting && (
        <ModerationModal
          title={`Manage ${acting.name}`}
          actions={STORE_ACTIONS}
          onClose={() => setActing(null)}
          onSubmit={async ({ action, days, note }) => {
            await api.post(`/admin/network/stores/${acting.id}/status`, { action, days, note });
            toast('Updated.');
            load(true);
          }}
        />
      )}
    </>
  );
}

export default function AdminNetwork() {
  const [view, setView] = useState('reports');
  return (
    <div className="panel">
      <div className="tabs compact inner-tabs">
        <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>Reports</button>
        <button className={view === 'stores' ? 'active' : ''} onClick={() => setView('stores')}>Stores</button>
      </div>
      {view === 'reports' ? <Reports /> : <NetworkStores />}
    </div>
  );
}
