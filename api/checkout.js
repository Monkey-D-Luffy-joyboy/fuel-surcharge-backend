const Stripe = require('stripe');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const { serviceName, price } = req.body;

        // Convert dollars to cents for Stripe (e.g., $225 -> 22500)
        const unitAmount = Math.round((parseFloat(price) || 225) * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'aud',
                        product_data: {
                            name: serviceName || 'Airport Transfer',
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'https://japanese-guide-in-byron-bay.framer.website/?success=true',
            cancel_url: 'https://japanese-guide-in-byron-bay.framer.website/?canceled=true',
        });

        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
