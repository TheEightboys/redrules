const express = require('express');
const cors = require('cors');
const path = require('path');
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
const DODO_MODE = process.env.DODO_MODE || 'test'; // 'test' or 'production'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://redditfix.vercel.app';

// Supabase configuration
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ Server is working!',
        mode: DODO_MODE,
        features: ['Reddit Generation', 'Post Optimization', 'Dodo Payments'],
        timestamp: new Date().toISOString()
    });
});

// ==========================================
// REDDIT RULES ENDPOINT
// ==========================================
app.get('/api/reddit-rules/:subreddit', async (req, res) => {
    const subreddit = req.params.subreddit.toLowerCase();
    console.log(`\n📍 Fetching rules for: r/${subreddit}`);
    
    try {
        const response = await axios.get(
            `https://www.reddit.com/r/${subreddit}/about/rules.json`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            }
        );
        
        const data = response.data;
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
        console.error(`❌ Error fetching r/${subreddit}:`, error.message);
        
        if (error.response) {
            if (error.response.status === 404) {
                return res.status(404).json({ 
                    error: 'Subreddit not found',
                    success: false 
                });
            } else if (error.response.status === 403) {
                return res.status(403).json({ 
                    error: 'Subreddit is private or restricted',
                    success: false 
                });
            }
        }
        
        res.status(500).json({ 
            error: `Failed to fetch rules: ${error.message}`,
            success: false 
        });
    }
});

// ==========================================
// AI GENERATION - GENERATE POST
// ==========================================
app.post('/api/generate-post', async (req, res) => {
    try {
        const { subreddit, description, tone, rules } = req.body;
        
        console.log('\n🤖 Generating post for r/' + subreddit);
        
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ 
                success: false, 
                error: 'Gemini API key not configured' 
            });
        }
        
        const prompt = `You are an expert Reddit post creator. Create an engaging, high-quality post for r/${subreddit}.

**Subreddit Rules:**
${rules}

**User Request:**
${description}

**Tone:** ${tone}

**Instructions:**
1. Create a catchy, relevant title (follow subreddit rules)
2. Write engaging content that matches the tone
3. Ensure the post follows ALL subreddit rules
4. Make it natural and conversational
5. Include relevant details and context

Respond in JSON format:
{
  "title": "Your post title here",
  "content": "Your post content here"
}`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!generatedText) {
            throw new Error('No response from AI');
        }

        // Try to parse JSON response
        let post;
        try {
            const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                post = JSON.parse(jsonMatch[0]);
            } else {
                post = {
                    title: 'Generated Post',
                    content: generatedText
                };
            }
        } catch (parseError) {
            post = {
                title: 'Generated Post',
                content: generatedText
            };
        }

        console.log('✅ Post generated successfully');

        res.json({
            success: true,
            post: post
        });

    } catch (error) {
        console.error('❌ Generation error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate post: ' + error.message
        });
    }
});

// ==========================================
// AI GENERATION - OPTIMIZE POST
// ==========================================
app.post('/api/optimize-post', async (req, res) => {
    try {
        const { subreddit, postContent, rules } = req.body;
        
        console.log('\n⚡ Optimizing post for r/' + subreddit);
        
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ 
                success: false, 
                error: 'Gemini API key not configured' 
            });
        }
        
        const prompt = `You are a Reddit post optimization expert. Improve this post for r/${subreddit}.

**Subreddit Rules:**
${rules}

**Original Post:**
${postContent}

**Task:**
1. Ensure the post follows ALL subreddit rules
2. Improve clarity and readability
3. Make it more engaging and natural
4. Fix any grammar or formatting issues
5. Maintain the original intent and tone

Respond with ONLY the optimized post text (no explanations or additional commentary).`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const optimizedPost = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!optimizedPost) {
            throw new Error('No response from AI');
        }

        console.log('✅ Post optimized successfully');

        res.json({
            success: true,
            optimizedPost: optimizedPost.trim()
        });

    } catch (error) {
        console.error('❌ Optimization error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to optimize post: ' + error.message
        });
    }
});

// ==========================================
// DODO PAYMENTS - CREATE SESSION
// ==========================================
app.post('/api/dodo/create-session', async (req, res) => {
    try {
        const { userId, plan, email, amount, postsPerMonth, billingCycle, transactionId } = req.body;
        
        console.log('\n💳 Creating payment session:', { userId, plan, amount, mode: DODO_MODE });

        // ========== TEST MODE ==========
        if (DODO_MODE === 'test') {
            console.log('🧪 TEST MODE: Creating mock payment');
            
            const sessionId = `test_session_${transactionId}`;
            const mockPaymentUrl = `${FRONTEND_URL}/dashboard.html?payment=success&session_id=${sessionId}`;
            
            // Store in Supabase
            await supabase.from('payments').insert([{
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

            console.log('✅ Test session created');

            return res.json({
                success: true,
                paymentUrl: mockPaymentUrl,
                sessionId: sessionId,
                mode: 'TEST'
            });
        }

        // ========== PRODUCTION MODE ==========
        console.log('🚀 PRODUCTION MODE: Calling Dodo API');

        if (!DODO_API_KEY) {
            return res.status(400).json({ 
                success: false, 
                error: 'Dodo API key not configured' 
            });
        }

        // Correct Dodo Payments API structure
        const dodoPayload = {
            payment_link_id: getDodoPaymentLinkId(plan, billingCycle),
            customer_email: email,
            customer_id: userId,
            success_url: `${FRONTEND_URL}/dashboard.html?payment=success`,
            cancel_url: `${FRONTEND_URL}/dashboard.html?payment=cancelled`,
            metadata: {
                userId,
                plan,
                postsPerMonth,
                billingCycle,
                transactionId
            }
        };

        console.log('📤 Sending to Dodo:', dodoPayload);

        const dodoResponse = await axios.post(
            'https://api.dodopayments.com/v1/payment_links/checkout',
            dodoPayload,
            {
                headers: {
                    'Authorization': `Bearer ${DODO_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const sessionData = dodoResponse.data;
        console.log('✅ Dodo response:', sessionData);

        // Store in Supabase
        await supabase.from('payments').insert([{
            user_id: userId,
            transaction_id: transactionId,
            session_id: sessionData.id || transactionId,
            plan_type: plan,
            amount: amount,
            posts_per_month: postsPerMonth,
            billing_cycle: billingCycle,
            status: 'pending',
            customer_email: email,
            created_at: new Date().toISOString()
        }]);

        res.json({
            success: true,
            paymentUrl: sessionData.url,
            sessionId: sessionData.id
        });
        
    } catch (error) {
        console.error('❌ Payment error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response?.data?.message || 'Failed to create payment session'
        });
    }
});

// Helper: Get Dodo Payment Link ID
function getDodoPaymentLinkId(plan, billingCycle) {
    const linkMap = {
        starter_monthly: 'pdt_XocDrGw3HxTb0nD7nyYyl',
        starter_yearly: 'pdt_RBEfQWVlN9bnWihieBQSt',
        professional_monthly: 'pdt_dumBrrIeNTtENukKXHiGh',
        professional_yearly: 'pdt_gBCE38rNQm8x30iqAltc6',
        enterprise_monthly: 'pdt_UHLjlc1qPLgSvK1ubHjgJ',
        enterprise_yearly: 'pdt_E9rxQwDMZahet7kADcna5'
    };
    
    return linkMap[`${plan}_${billingCycle}`] || linkMap['starter_monthly'];
}

// ==========================================
// DODO WEBHOOK
// ==========================================
app.post('/api/dodo/webhook', async (req, res) => {
    try {
        const event = req.body;
        
        console.log('\n🔔 Webhook received:', event.type);

        if (event.type === 'payment.succeeded' || event.type === 'checkout.session.completed') {
            const metadata = event.data.metadata;
            
            if (!metadata || !metadata.userId) {
                console.error('❌ No metadata in webhook');
                return res.json({ received: true });
            }

            console.log('💰 Payment completed for user:', metadata.userId);

            // Update payment status
            await supabase
                .from('payments')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString()
                })
                .eq('user_id', metadata.userId)
                .eq('plan_type', metadata.plan);

            // Activate user plan
            const expiryDate = new Date();
            if (metadata.billingCycle === 'yearly') {
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            } else {
                expiryDate.setMonth(expiryDate.getMonth() + 1);
            }

            await supabase
                .from('user_plans')
                .upsert({
                    user_id: metadata.userId,
                    plan_type: metadata.plan,
                    posts_per_month: metadata.postsPerMonth,
                    credits_remaining: metadata.postsPerMonth,
                    billing_cycle: metadata.billingCycle,
                    status: 'active',
                    activated_at: new Date().toISOString(),
                    expires_at: expiryDate.toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            console.log('✅ Plan activated for user:', metadata.userId);
        }

        res.json({ received: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ==========================================
// USER PLAN MANAGEMENT
// ==========================================

// Get user's current plan
app.get('/api/user/plan/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        console.log('📊 Fetching plan for user:', userId);
        
        const { data: plan, error } = await supabase
            .from('user_plans')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('❌ Error fetching plan:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch plan' 
            });
        }

        // No plan found
        if (!plan) {
            return res.json({
                success: true,
                hasPlan: false,
                plan: {
                    name: 'Free',
                    tier: 'free',
                    credits: 10,
                    postsPerMonth: 10,
                    activated: false
                }
            });
        }

        // Check if expired
        const expiresAt = new Date(plan.expires_at);
        const isExpired = expiresAt < new Date();

        if (isExpired) {
            await supabase
                .from('user_plans')
                .update({ status: 'expired' })
                .eq('user_id', userId);

            return res.json({
                success: true,
                hasPlan: false,
                isExpired: true,
                plan: {
                    name: 'Free',
                    tier: 'free',
                    credits: 10,
                    postsPerMonth: 10,
                    activated: false
                }
            });
        }

        // Return active plan
        res.json({
            success: true,
            hasPlan: true,
            plan: {
                name: plan.plan_type.charAt(0).toUpperCase() + plan.plan_type.slice(1),
                tier: plan.plan_type,
                credits: plan.credits_remaining,
                postsPerMonth: plan.posts_per_month,
                billingCycle: plan.billing_cycle,
                activated: true,
                activatedDate: plan.activated_at,
                expiryDate: plan.expires_at,
                status: plan.status
            }
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Save/Update user plan
app.post('/api/user/plan', async (req, res) => {
    try {
        const { userId, planType, postsPerMonth, credits, billingCycle, amount } = req.body;
        
        console.log('💾 Saving plan for user:', userId);
        
        if (!userId || !planType || !postsPerMonth || !credits) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        const expiryDate = new Date();
        if (billingCycle === 'yearly') {
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        } else {
            expiryDate.setMonth(expiryDate.getMonth() + 1);
        }

        const { error } = await supabase
            .from('user_plans')
            .upsert({
                user_id: userId,
                plan_type: planType,
                posts_per_month: postsPerMonth,
                credits_remaining: credits,
                billing_cycle: billingCycle,
                amount: amount,
                status: 'active',
                activated_at: new Date().toISOString(),
                expires_at: expiryDate.toISOString(),
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'user_id'
            });

        if (error) {
            console.error('❌ Error saving plan:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to save plan' 
            });
        }

        console.log('✅ Plan saved successfully');

        res.json({
            success: true,
            message: 'Plan activated successfully',
            expiresAt: expiryDate.toISOString()
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Deduct credit
app.post('/api/user/plan/deduct-credit', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing userId' 
            });
        }

        const { data: plan, error: fetchError } = await supabase
            .from('user_plans')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (fetchError || !plan) {
            return res.status(404).json({ 
                success: false, 
                error: 'Plan not found' 
            });
        }

        if (plan.credits_remaining <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No credits remaining' 
            });
        }

        const { error: updateError } = await supabase
            .from('user_plans')
            .update({ 
                credits_remaining: plan.credits_remaining - 1,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (updateError) {
            console.error('❌ Error updating credits:', updateError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to update credits' 
            });
        }

        res.json({
            success: true,
            creditsRemaining: plan.credits_remaining - 1
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        error: err.message,
        endpoint: req.path
    });
});

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
    console.log(`🚀 Port: ${PORT}`);
    console.log(`💳 Dodo Mode: ${DODO_MODE.toUpperCase()}`);
    console.log(`🌐 Frontend: ${FRONTEND_URL}`);
    console.log(`🤖 Gemini API: ${GEMINI_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
    console.log(`${'='.repeat(70)}\n`);
});

module.exports = app;