import { useCallback, useEffect, useState } from 'react';
import useAutoRefresh from '../../utils/useAutoRefresh';
import api from '../../api/axios';
import { errMsg, formatDateTime, formatPHP } from '../../utils/format';
import usePageTitle from '../../utils/usePageTitle';
import Avatar from '../../components/Avatar';

const ACTION_LABEL = { preparing: 'Start Delivery (Out for Delivery)', out_for_delivery: 'Mark as Delivered' };
const STATUS_LABEL = { preparing: 'Ready for pickup', out_for_delivery: 'Out for Delivery', delivered: 'Delivered' };

export default function RiderDashboard({ user }) {
  usePageTitle('My Deliveries');
  const [orders, setOrders] = useState([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/rider-orders', { params: { active: onlyActive ? 'true' : undefined } });
      setOrders(res.data);
      setError('');
    } catch (err) {
      setError(errMsg(err, 'Could not load your deliveries.'));
    } finally {
      setLoading(false);
    }
  }, [onlyActive]);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load, 8000);

  async function act(id) {
    setBusyId(id);
    try {
      await api.patch(`/rider-orders/${id}/advance`);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="hero">
        <div>
          <h1>Hi {user.name.split(' ')[0]} 🛵</h1>
          <p>Your assigned deliveries. Move each one forward as you go.</p>
        </div>
        <span className="role-badge">Rider</span>
      </div>

      <div className="tabs compact">
        <button className={onlyActive ? 'active' : ''} onClick={() => setOnlyActive(true)}>Active</button>
        <button className={!onlyActive ? 'active' : ''} onClick={() => setOnlyActive(false)}>All</button>
      </div>

      {error && <div className="message error">{error}</div>}
      {loading ? (
        <p className="empty">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="empty">No deliveries assigned to you right now.</p>
      ) : (
        <div className="order-list">
          {orders.map((o) => (
            <div key={o.id} className="order-card">
              <div className="order-head">
                <div>
                  <strong>{o.orderNo}</strong>
                  <span className="muted small"> · {o.storeName}</span>
                  <div className="muted small">{formatDateTime(o.createdAt)}</div>
                </div>
                <strong className="price">{formatPHP(o.total)}</strong>
              </div>
              {o.deliveryFee > 0 && <p className="muted small right-note">Includes {formatPHP(o.deliveryFee)} delivery fee</p>}

              <span className={`status-pill ${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>

              <p className="small person-inline">
                <Avatar name={o.customer?.name || 'Customer'} src={o.customer?.avatar} size={24} />
                {o.customer?.name || 'Customer'} · 📞 {o.contactNumber}
              </p>
              <p className="small">📍 {o.deliveryAddress}</p>
              {o.notes && <p className="muted small">📝 {o.notes}</p>}

              <ul className="order-items">
                {o.items.map((it, i) => (
                  <li key={i}>
                    <span>{it.qty} × {it.name}{it.sizeKg ? ` (${it.sizeKg} kg)` : ''}</span>
                  </li>
                ))}
              </ul>

              {ACTION_LABEL[o.status] && (
                <div className="order-actions">
                  <button className="btn-solid" disabled={busyId === o.id} onClick={() => act(o.id)}>
                    {ACTION_LABEL[o.status]}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
