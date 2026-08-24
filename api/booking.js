const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Example fuel calculation logic
function getFuelSurcharge() {
  // Current dynamic surcharge = $31.50 AUD
  return 31.50; 
}
app.get('/', (req, res) => {
  res.send('Backend API is running!');
});
module.exports = async (req, res) => {
  // Set full CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle browser OPTIONS preflight check
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { serviceId } = req.body || {};

    // Assign base price according to serviceId
    let basePrice = 193.50; // Default Gold Coast base price
    let productName = 'ゴールドコースト空港送迎 (Gold Coast Airport Transfer)';

    if (serviceId === 'brisbane') {
      basePrice = 220.00; // Brisbane base price
      productName = 'ブリスベン空港送迎 (Brisbane Airport Transfer)';
    }

    const surcharge = getFuelSurcharge();
    
    // Calculate total amount in cents
    const finalUnitAmount = Math.round((basePrice + surcharge) * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: { name: productName },
            unit_amount: finalUnitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://jpgbyron.com/',
      cancel_url: 'https://jpgbyron.com/services',
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
};