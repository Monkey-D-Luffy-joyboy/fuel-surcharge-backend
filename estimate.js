const { calcPrice } = require('./_pricing');

module.exports = async function handler(req, res) {
  // Same cross-origin situation as bookings.js — the front end calls this from inside
  // Framer's embedded iframe.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { routeId, fromCustomAddress, toAddress, returnEnabled } = req.query;

  if (!routeId) {
    return res.status(400).json({ error: 'Missing routeId' });
  }

  try {
    const result = await calcPrice({
      routeId,
      fromCustomAddress,
      toAddress,
      returnEnabled: returnEnabled === 'true',
    });
    return res.status(200).json(result);
  } catch (e) {
    console.error('Estimate calculation failed:', e);
    return res.status(500).json({ error: 'Could not calculate estimate' });
  }
};
