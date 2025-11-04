const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================
// ==========================================
// MIDDLEWARE
// ==========================================

// *** THIS IS THE FIX ***
// More specific CORS configuration to allow preflight requests
// and the Authorization header.
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allow all standard methods + OPTIONS
    allowedHeaders: ['Content-Type', 'Authorization'] // Explicitly allow these headers
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));
// ==========================================
// CONFIGURATION
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DODO_API_KEY = process.env.DODO_API_KEY || '';
const DODO_MODE = process.env.DODO_MODE || 'test';
const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.BACKEND_URL;

// Supabase Admin Client (uses SERVICE KEY for admin tasks)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

// ==========================================
// HELPER: Get Auth User from Request
// ==========================================
const getAuthUser = async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        throw new Error('No authorization header');
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) {
        throw new Error(error.message);
    }
    if (!user) {
        throw new Error('User not found');
    }
    return user;
};

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ Server is working!',
        mode: DODO_MODE,
        features: ['Reddit Generation', 'Post Optimization', 'Dodo Payments', 'User Management'],
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.json({ message: 'ReddiGen API Server', status: 'online' });
});

// ==========================================
// USER PROFILE MANAGEMENT
// ==========================================

// GET user profile (profile, plan, and history)
app.get('/api/user/data', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

        const { data: plan, error: planError } = await supabase
            .from('user_plans')
            .select('*')
            .eq('user_id', user.id)
            .single();

        const { data: history, error: historyError } = await supabase
            .from('post_history')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (profileError || planError || historyError) {
             console.error('Error fetching user data:', profileError || planError || historyError);
        }

        res.json({
            success: true,
            profile: profile || null,
            plan: plan || null,
            history: history || []
        });

    } catch (error) {
        console.error('❌ Error in /api/user/data:', error.message);
        res.status(401).json({ success: false, error: 'Authentication failed' });
    }
});

// UPDATE user profile (Display Name, Bio)
app.put('/api/user/profile', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { displayName, bio } = req.body;

        const { data, error } = await supabase
            .from('user_profiles')
            .update({ 
                display_name: displayName,
                bio: bio,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, profile: data });

    } catch (error) {
        console.error('❌ Error updating profile:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// REDDIT RULES ENDPOINT (FIXED)
// ==========================================
app.get('/api/reddit-rules/:subreddit', async (req, res) => {
    const subreddit = req.params.subreddit.toLowerCase();
    console.log(`\n📍 Fetching rules for: r/${subreddit}`);
    
    try {
        const response = await axios.get(
            `https://www.reddit.com/r/${subreddit}/about/rules.json`,
            {
                headers: {
                    // Using a common user-agent
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
                },
                timeout: 8000
            }
        );
        
        const data = response.data;
        let rulesText = '';
        
        if (data.rules && Array.isArray(data.rules)) {
            data.rules.forEach((rule, index) => {
                rulesText += `**Rule ${index + 1}: ${rule.short_name}**\n${rule.description}\n\n`;
            });
        }
        
        console.log(`✅ Got ${data.rules ? data.rules.length : 0} rules for r/${subreddit}`);
        
        res.json({
            subreddit: subreddit,
            rules: rulesText || 'No specific rules found. Standard Reddit etiquette applies.',
            success: true
        });
        
    } catch (error) {
        console.error(`❌ Error fetching r/${subreddit}:`, error.message);
        
        if (error.response) {
            if (error.response.status === 404) {
                return res.status(404).json({ error: 'Subreddit not found', success: false });
            } else if (error.response.status === 403) {
                return res.status(403).json({ error: 'Subreddit is private or restricted', success: false });
            }
        }
        
        res.status(500).json({ error: 'Failed to fetch rules. Reddit may be unavailable.', success: false });
    }
});

// ==========================================
// AI GENERATION - GENERATE POST (FIXED)
// ==========================================
app.post('/api/generate-post', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { subreddit, topic, style, rules } = req.body;
        
        console.log('\n🤖 Generating post for r/' + subreddit);
        
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }
        
        // Check user credits
        const { data: plan, error: planError } = await supabase
            .from('user_plans')
            .select('credits_remaining')
            .eq('user_id', user.id)
            .single();
            
        if (planError || !plan) throw new Error('Could not verify user plan.');
        if (plan.credits_remaining <= 0) {
            return res.status(402).json({ success: false, error: 'No credits remaining.' });
        }
        
        const prompt = `You are an expert Reddit post creator. Create an engaging, high-quality post for r/${subreddit}.

**Subreddit Rules to Follow:**
${rules}

**User Request:**
${topic}

**Content Style:** ${style}

**Instructions:**
1.  Create a catchy, relevant title.
2.  Write engaging content that matches the requested style.
3.  Ensure the post follows ALL provided subreddit rules.
4.  Make the content natural and conversational, not like an ad.
5.  If the style is "Question-based", make the title a question.

**Your response MUST be a single, valid JSON object in the following format. Do not include '` + "```json" + `', '` + "```" + `', or any other text outside the JSON object.**
{
  "title": "Your generated post title here",
  "content": "Your generated post content here, written in markdown-safe text."
}`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!generatedText) throw new Error('No response from AI');

        let post;
        try {
            post = JSON.parse(generatedText);
        } catch (parseError) {
            console.error("❌ Gemini JSON parse error, falling back:", parseError);
            post = { title: 'Generated Post (Fallback)', content: generatedText };
        }

        // Deduct credit
        const { error: deductError } = await supabase.rpc('decrement_credits', { p_user_id: user.id, p_amount: 1 });
        if (deductError) throw new Error('Failed to deduct credit.');
        
        // Save to history
        const { data: historyItem, error: historyError } = await supabase
            .from('post_history')
            .insert({
                user_id: user.id,
                subreddit: subreddit,
                title: post.title,
                content: post.content,
                post_type: 'generated'
            })
            .select()
            .single();
            
        if (historyError) throw new Error('Failed to save history.');
            
        console.log('✅ Post generated and saved');

        res.json({
            success: true,
            post: post,
            historyItem: historyItem,
            creditsRemaining: plan.credits_remaining - 1
        });

    } catch (error) {
        console.error('❌ Generation error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to generate post: ' + error.message });
    }
});

// ==========================================
// AI GENERATION - OPTIMIZE POST (FIXED)
// ==========================================
app.post('/api/optimize-post', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { subreddit, content, style, rules } = req.body;
        
        console.log('\n⚡ Optimizing post for r/' + subreddit);
        
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }
        
        // Check user credits
        const { data: plan, error: planError } = await supabase
            .from('user_plans')
            .select('credits_remaining')
            .eq('user_id', user.id)
            .single();
            
        if (planError || !plan) throw new Error('Could not verify user plan.');
        if (plan.credits_remaining <= 0) {
            return res.status(402).json({ success: false, error: 'No credits remaining.' });
        }

        const prompt = `You are a Reddit post optimization expert. Improve this post for r/${subreddit}.

**Subreddit Rules to Follow:**
${rules}

**Original Post:**
${content}

**Optimization Style:** ${style}

**Task:**
1.  Rewrite the post to ensure it follows ALL subreddit rules.
2.  Improve clarity, readability, and engagement based on the chosen style.
3.  Fix any grammar or formatting issues.
4.  Maintain the original post's core intent.
5.  Respond with ONLY the optimized post text (no title, no explanations, no "Here is the optimized post:"). Just the raw, improved content.`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        const optimizedPost = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!optimizedPost) throw new Error('No response from AI');

        // Deduct credit
        const { error: deductError } = await supabase.rpc('decrement_credits', { p_user_id: user.id, p_amount: 1 });
        if (deductError) throw new Error('Failed to deduct credit.');
        
        // Save to history
        const { data: historyItem, error: historyError } = await supabase
            .from('post_history')
            .insert({
                user_id: user.id,
                subreddit: subreddit,
                title: `Optimized post for r/${subreddit}`,
                content: optimizedPost.trim(),
                post_type: 'optimized'
            })
            .select()
            .single();
            
        if (historyError) throw new Error('Failed to save history.');

        console.log('✅ Post optimized and saved');

        res.json({
            success: true,
            optimizedPost: optimizedPost.trim(),
            historyItem: historyItem,
            creditsRemaining: plan.credits_remaining - 1
        });

    } catch (error) {
        console.error('❌ Optimization error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to optimize post: ' + error.message });
    }
});

// ==========================================
// DODO PAYMENTS - CREATE SESSION (FIXED)
// ==========================================
app.post('/api/dodo/create-session', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { plan, postsPerMonth, billingCycle, amount, transactionId } = req.body;
        
        console.log('\n💳 Creating payment session:', { userId: user.id, plan, amount, mode: DODO_MODE });

        // Store pending payment in database
        const { error: dbError } = await supabase.from('payments').insert([{
            user_id: user.id,
            transaction_id: transactionId,
            plan_type: plan,
            amount: amount,
            posts_per_month: postsPerMonth,
            billing_cycle: billingCycle,
            status: 'pending',
            customer_email: user.email,
            created_at: new Date().toISOString()
        }]);

        if (dbError) throw dbError;

        // ========== TEST MODE ==========
        if (DODO_MODE === 'test') {
            console.log('🧪 TEST MODE: Creating mock payment');
            const sessionId = `test_session_${transactionId}`;
            
            // In test mode, we manually call the webhook logic to simulate success
            await activateUserPlan(user.id, transactionId, plan, postsPerMonth, billingCycle, amount);
            
            const mockPaymentUrl = `${FRONTEND_URL}/dashboard.html?payment=success&session_id=${sessionId}`;
            
            return res.json({
                success: true,
                paymentUrl: mockPaymentUrl,
                sessionId: sessionId,
                mode: 'TEST'
            });
        }

        // ========== PRODUCTION MODE ==========
        console.log('🚀 PRODUCTION MODE: Calling Dodo API');
        if (!DODO_API_KEY) throw new Error('Dodo API key not configured');

        const dodoPayload = {
            amount: Math.round(amount * 100), // Amount in cents/paise
            currency: 'USD', // Or your currency
            success_url: `${FRONTEND_URL}/dashboard.html?payment=success&txn=${transactionId}`,
            cancel_url: `${FRONTEND_URL}/dashboard.html?payment=cancelled`,
            notify_url: `${BACKEND_URL}/api/dodo/webhook`,
            customer_email: user.email, // <-- FIXED
            metadata: { // <-- FIXED
                userId: user.id,
                planType: plan,
                postsPerMonth: postsPerMonth,
                billingCycle: billingCycle,
                transactionId: transactionId,
                email: user.email
            }
        };

        const dodoResponse = await axios.post(
            'https://api.dodopayments.com/v1/payment_links/checkout', // Using your original endpoint
            dodoPayload,
            {
                headers: {
                    'Authorization': `Bearer ${DODO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        const sessionData = dodoResponse.data;
        
        // Update payment record with Dodo's session ID
        await supabase
            .from('payments')
            .update({ session_id: sessionData.id })
            .eq('transaction_id', transactionId);

        console.log('✅ Dodo session created:', sessionData.id);

        res.json({
            success: true,
            paymentUrl: sessionData.url, // Dodo's checkout URL
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

// ==========================================
// DODO WEBHOOK (FIXED)
// ==========================================

// Helper function to activate a user's plan
async function activateUserPlan(userId, transactionId, planType, postsPerMonth, billingCycle, amount) {
    console.log(`🚀 Activating plan for user ${userId}`);
    
    const expiryDate = new Date();
    if (billingCycle === 'yearly') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    // 1. Update the user_plans table
    const { error: planError } = await supabase
        .from('user_plans')
        .upsert({
            user_id: userId,
            plan_type: planType,
            posts_per_month: parseInt(postsPerMonth),
            credits_remaining: parseInt(postsPerMonth),
            billing_cycle: billingCycle,
            amount: parseFloat(amount),
            status: 'active',
            activated_at: new Date().toISOString(),
            expires_at: expiryDate.toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        
    if (planError) {
        console.error('❌ Error activating plan:', planError);
        return false;
    }

    // 2. Update the payments table
    const { error: paymentError } = await supabase
        .from('payments')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString()
        })
        .eq('transaction_id', transactionId);

    if (paymentError) {
        console.error('❌ Error updating payment status:', paymentError);
        return false;
    }
    
    console.log(`✅ Plan activated for user: ${userId}`);
    return true;
}

app.post('/api/dodo/webhook', async (req, res) => {
    const event = req.body;
    console.log('\n🔔 Webhook received:', event.type);
    
    // Log the full event for debugging
    // console.log(JSON.stringify(event, null, 2));

    try {
        if (event.type === 'checkout.session.completed') {
            // FIXED: Metadata is in event.data.object.metadata
            const metadata = event.data?.object?.metadata;
            
            if (!metadata || !metadata.userId || !metadata.transactionId) {
                console.error('❌ Webhook missing metadata:', metadata);
                return res.status(400).json({ error: 'Missing metadata' });
            }

            console.log('💰 Payment completed for user:', metadata.userId);

            // Activate the plan
            await activateUserPlan(
                metadata.userId,
                metadata.transactionId,
                metadata.planType,
                metadata.postsPerMonth,
                metadata.billingCycle,
                event.data.object.amount_total / 100 // Convert from cents
            );
        }

        res.json({ received: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ==========================================
// USER AUTH / SETTINGS ENDPOINTS
// ==========================================

// Change Password
app.post('/api/auth/change-password', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        const { error } = await supabase.auth.admin.updateUserById(
            user.id,
            { password: newPassword }
        );
        
        if (error) throw error;

        res.json({ success: true, message: 'Password updated successfully' });

    } catch (error) {
        console.error('❌ Change password error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Logout All Devices
app.post('/api/auth/logout-all', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        // This signs out the user from all sessions, including the current one.
        const { error } = await supabase.auth.admin.signOut(user.id);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Signed out from all devices' });

    } catch (error) {
        console.error('❌ Logout all error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete Account
app.post('/api/auth/delete-account', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { password } = req.body;

        // Verify password before deleting
        const { error: loginError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: password,
        });

        if (loginError) {
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }

        // Delete the user
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        if (deleteError) throw deleteError;

        res.json({ success: true, message: 'Account deleted successfully' });

    } catch (error) {
        console.error('❌ Delete account error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: err.message });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ ReddiGen Backend RUNNING!`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`💳 Dodo Mode: ${DODO_MODE.toUpperCase()}`);
    console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
    console.log(`📡 Backend URL: ${BACKEND_URL}`);
    console.log(`🤖 Gemini API: ${GEMINI_API_KEY ? '✅ Configured' : '❌ NOT CONFIGURED'}`);
    console.log(`🔑 Dodo API: ${DODO_API_KEY ? '✅ Configured' : '❌ NOT CONFIGURED'}`);
    console.log(`💾 Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ NOT CONFIGURED'}`);
    console.log(`${'='.repeat(80)}\n`);
});

module.exports = app;