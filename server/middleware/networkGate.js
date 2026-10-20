const { networkOf } = require('../utils/network');

// Use AFTER requireStoreAccess (which sets req.currentStore).
//   requireNetwork()                 -> must have joined and not been removed (read-only features)
//   requireNetwork({ write: true })  -> also not muted (sending / accepting handoffs, etc.)
function requireNetwork({ write = false } = {}) {
  return (req, res, next) => {
    const state = networkOf(req.currentStore);
    if (!state.joined) {
      return res.status(403).json({ code: 'NOT_IN_NETWORK', message: 'Join the store network first to use this.' });
    }
    if (state.status === 'removed') {
      return res.status(403).json({ code: 'NETWORK_REMOVED', message: 'Your store was removed from the network. Contact the PureGasly admin.' });
    }
    if (write && state.status === 'muted') {
      const until = state.mutedUntil ? new Date(state.mutedUntil).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }) : 'further notice';
      return res.status(403).json({ code: 'NETWORK_MUTED', message: `Your store is muted in the network until ${until}. You can still view prices and trends.` });
    }
    req.network = state;
    next();
  };
}

module.exports = requireNetwork;
