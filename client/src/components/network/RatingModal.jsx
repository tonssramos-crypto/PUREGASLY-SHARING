import { useState } from 'react';
import api from '../../api/axios';
import { errMsg } from '../../utils/format';

export default function RatingModal({ handoff, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/network/handoffs/${handoff.id}/rate`, { rating, comment });
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
        <h3>Rate {handoff.other.name}</h3>
        <p className="muted small">How reliable were they on this handoff? Other stores see only the average score — your comment goes to the admin and that store.</p>
        <div className="star-picker">
          {[1, 2, 3, 4, 5].map((i) => (
            <button type="button" key={i} className={i <= rating ? 'star-btn on' : 'star-btn'} onClick={() => setRating(i)} aria-label={`${i} star${i === 1 ? '' : 's'}`}>★</button>
          ))}
        </div>
        <textarea rows={3} maxLength={200} placeholder="Anything to add? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
        {error && <div className="message error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-solid" disabled={busy}>{busy ? 'Sending...' : 'Submit rating'}</button>
        </div>
      </form>
    </div>
  );
}
