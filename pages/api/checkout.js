// pages/api/checkout.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { plan, billingType, email, name } = req.body;

        const productMap = {
            'starter_monthly': 'pdt_XocDrGw3HxTb0nD7nyYyl',
            'starter_yearly': 'pdt_RBEfQWVlN9bnWihieBQSt',
            'professional_monthly': 'pdt_dumBrrIeNTtENukKXHiGh',
            'professional_yearly': 'pdt_gBCE38rNQm8x30iqAltc6',
            'enterprise_monthly': 'pdt_UHLjlc1qPLgSvK1ubHjgJ',
            'enterprise_yearly': 'pdt_E9rxQwDMZahet7kADcna5'
        };

        const productId = productMap[`${plan}_${billingType}`];

        if (!productId) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        if (!process.env.DODO_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }

        const response = await fetch('https://api.dodopayments.com/api/v1/checkout/create', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DODO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: productId,
                quantity: 1,
                customer_email: email || 'test@example.com',
                customer_name: name || 'User',
                success_url: `https://${req.headers.host}/dashboard.html?payment=success`,
                cancel_url: `https://${req.headers.host}/dashboard.html?payment=cancelled`
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(500).json({ error: data.message || 'Failed to create checkout' });
        }

        return res.status(200).json({
            success: true,
            paymentLink: data.checkout_url || data.payment_link || data.url
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
