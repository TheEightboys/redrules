// frontend/api/webhook/dodo.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const payload = req.body;

        console.log('✅ Dodo Webhook received:', JSON.stringify(payload, null, 2));

        const { 
            id: payment_id,
            status,
            customer_email,
            amount,
            product_id
        } = payload;

        // Plan mapping
        const planMap = {
            'pdt_XocDrGw3HxTb0nD7nyYyl': { name: 'starter', posts: 150 },
            'pdt_RBEfQWVlN9bnWihieBQSt': { name: 'starter', posts: 1800 },
            'pdt_dumBrrIeNTtENukKXHiGh': { name: 'professional', posts: 250 },
            'pdt_gBCE38rNQm8x30iqAltc6': { name: 'professional', posts: 3000 },
            'pdt_UHLjlc1qPLgSvK1ubHjgJ': { name: 'enterprise', posts: 500 },
            'pdt_E9rxQwDMZahet7kADcna5': { name: 'enterprise', posts: 6000 }
        };

        const planData = planMap[product_id];

        if (status === 'completed' || status === 'successful' || status === 'paid') {
            console.log(`✅ Payment successful: ${payment_id}`);
            console.log(`Plan: ${planData?.name}, Posts: ${planData?.posts}, Email: ${customer_email}`);
            
            // TODO: Update user in Supabase
            // Uncomment when ready to integrate with database:
            /*
            import { createClient } from '@supabase/supabase-js';
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY
            );
            
            const { error } = await supabase.from('users').update({
                plan: planData.name,
                credits: planData.posts,
                plan_activated_at: new Date().toISOString(),
                plan_expires_at: new Date(Date.now() + (billingType === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000)
            }).eq('email', customer_email);
            */

            return res.status(200).json({ status: 'success', message: 'Payment recorded' });
        }

        console.log(`⏳ Payment status: ${status}`);
        return res.status(200).json({ status: 'received', message: 'Webhook received' });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        // Important: Always return 200 to Dodo
        return res.status(200).json({ 
            status: 'error', 
            message: error.message 
        });
    }
}
