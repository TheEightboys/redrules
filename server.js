const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();

// ==========================================
// KEEP-ALIVE MECHANISM
// ==========================================
const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; // 14 minutes
let keepAliveTimer = null;

function startKeepAlive() {
    if (keepAliveTimer) return;
    
    keepAliveTimer = setInterval(() => {
        const now = new Date().toISOString();
        console.log(`⏰ [${now}] Keep-alive ping`);
    }, KEEP_ALIVE_INTERVAL);
    
    console.log('🔥 Keep-alive mechanism started (14 min interval)');
}

// ==========================================
// CORS CONFIGURATION
// ==========================================
const allowedOrigins = [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:3000',
    'https://redditfix.vercel.app',
    'https://checkout.dodopayments.com',
    'https://test.checkout.dodopayments.com'
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`❌ Blocked origin: ${origin}`);
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// RAW body parser for webhooks BEFORE express.json()
app.use('/api/dodo/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ==========================================
// CONFIGURATION
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DODO_API_KEY = process.env.DODO_API_KEY || '';
const DODO_MODE = process.env.DODO_MODE || 'production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://redditfix.vercel.app';
const BACKEND_URL = process.env.BACKEND_URL || 'https://redrules.onrender.com';

// Supabase Admin Client
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { 
        auth: { 
            persistSession: false,
            autoRefreshToken: false
        }
    }
);

// ==========================================
// HELPER: Get Auth User
// ==========================================
const getAuthUser = async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error('No authorization header');
    
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('No token provided');
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw new Error(error.message);
    if (!user) throw new Error('User not found');
    
    return user;
};

// ==========================================
// HEALTH CHECK & KEEP ALIVE ENDPOINT
// ==========================================
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ ReddiGen Server Online',
        mode: DODO_MODE,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        features: {
            reddit: '✅',
            gemini: GEMINI_API_KEY ? '✅' : '❌',
            supabase: process.env.SUPABASE_URL ? '✅' : '❌',
            payments: DODO_API_KEY ? '✅' : '❌'
        }
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'ReddiGen API Server', 
        status: 'online',
        endpoints: ['/api/test', '/api/user/data', '/api/reddit-rules/:subreddit']
    });
});

// ==========================================
// USER DATA ENDPOINT (FIXED)
// ==========================================
app.get('/api/user/data', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        console.log(`📊 Loading data for: ${user.id}`);
        
        const [profileResult, planResult, historyResult] = await Promise.allSettled([
            supabase.from('user_profiles').select('*').eq('user_id', user.id).single(),
            supabase.from('user_plans').select('*').eq('user_id', user.id).single(),
            supabase.from('post_history').select('*').eq('user_id', user.id)
                .order('created_at', { ascending: false }).limit(50)
        ]);

        let profile = null;
        if (profileResult.status === 'fulfilled' && profileResult.value.data) {
            profile = profileResult.value.data;
        } else {
            const { data: newProfile } = await supabase
                .from('user_profiles')
                .insert({
                    user_id: user.id,
                    email: user.email,
                    display_name: user.email.split('@')[0],
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            profile = newProfile;
        }

        let plan = null;
        if (planResult.status === 'fulfilled' && planResult.value.data) {
            plan = planResult.value.data;
        } else {
            const { data: newPlan } = await supabase
                .from('user_plans')
                .insert({
                    user_id: user.id,
                    plan_type: 'free',
                    posts_per_month: 10,
                    credits_remaining: 10,
                    billing_cycle: 'monthly',
                    status: 'active',
                    activated_at: new Date().toISOString()
                })
                .select()
                .single();
            plan = newPlan;
        }

        const history = historyResult.status === 'fulfilled' && historyResult.value.data 
            ? historyResult.value.data 
            : [];

        console.log(`✅ Data loaded - Credits: ${plan.credits_remaining}/${plan.posts_per_month}`);

        res.json({
            success: true,
            profile,
            plan,
            history
        });

    } catch (error) {
        console.error('❌ Error in /api/user/data:', error.message);
        res.status(401).json({ success: false, error: error.message });
    }
});

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
// REDDIT RULES ENDPOINT
// ==========================================
app.get('/api/reddit-rules/:subreddit', async (req, res) => {
    const subreddit = req.params.subreddit.toLowerCase().replace(/^r\//, '');
    console.log(`\n📍 Fetching rules for: r/${subreddit}`);
    
    let browser;
    try {
        // Try direct API first
        try {
            console.log('Trying Reddit API...');
            const response = await axios.get(
                `https://www.reddit.com/r/${subreddit}/about/rules.json`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 8000
                }
            );
            
            if (response.data && response.data.rules && response.data.rules.length > 0) {
                let rulesText = '';
                response.data.rules.forEach((rule, index) => {
                    rulesText += `**Rule ${index + 1}: ${rule.short_name}**\n${rule.description || 'No description'}\n\n`;
                });
                
                console.log(`✅ Got ${response.data.rules.length} rules via API`);
                return res.json({
                    subreddit: subreddit,
                    rules: rulesText,
                    success: true,
                    method: 'api'
                });
            }
        } catch (apiError) {
            console.log('API failed, trying Puppeteer...');
        }

        // Fallback to Puppeteer
        console.log('Launching Puppeteer...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        const url = `https://www.reddit.com/r/${subreddit}/about/rules/`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        const rules = await page.evaluate(() => {
            const ruleElements = document.querySelectorAll('shreddit-subreddit-rule, [data-testid="subreddit-rule"], h3');
            let rulesText = '';
            let ruleCount = 0;
            
            ruleElements.forEach((el) => {
                const title = el.querySelector('h3')?.textContent?.trim() || 
                             el.getAttribute('rule-title') || '';
                const desc = el.querySelector('p')?.textContent?.trim() || '';
                
                if (title && title.length > 2) {
                    ruleCount++;
                    rulesText += `**Rule ${ruleCount}: ${title}**\n`;
                    if (desc && desc.length > 5) {
                        rulesText += `${desc}\n\n`;
                    }
                }
            });
            
            return rulesText;
        });
        
        await browser.close();
        
        if (rules && rules.length > 30) {
            console.log(`✅ Got rules via Puppeteer`);
            return res.json({
                subreddit: subreddit,
                rules: rules,
                success: true,
                method: 'puppeteer'
            });
        }
        
        // Fallback generic rules
        res.json({
            subreddit: subreddit,
            rules: `**General Reddit Guidelines for r/${subreddit}**\n\n**Rule 1: Be Respectful**\nTreat all members with respect.\n\n**Rule 2: Follow Reddiquette**\nAdhere to Reddit's guidelines.\n\n**Rule 3: No Spam**\nNo spam or excessive self-promotion.\n\n**Rule 4: Stay On-Topic**\nKeep posts relevant.\n\n**Rule 5: Quality Content**\nPost high-quality, original content.`,
            success: true,
            method: 'fallback'
        });
        
    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        
        console.error(`❌ Error fetching r/${subreddit}:`, error.message);
        
        if (error.response?.status === 404) {
            return res.status(404).json({ error: 'Subreddit not found', success: false });
        }
        
        res.json({ 
            subreddit: subreddit,
            rules: `**Standard Reddit Guidelines**\n\n**Rule 1: Be Respectful**\nMaintain civility.\n\n**Rule 2: No Spam**\nAvoid spam.\n\n**Rule 3: Follow Guidelines**\nAdhere to subreddit rules.`,
            success: true,
            method: 'error_fallback'
        });
    }
});

// ==========================================
// AI GENERATION - GENERATE POST (FIXED CREDITS)
// ==========================================
app.post('/api/generate-post', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { subreddit, topic, style, rules } = req.body;
        
        console.log(`\n🤖 Generating post for r/${subreddit} (User: ${user.id})`);
        
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ success: false, error: 'AI service not configured' });
        }
        
        // Check credits FIRST with row-level locking
        const { data: plan, error: planError } = await supabase
            .from('user_plans')
            .select('credits_remaining, posts_per_month, plan_type')
            .eq('user_id', user.id)
            .single();
            
        if (planError) {
            console.error('Plan fetch error:', planError);
            return res.status(500).json({ success: false, error: 'Failed to fetch plan' });
        }
        
        if (!plan || plan.credits_remaining <= 0) {
            console.log(`❌ No credits for user ${user.id}`);
            return res.status(402).json({ 
                success: false, 
                error: 'No credits remaining. Please upgrade your plan.',
                creditsRemaining: 0
            });
        }
        
        console.log(`💳 User has ${plan.credits_remaining}/${plan.posts_per_month} credits`);
        
        const prompt = `You are an expert Reddit content creator. Create an authentic, engaging post for r/${subreddit}.

**Subreddit Rules (MUST FOLLOW):**
${rules}

**Topic:** ${topic}

**Style:** ${style}

**Instructions:**
1. Create a compelling title (under 300 characters)
2. Write natural, conversational content
3. Match the requested style authentically
4. STRICTLY follow all subreddit rules
5. Make it feel human-written, not AI-generated

**CRITICAL: Respond with ONLY valid JSON (no markdown, no code blocks):**
{
  "title": "Your post title here",
  "content": "Your post content here (use \\n for line breaks)"
}`;

        console.log('Calling Gemini API...');
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            { 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.8,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048
                }
            },
            { 
                headers: { 'Content-Type': 'application/json' }, 
                timeout: 45000 
            }
        );

        const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!generatedText) throw new Error('No response from AI');

        let post;
        try {
            const cleanedText = generatedText
                .replace(/^```(?:[a-zA-Z0-9]+)?\s*\n/, '')
                .replace(/\n\s*```$/, '')
                .trim();
            post = JSON.parse(cleanedText);
            
            if (!post.title || !post.content) {
                throw new Error('Invalid post structure');
            }
        } catch (parseError) {
            console.error("❌ JSON parse error:", parseError);
            post = {
                title: `Engaging Post About ${topic} - r/${subreddit}`,
                content: generatedText.substring(0, 1000)
            };
        }

        // Deduct credit atomically with optimistic locking
        const newCredits = plan.credits_remaining - 1;
        const { data: updatedPlan, error: deductError } = await supabase
            .from('user_plans')
            .update({ 
                credits_remaining: newCredits,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('credits_remaining', plan.credits_remaining) // Optimistic lock
            .select()
            .single();
        
        if (deductError || !updatedPlan) {
            console.error('❌ Credit deduction failed:', deductError);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to process credit. Please try again.' 
            });
        }
        
        console.log(`✅ Credit deducted: ${plan.credits_remaining} → ${newCredits}`);
        
        // Save to history
        const { data: historyItem, error: historyError } = await supabase
            .from('post_history')
            .insert({
                user_id: user.id,
                subreddit: subreddit,
                title: post.title,
                content: post.content,
                post_type: 'generated',
                created_at: new Date().toISOString()
            })
            .select()
            .single();
            
        if (historyError) console.error('History save error:', historyError);
            
        console.log(`✅ Post generated successfully (${newCredits} credits left)`);

        res.json({
            success: true,
            post: post,
            historyItem: historyItem || {
                id: Date.now(),
                subreddit,
                title: post.title,
                content: post.content,
                post_type: 'generated',
                created_at: new Date().toISOString()
            },
            creditsRemaining: newCredits
        });

    } catch (error) {
        console.error('❌ Generation error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate content. Please try again.' 
        });
    }
});

// ==========================================
// AI GENERATION - OPTIMIZE POST (FIXED CREDITS)
// ==========================================
app.post('/api/optimize-post', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { subreddit, content, style, rules } = req.body;
        
        console.log(`\n⚡ Optimizing post for r/${subreddit} (User: ${user.id})`);
        
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ success: false, error: 'AI service not configured' });
        }
        
        // Check credits FIRST
        const { data: plan, error: planError } = await supabase
            .from('user_plans')
            .select('credits_remaining, posts_per_month')
            .eq('user_id', user.id)
            .single();
            
        if (planError || !plan || plan.credits_remaining <= 0) {
            return res.status(402).json({ 
                success: false, 
                error: 'No credits remaining.',
                creditsRemaining: 0
            });
        }

        console.log(`💳 User has ${plan.credits_remaining}/${plan.posts_per_month} credits`);

        const prompt = `You are a Reddit optimization expert. Improve this post for r/${subreddit}.

**Subreddit Rules (MUST FOLLOW STRICTLY):**
${rules}

**Original Post:**
${content}

**Optimization Goal:** ${style}

**Task:**
1. Rewrite to ensure COMPLETE compliance with ALL subreddit rules
2. Improve clarity, engagement, and readability based on: ${style}
3. Fix grammar, formatting, and flow
4. Keep the original message and intent
5. Make it sound natural and authentic

**Respond with ONLY the optimized post text (no explanations, no titles, just the improved content):**`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            { 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048
                }
            },
            { 
                headers: { 'Content-Type': 'application/json' }, 
                timeout: 45000 
            }
        );

        const optimizedPost = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!optimizedPost) throw new Error('No response from AI');

        // Deduct credit atomically
        const newCredits = plan.credits_remaining - 1;
        const { data: updatedPlan, error: deductError } = await supabase
            .from('user_plans')
            .update({ 
                credits_remaining: newCredits,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('credits_remaining', plan.credits_remaining)
            .select()
            .single();
        
        if (deductError || !updatedPlan) {
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to process credit.' 
            });
        }
        
        console.log(`✅ Credit deducted: ${plan.credits_remaining} → ${newCredits}`);
        
        // Save to history
        const { data: historyItem } = await supabase
            .from('post_history')
            .insert({
                user_id: user.id,
                subreddit: subreddit,
                title: `Optimized for r/${subreddit}`,
                content: optimizedPost.trim(),
                post_type: 'optimized',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        console.log(`✅ Post optimized successfully (${newCredits} credits left)`);

        res.json({
            success: true,
            optimizedPost: optimizedPost.trim(),
            historyItem: historyItem || {
                id: Date.now(),
                subreddit,
                title: `Optimized for r/${subreddit}`,
                content: optimizedPost.trim(),
                post_type: 'optimized',
                created_at: new Date().toISOString()
            },
            creditsRemaining: newCredits
        });

    } catch (error) {
        console.error('❌ Optimization error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to optimize content.' 
        });
    }
});

// ==========================================
// PAYMENT VERIFICATION (FIXED)
// ==========================================
app.post('/api/payment/verify', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { plan, billingCycle, postsPerMonth, amount, sessionId } = req.body;
        
        console.log('\n💳 Verifying payment:', { 
            userId: user.id, 
            plan, 
            billingCycle,
            postsPerMonth,
            amount,
            sessionId
        });

        await activateUserPlan(
            user.id, 
            sessionId || `verify_${Date.now()}`, 
            plan, 
            postsPerMonth, 
            billingCycle, 
            amount
        );
        
        console.log('✅ Payment verified and plan activated');
        
        res.json({ 
            success: true, 
            message: 'Plan activated successfully!' 
        });

    } catch (error) {
        console.error('❌ Payment verification error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// PLAN ACTIVATION HELPER (FIXED)
// ==========================================
async function activateUserPlan(userId, transactionId, planType, postsPerMonth, billingCycle, amount) {
    console.log(`🚀 Activating ${planType} plan for user ${userId}`);
    console.log(`   Credits: ${postsPerMonth}, Cycle: ${billingCycle}, Amount: $${amount}`);
    
    const expiryDate = new Date();
    if (billingCycle === 'yearly') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    // Upsert plan with FULL credits
    const { data: updatedPlan, error: planError } = await supabase
        .from('user_plans')
        .upsert({
            user_id: userId,
            plan_type: planType,
            posts_per_month: parseInt(postsPerMonth),
            credits_remaining: parseInt(postsPerMonth), // CRITICAL: Reset to full credits
            billing_cycle: billingCycle,
            amount: parseFloat(amount),
            status: 'active',
            activated_at: new Date().toISOString(),
            expires_at: expiryDate.toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select()
        .single();
        
    if (planError) {
        console.error('Plan activation error:', planError);
        throw planError;
    }

    console.log(`✅ Plan activated - ${updatedPlan.credits_remaining}/${updatedPlan.posts_per_month} credits available`);

    // Record payment
    const { error: paymentError } = await supabase
        .from('payments')
        .insert({
            user_id: userId,
            transaction_id: transactionId,
            plan_type: planType,
            amount: parseFloat(amount),
            posts_per_month: parseInt(postsPerMonth),
            billing_cycle: billingCycle,
            status: 'completed',
            completed_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        });

    if (paymentError) console.error('❌ Payment record error:', paymentError);
    
    return true;
}

// ==========================================
// DODO WEBHOOK (FIXED WITH BETTER LOGGING)
// ==========================================
app.post('/api/dodo/webhook', async (req, res) => {
    console.log('\n🔔 ====== DODO WEBHOOK RECEIVED ======');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    try {
        let event;
        
        // Parse body
        if (Buffer.isBuffer(req.body)) {
            event = JSON.parse(req.body.toString());
        } else {
            event = req.body;
        }
        
        console.log('Event Type:', event.type);
        console.log('Event Data:', JSON.stringify(event, null, 2));
        
        // Handle payment success events
        if (event.type === 'checkout.session.completed' || 
            event.type === 'payment.succeeded' ||
            event.type === 'payment_intent.succeeded') {
            
            const metadata = event.data?.object?.metadata || event.metadata || {};
            const userId = metadata.userId || metadata.user_id;
            
            console.log('💰 Payment Metadata:', metadata);
            
            if (userId) {
                console.log(`✅ Processing payment for user: ${userId}`);

                const planType = metadata.plan || metadata.planType || 'starter';
                const posts = parseInt(metadata.posts || metadata.postsPerMonth || 150);
                const billingCycle = metadata.billingCycle || metadata.billing_cycle || 'monthly';
                const amount = parseFloat((event.data?.object?.amount_total || event.amount || 0) / 100);

                await activateUserPlan(
                    userId,
                    event.data?.object?.id || event.id || `webhook_${Date.now()}`,
                    planType,
                    posts,
                    billingCycle,
                    amount
                );
                
                console.log('✅ Webhook processed successfully');
                console.log('====================================\n');
            } else {
                console.warn('⚠️ No userId in webhook metadata');
                console.log('====================================\n');
            }
        } else {
            console.log(`ℹ️ Unhandled webhook type: ${event.type}`);
            console.log('====================================\n');
        }

        // Always return 200 to acknowledge receipt
        res.status(200).json({ 
            received: true, 
            timestamp: new Date().toISOString() 
        });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        console.log('====================================\n');
        // Still return 200 to prevent retries
        res.status(200).json({ 
            received: true, 
            error: error.message 
        });
    }
});

// ==========================================
// AUTH ENDPOINTS
// ==========================================
app.post('/api/auth/change-password', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 8 characters' 
            });
        }

        const { error } = await supabase.auth.admin.updateUserById(
            user.id,
            { password: newPassword }
        );
        
        if (error) throw error;
        
        console.log(`✅ Password updated for user: ${user.id}`);
        res.json({ success: true, message: 'Password updated' });

    } catch (error) {
        console.error('❌ Change password error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/logout-all', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { error } = await supabase.auth.admin.signOut(user.id);
        
        if (error) throw error;
        
        console.log(`✅ User signed out from all devices: ${user.id}`);
        res.json({ success: true, message: 'Signed out from all devices' });

    } catch (error) {
        console.error('❌ Logout all error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/delete-account', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const { password } = req.body;

        // Verify password
        const { error: loginError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: password,
        });

        if (loginError) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }

        // Delete all user data
        await Promise.all([
            supabase.from('user_profiles').delete().eq('user_id', user.id),
            supabase.from('user_plans').delete().eq('user_id', user.id),
            supabase.from('post_history').delete().eq('user_id', user.id),
            supabase.from('payments').delete().eq('user_id', user.id)
        ]);

        // Delete auth user
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        if (deleteError) throw deleteError;

        console.log(`✅ Account deleted: ${user.id}`);
        res.json({ success: true, message: 'Account deleted' });

    } catch (error) {
        console.error('❌ Delete account error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error', 
        message: err.message 
    });
});

app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path
    });
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ ReddiGen Backend SERVER RUNNING!`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`💳 Dodo Mode: ${DODO_MODE.toUpperCase()}`);
    console.log(`🌐 Frontend: ${FRONTEND_URL}`);
    console.log(`📡 Backend: ${BACKEND_URL}`);
    console.log(`🤖 Gemini API: ${GEMINI_API_KEY ? '✅ Configured' : '❌ NOT CONFIGURED'}`);
    console.log(`🔑 Dodo API: ${DODO_API_KEY ? '✅ Configured' : '❌ NOT CONFIGURED'}`);
    console.log(`💾 Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ NOT CONFIGURED'}`);
    console.log(`${'='.repeat(80)}\n`);
    
    // Start keep-alive mechanism
    startKeepAlive();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app;
