export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { meta, data } = req.body;

  if (meta?.event_name === 'order_created' || meta?.event_name === 'subscription_created') {
    console.log('[Webhook] License purchased:', data?.id);
    return res.status(200).json({
      success: true,
      message: 'License activated'
    });
  }

  res.status(200).json({ success: true });
}
