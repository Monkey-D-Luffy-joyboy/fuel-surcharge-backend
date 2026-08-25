const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
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
        const { serviceName, price } = req.body;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'aud',
                        product_data: {
                            name: serviceName || 'Airport Transfer',
                        },
                        unit_amount: Math.round(price * 100), // Converts dollars to cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'https://yourwebsite.com/success',
            cancel_url: 'https://yourwebsite.com/services',
        });

        return res.status(200).json({ url: session.url });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
