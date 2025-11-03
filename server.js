const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==========================================
// CONFIGURATION
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DODO_API_KEY = process.env.DODO_API_KEY || '';
const DODO_MODE = process.env.DODO_MODE || 'test';
const DODO_BASE_URL = DODO_MODE === 'test' 
    ? 'https://test-api.dodopayments.com' 
    : 'https://api.dodopayments.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://redditfix.vercel.app';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Supabase configuration
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        json: async () => JSON.parse(data)
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function postToApi(hostname, path, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: hostname,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        json: async () => JSON.parse(responseData)
                    });
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function calculateExpiryDate(billingCycle) {
    const now = new Date();
    if (billingCycle === 'monthly') {
        now.setMonth(now.getMonth() + 1);
    } else if (billingCycle === 'yearly') {
        now.setFullYear(now.getFullYear() + 1);
    }
    return now.toISOString();
}

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ Server is working!',
        features: ['Reddit Generation', 'Post Optimization', 'Dodo Payments']
    });
});

// ==========================================
// REDDIT ENDPOINTS
// ==========================================

app.get('/api/reddit-rules/:subreddit', async (req, res) => {
    const subreddit = req.params.subreddit.toLowerCase();
    console.log(`\n📍 Fetching rules for: r/${subreddit}`);
    
    try {
        const url = `https://www.reddit.com/r/${subreddit}/about/rules.json`;
        const response = await fetchUrl(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        let rulesText = '';
        
        if (data.rules && Array.isArray(data.rules)) {
            data.rules.forEach((rule, index) => {
                rulesText += `**Rule ${index + 1}: ${rule.short_name}**\n${rule.description}\n\n`;
            });
        }
        
        console.log(`✅ Got ${data.rules ? data.rules.length : 0} rules`);
        
        res.json({
            subreddit: subreddit,
            rules: rulesText || 'No rules available',
            success: true
        });
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        res.status(500).json({ error: `Failed: ${error.message}` });
    }
});

// ==========================================
// GENERATE POST ENDPOINT
// ==========================================
app.post('/api/generate-post', async (req, res) => {
    const { subreddit, topic, rules } = req.body;
    
    console.log(`\n🤖 Generating SHORT format post for r/${subreddit}`);
    console.log(`📝 Topic: ${topic}`);
    
    try {
        if (!GEMINI_API_KEY) {
            return res.status(400).json({ error: 'API key not configured' });
        }
        
        const prompt = `You are a Reddit expert for r/${subreddit}.

IMPORTANT RULES TO FOLLOW:
${rules}

TOPIC: ${topic}

Create a SHORT Reddit post about "${topic}" that:
1. Has a CLEAR, SPECIFIC TITLE
2. Has ONLY 6-7 lines of body content (NOT too long)
3. Follows ALL rules above
4. Is engaging and asks a genuine question
5. Uses proper formatting (bold, line breaks)
6. Feels authentic and discussion-focused
7. NO promotional content

FORMAT:
**Title:** [Your title here]

[Body - exactly 6-7 lines, no more]

WRITE ONLY THE POST:`;

        const response = await postToApi('generativelanguage.googleapis.com', 
            `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.9,
                    maxOutputTokens: 800
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Gemini API returned ${response.status}`);
        }
        
        const data = await response.json();
        let post = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Failed';
        
        post = post.trim();
        if (post.includes('**Title:**')) {
            post = post.replace(/\*\*Title:\*\*/g, '**Title:**');
        }
        
        res.json({
            success: true,
            subreddit: subreddit,
            topic: topic,
            post: post
        });
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// OPTIMIZE POST ENDPOINT
// ==========================================
app.post('/api/optimize-post', async (req, res) => {
    const { subreddit, post, rules } = req.body;
    
    console.log(`\n🤖 Optimizing post to SHORT format for r/${subreddit}`);
    
    try {
        if (!GEMINI_API_KEY) {
            return res.status(400).json({ error: 'API key not configured' });
        }
        
        const prompt = `You are a Reddit expert for r/${subreddit}.

IMPORTANT RULES TO FOLLOW:
${rules}

ORIGINAL POST:
"""
${post}
"""

TASK: Optimize this post to be SHORT (6-7 lines max) while:
1. Following ALL rules above
2. Keeping the core idea
3. Making it punchier and more engaging
4. Adding a genuine discussion question
5. Using proper formatting
6. Being concise (NOT long)

FORMAT:
**Title:** [optimized title]

[Body - exactly 6-7 lines, concise and engaging]

WRITE ONLY THE OPTIMIZED POST:`;

        const response = await postToApi('generativelanguage.googleapis.com', 
            `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.9,
                    maxOutputTokens: 800
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Gemini API returned ${response.status}`);
        }
        
        const data = await response.json();
        let optimizedPost = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Failed';
        
        optimizedPost = optimizedPost.trim();
        if (optimizedPost.includes('**Title:**')) {
            optimizedPost = optimizedPost.replace(/\*\*Title:\*\*/g, '**Title:**');
        }
        
        res.json({
            success: true,
            subreddit: subreddit,
            post: optimizedPost
        });
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// DODO PAYMENTS ENDPOINTS
// ==========================================

/**
 * CREATE PAYMENT SESSION
 * POST /api/dodo/create-session
 */
app.post('/api/dodo/create-session', async (req, res) => {
  try {
    const { userId, plan, email, amount, postsPerMonth, billingCycle, transactionId } = req.body;
    
    console.log('\n💳 Creating payment session:', { userId, plan, amount });
    
    if (!DODO_API_KEY) {
        return res.status(400).json({ 
            success: false, 
            error: 'Dodo API key not configured' 
        });
    }

    // Create payment session via Dodo API
    const dodoResponse = await axios.post(`${DODO_BASE_URL}/v1/checkout/sessions`, {
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'USD',
        customer_email: email || 'customer@redditfix.com',
        description: `${plan} Plan - ${postsPerMonth} posts/month (${billingCycle})`,
        metadata: {
            userId,
            plan,
            postsPerMonth,
            billingCycle,
            transactionId,
            appName: 'ReddiGen'
        },
        success_url: `${FRONTEND_URL}/dashboard.html?payment=success&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/dashboard.html?payment=cancelled`,
        webhook_url: `${BACKEND_URL}/api/dodo/webhook`
    }, {
        headers: {
            'Authorization': `Bearer ${DODO_API_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    const sessionId = dodoResponse.data.id;
    console.log('✅ Dodo session created:', sessionId);

    // Store pending transaction in Supabase
    const { error: dbError } = await supabase
        .from('payments')
        .insert([{
            user_id: userId,
            transaction_id: transactionId,
            session_id: sessionId,
            plan_type: plan,
            amount: amount,
            posts_per_month: postsPerMonth,
            billing_cycle: billingCycle,
            status: 'pending',
            customer_email: email,
            created_at: new Date().toISOString()
        }]);

    if (dbError) {
        console.error('❌ Database error:', dbError);
    }

    res.json({
        success: true,
        paymentUrl: dodoResponse.data.url,
        sessionId: sessionId,
        message: 'Payment session created successfully'
    });
    
  } catch (error) {
    console.error('❌ Dodo session error:', error.response?.data || error.message);
    res.status(500).json({ 
        success: false, 
        error: error.response?.data?.message || 'Failed to create payment session'
    });
  }
});

/**
 * VERIFY PAYMENT SUCCESS
 * POST /api/dodo/verify-payment
 */
app.post('/api/dodo/verify-payment', async (req, res) => {
    try {
        const { sessionId, userId } = req.body;
        
        console.log('\n✔️ Verifying payment:', { sessionId, userId });
        
        if (!sessionId || !userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing sessionId or userId' 
            });
        }

        // Query Dodo to verify session status
        const verifyResponse = await axios.get(
            `${DODO_BASE_URL}/v1/checkout/sessions/${sessionId}`,
            {
                headers: {
                    'Authorization': `Bearer ${DODO_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const sessionData = verifyResponse.data;
        console.log('Session status:', sessionData.status);

        if (sessionData.status === 'completed' || sessionData.status === 'paid') {
            // Payment successful - fetch payment record
            const { data: paymentData, error: selectError } = await supabase
                .from('payments')
                .select('*')
                .eq('session_id', sessionId)
                .single();

            if (selectError) {
                console.error('❌ Payment lookup error:', selectError);
                return res.status(404).json({ 
                    success: false, 
                    error: 'Payment record not found'
                });
            }

            // Update payment status to completed
            await supabase
                .from('payments')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    dodo_transaction_id: sessionData.payment_id
                })
                .eq('session_id', sessionId);

            // Update/Create user subscription
            await supabase
                .from('user_subscriptions')
                .upsert({
                    user_id: userId,
                    plan_type: paymentData.plan_type,
                    posts_per_month: paymentData.posts_per_month,
                    billing_cycle: paymentData.billing_cycle,
                    status: 'active',
                    started_at: new Date().toISOString(),
                    expires_at: calculateExpiryDate(paymentData.billing_cycle),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            console.log('✅ Payment verified and subscription activated');

            res.json({
                success: true,
                status: 'completed',
                message: 'Payment verified successfully',
                plan: paymentData.plan_type,
                amount: paymentData.amount,
                expiresAt: calculateExpiryDate(paymentData.billing_cycle)
            });

        } else if (sessionData.status === 'pending' || sessionData.status === 'processing') {
            res.json({
                success: true,
                status: 'pending',
                message: 'Payment is still processing'
            });

        } else {
            // Payment failed or cancelled
            await supabase
                .from('payments')
                .update({ status: 'failed' })
                .eq('session_id', sessionId);

            res.json({
                success: false,
                status: 'failed',
                message: 'Payment was not completed'
            });
        }

    } catch (error) {
        console.error('❌ Verification error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Payment verification failed: ' + error.message
        });
    }
});

/**
 * WEBHOOK - Dodo Payment Notifications
 * POST /api/dodo/webhook
 */
app.post('/api/dodo/webhook', async (req, res) => {
    try {
        const event = req.body;
        
        console.log('\n🔔 Webhook received:', event.type);

        if (event.type === 'checkout.session.completed') {
            const sessionId = event.data.id;
            const paymentId = event.data.payment_id;

            console.log('💰 Payment completed:', { sessionId, paymentId });

            // Find payment record
            const { data: payment, error: selectError } = await supabase
                .from('payments')
                .select('*')
                .eq('session_id', sessionId)
                .single();

            if (selectError) {
                console.error('❌ Payment not found:', selectError);
                return res.status(404).json({ error: 'Payment not found' });
            }

            // Mark as completed
            await supabase
                .from('payments')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    dodo_transaction_id: paymentId
                })
                .eq('session_id', sessionId);

            // Activate subscription
            await supabase
                .from('user_subscriptions')
                .upsert({
                    user_id: payment.user_id,
                    plan_type: payment.plan_type,
                    posts_per_month: payment.posts_per_month,
                    billing_cycle: payment.billing_cycle,
                    status: 'active',
                    started_at: new Date().toISOString(),
                    expires_at: calculateExpiryDate(payment.billing_cycle),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            console.log('✅ Subscription activated for user:', payment.user_id);
            res.json({ received: true });

        } else if (event.type === 'checkout.session.expired') {
            const sessionId = event.data.id;
            console.log('⏰ Session expired:', sessionId);

            await supabase
                .from('payments')
                .update({ status: 'expired' })
                .eq('session_id', sessionId);

            res.json({ received: true });

        } else if (event.type === 'charge.failed') {
            const sessionId = event.data.checkout_session_id;
            console.log('❌ Charge failed:', sessionId);

            await supabase
                .from('payments')
                .update({ status: 'failed' })
                .eq('session_id', sessionId);

            res.json({ received: true });

        } else {
            console.log('ℹ️ Unhandled webhook event:', event.type);
            res.json({ received: true });
        }

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

/**
 * GET USER SUBSCRIPTION STATUS
 * GET /api/user/subscription/:userId
 */
app.get('/api/user/subscription/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        console.log('\n📊 Fetching subscription for user:', userId);
        
        const { data: subscription, error } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('❌ Error fetching subscription:', error);
            return res.status(500).json({ error: 'Failed to fetch subscription' });
        }

        if (!subscription) {
            return res.json({
                success: true,
                hasSubscription: false,
                message: 'No active subscription'
            });
        }

        const expiresAt = new Date(subscription.expires_at);
        const isExpired = expiresAt < new Date();

        res.json({
            success: true,
            hasSubscription: !isExpired,
            plan: subscription.plan_type,
            postsPerMonth: subscription.posts_per_month,
            billingCycle: subscription.billing_cycle,
            startedAt: subscription.started_at,
            expiresAt: subscription.expires_at,
            isExpired: isExpired,
            daysRemaining: Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET PAYMENT HISTORY
 * GET /api/user/payments/:userId
 */
app.get('/api/user/payments/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        console.log('\n📝 Fetching payment history for user:', userId);
        
        const { data: payments, error } = await supabase
            .from('payments')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching payments:', error);
            return res.status(500).json({ error: 'Failed to fetch payments' });
        }

        res.json({
            success: true,
            paymentCount: payments.length,
            payments: payments
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ERROR HANDLING MIDDLEWARE
// ==========================================
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        error: err.message,
        endpoint: req.path
    });
});

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ ReddiGen Backend RUNNING!`);
    console.log(`🚀 Backend listening on port ${PORT}`);
    console.log(`📝 Features: Reddit API, Gemini AI, Payment Processing`);
    console.log(`💳 Dodo Mode: ${DODO_MODE.toUpperCase()}`);
    console.log(`🌐 Frontend: ${FRONTEND_URL}`);
    console.log(`${'='.repeat(70)}\n`);
});

module.exports = app;
