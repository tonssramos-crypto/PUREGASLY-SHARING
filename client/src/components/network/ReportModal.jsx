import { useState } from 'react';
import api from '../../api/axios';
import { errMsg } from '../../utils/format';
import { REPORT_TYPES } from '../../utils/networkFormat';

export default function ReportModal({ handoff, onClose, onDone }) {
  const [type, setType] = useState('no_show');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/network/reports', { handoffId: handoff.id, type, details });
      onDone();
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
        <h3>Report {handoff.other.name}</h3>
        <p className="muted small">The PureGasly admin will review this and can warn, mute or remove a store from the network. Only report real problems with this handoff.</p>
        <div className="field">
          <label htmlFor="rp-type">What went wrong?</label>
          <select id="rp-type" value={type} onChange={(e) => setType(e.target.value)}>
            {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rp-details">What happened?</label>
          <textarea id="rp-details" rows={4} required maxLength={500} placeholder="Describe it so the admin can understand." value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
        {error && <div className="message error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-danger" disabled={busy || details.trim().length < 5}>{busy ? 'Sending...' : 'Send report'}</button>
        </div>
      </form>
    </div>
  );
}
