// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://duzaoqvdukdnbjzccwbp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1emFvcXZkdWtkbmJqemNjd2JwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTg5MTYxMiwiZXhwIjoyMDc3NDY3NjEyfQ.A9yEUnLSslhtMIcgI-CG7siK1ic5tUEAktYuqGOmuzg';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// GLOBAL VARIABLES
// ============================================
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://redrules.onrender.com';

let currentUser = null;
let userCredits = 10;
let userPostHistory = [];
let userPlan = {
    name: 'Free',
    tier: 'free',
    credits: 10,
    postsPerMonth: 10,
    monthlyLimit: 10,
    features: [],
    activated: false
};

// ============================================
// DODO PAYMENTS CONFIGURATION
// ============================================
const DODO_PAYMENT_LINKS = {
    starter_monthly: 'https://test.checkout.dodopayments.com/buy/pdt_XocDrGw3HxTb0nD7nyYyl?quantity=1',
    starter_yearly: 'https://checkout.dodopayments.com/buy/pdt_RBEfQWVlN9bnWihieBQSt',
    professional_monthly: 'https://checkout.dodopayments.com/buy/pdt_dumBrrIeNTtENukKXHiGh',
    professional_yearly: 'https://checkout.dodopayments.com/buy/pdt_gBCE38rNQm8x30iqAltc6',
    enterprise_monthly: 'https://checkout.dodopayments.com/buy/pdt_UHLjlc1qPLgSvK1ubHjgJ',
    enterprise_yearly: 'https://checkout.dodopayments.com/buy/pdt_E9rxQwDMZahet7kADcna5'
};

const PRICING_DATA = {
    starter: {
        monthly: { price: 1.99, posts: 150, name: 'Starter' },
        yearly: { price: 21.49, posts: 1800, name: 'Starter' }
    },
    professional: {
        monthly: { price: 2.99, posts: 250, name: 'Professional' },
        yearly: { price: 32.49, posts: 3000, name: 'Professional' }
    },
    enterprise: {
        monthly: { price: 3.99, posts: 500, name: 'Enterprise' },
        yearly: { price: 43.49, posts: 6000, name: 'Enterprise' }
    }
};

// ============================================
// INITIALIZE ON PAGE LOAD
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ Dashboard loading...');
    
    try {
        // Check authentication first
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            
            // Check for payment success
            await handlePaymentSuccess();
            
            // Load user plan from Supabase
            await loadUserPlanFromDatabase();
            
            // Load history from localStorage
            loadUserData();
            
            // Update UI
            hideAuthModal();
            updateUIAfterAuth();
            updateStatsDisplay();
            updateCreditsDisplay();
            updatePlanUI();
            displayHistory();
            
        } else {
            showAuthModal();
        }
        
        // Initialize event listeners
        initializeEventListeners();
        setupPricingToggle();
        
        // Hide loading screen
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) loadingScreen.classList.add('hidden');
        }, 500);
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('Error loading dashboard: ' + error.message, 'error');
        
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
    }
});

// ============================================
// LOAD USER PLAN FROM DATABASE
// ============================================
// ============================================
// LOAD USER PLAN FROM DATABASE - FIXED
// ============================================
async function loadUserPlanFromDatabase() {
    if (!currentUser) {
        console.log('⚠️ No current user');
        return;
    }
    
    try {
        console.log('📊 Loading plan from database for:', currentUser.id);
        
        const response = await fetch(`${API_URL}/api/user/plan/${currentUser.id}`);
        
        // Check if response is OK
        if (!response.ok) {
            console.error('❌ API returned error:', response.status);
            const errorText = await response.text();
            console.error('Error details:', errorText);
            resetPlanToFree();
            return;
        }
        
        const data = await response.json();
        console.log('📦 Received data:', data);
        
        if (data.success && data.hasPlan) {
            userPlan = data.plan;
            userCredits = data.plan.credits;
            
            console.log('✅ Plan loaded from database:', userPlan);
            console.log('✅ Credits:', userCredits);
        } else {
            // No plan found - use free tier
            resetPlanToFree();
            console.log('ℹ️ No plan found, using free tier');
        }
        
    } catch (error) {
        console.error('❌ Error loading plan from database:', error);
        console.error('Error stack:', error.stack);
        resetPlanToFree();
    }
}

// ============================================
// SAVE PENDING PAYMENT - FIXED
// ============================================
app.post('/api/user/plan/pending', async (req, res) => {
    try {
        const { userId, planType, postsPerMonth, billingCycle, amount, transactionId, customerEmail } = req.body;
        
        console.log('💾 Saving pending payment:', { userId, planType, amount });
        
        const { data, error } = await supabase
            .from('payments')
            .insert([{
                user_id: userId,
                transaction_id: transactionId,
                plan_type: planType,
                posts_per_month: postsPerMonth,
                billing_cycle: billingCycle,
                amount: amount,
                status: 'pending',
                customer_email: customerEmail,
                created_at: new Date().toISOString()
            }]);

        if (error) {
            console.error('❌ Supabase error:', error);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to save pending payment' 
            });
        }

        console.log('✅ Pending payment saved');
        
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// TEST YOUR API ENDPOINT
// ============================================
// Run this in browser console to test:
/*
fetch('http://localhost:3000/api/user/plan/YOUR_USER_ID')
  .then(r => r.json())
  .then(d => console.log('Plan data:', d))
  .catch(e => console.error('Error:', e));
*/


// ============================================
// TEST YOUR API ENDPOINT
// ============================================
// Run this in browser console to test:
/*
fetch('http://localhost:3000/api/user/plan/YOUR_USER_ID')
  .then(r => r.json())
  .then(d => console.log('Plan data:', d))
  .catch(e => console.error('Error:', e));
*/
// ============================================
// SAVE PLAN TO DATABASE
// ============================================
async function savePlanToDatabase(planData) {
    if (!currentUser) return;
    
    try {
        console.log('💾 Saving plan to database:', planData);
        
        const response = await fetch(`${API_URL}/api/user/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                planType: planData.plan,
                postsPerMonth: planData.posts,
                credits: planData.posts,
                billingCycle: planData.billingType,
                amount: planData.amount
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Plan saved to database successfully');
            return true;
        } else {
            console.error('❌ Failed to save plan:', data.error);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error saving plan to database:', error);
        return false;
    }
}

// ============================================
// DEDUCT CREDIT (UPDATE DATABASE)
// ============================================
async function deductCreditFromDatabase() {
    if (!currentUser) return false;
    
    try {
        const response = await fetch(`${API_URL}/api/user/plan/deduct-credit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
            userCredits = data.creditsRemaining;
            userPlan.credits = userCredits;
            updateCreditsDisplay();
            updateStatsDisplay();
            return true;
        } else {
            showToast(data.error || 'Failed to deduct credit', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error deducting credit:', error);
        return false;
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================
function showAuthModal() {
    const authModal = new bootstrap.Modal(document.getElementById('authModal'));
    authModal.show();
}

function hideAuthModal() {
    const authModal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
    if (authModal) authModal.hide();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        currentUser = data.user;
        hideAuthModal();
        
        // Load plan from database
        await loadUserPlanFromDatabase();
        loadUserData();
        
        updateUIAfterAuth();
        updateStatsDisplay();
        updateCreditsDisplay();
        updatePlanUI();
        
        showToast('Welcome back!', 'success');
    } catch (error) {
        showToast('Login failed: ' + error.message, 'error');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupPasswordConfirm').value;

    if (password !== confirmPassword) {
        showToast('Passwords do not match!', 'error');
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        
        showToast('Account created! Check your email to verify.', 'success');
        document.getElementById('signupSection').style.display = 'none';
        document.getElementById('emailAuthSection').style.display = 'block';
    } catch (error) {
        showToast('Signup failed: ' + error.message, 'error');
    }
}

async function handleSignOut() {
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        userCredits = 10;
        userPostHistory = [];
        resetPlanToFree();
        localStorage.clear();
        showAuthModal();
        showToast('Signed out successfully', 'success');
    } catch (error) {
        showToast('Sign out failed: ' + error.message, 'error');
    }
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================
function navigateToPage(pageName) {
    console.log('Navigating to:', pageName);
    
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const targetSection = document.getElementById(pageName + 'Section');
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    const activeMenuItem = document.querySelector(`[data-page="${pageName}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }
    
    const pageTitles = {
        aiGenerator: 'AI Generator',
        contentOptimizer: 'Content Optimizer',
        history: 'Post History',
        profile: 'Profile',
        settings: 'Settings',
        pricing: 'Pricing Plans'
    };
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = pageTitles[pageName] || pageName;
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function initializeEventListeners() {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('dropdownSignOutBtn')?.addEventListener('click', handleSignOut);
    
    document.getElementById('showSignupLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('emailAuthSection').style.display = 'none';
        document.getElementById('signupSection').style.display = 'block';
    });
    
    document.getElementById('showLoginLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('signupSection').style.display = 'none';
        document.getElementById('emailAuthSection').style.display = 'block';
    });
    
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            if (page) navigateToPage(page);
        });
    });
    
    document.querySelectorAll('.dropdown-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            if (page) navigateToPage(page);
        });
    });
    
    document.getElementById('aiGenerateBtn')?.addEventListener('click', handleAIGenerate);
    document.getElementById('aiFetchGuidelinesBtn')?.addEventListener('click', () => {
        const subreddit = document.getElementById('aiSubredditInput').value.trim();
        if (subreddit) fetchAndDisplayGuidelines(subreddit, 'ai');
    });
    
    document.getElementById('optimizerOptimizeBtn')?.addEventListener('click', handleOptimizePost);
    document.getElementById('optimizerFetchGuidelinesBtn')?.addEventListener('click', () => {
        const subreddit = document.getElementById('optimizerSubredditInput').value.trim();
        if (subreddit) fetchAndDisplayGuidelines(subreddit, 'optimizer');
    });
    
    document.getElementById('aiCopyBtn')?.addEventListener('click', () => {
        copyToClipboard('aiGeneratedText');
    });
    document.getElementById('optimizerCopyBtn')?.addEventListener('click', () => {
        copyToClipboard('optimizerOptimizedText');
    });
    
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('active');
    });
}

// ============================================
// AI GENERATION
// ============================================
async function handleAIGenerate() {
    const subreddit = document.getElementById('aiSubredditInput').value.trim().toLowerCase();
    const topic = document.getElementById('aiTopicInput').value.trim();
    
    if (!subreddit || !topic) {
        showToast('Please enter both a subreddit and a topic.', 'error');
        return;
    }
    
    if (!hasCreditsLeft()) {
        showToast('❌ No credits remaining! Please upgrade your plan.', 'error');
        navigateToPage('pricing');
        return;
    }
    
    const btn = document.getElementById('aiGenerateBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
    btn.disabled = true;
    
    try {
        const rulesData = await fetchRedditRulesDirectAPI(subreddit);
        if (!rulesData.rules) throw new Error('Could not fetch subreddit rules.');
        
        const response = await fetch(`${API_URL}/api/generate-post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subreddit, topic, rules: rulesData.rules })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'AI generation failed.');
        }
        
        const data = await response.json();
        const generatedPost = data.post || data.generatedPost;
        if (!generatedPost) throw new Error('AI returned no content.');
        
        // Deduct credit from database
        const deducted = await deductCreditFromDatabase();
        if (!deducted) {
            throw new Error('Failed to deduct credit');
        }
        
        document.getElementById('aiGeneratedText').innerHTML = `<div style="white-space: pre-wrap; line-height: 1.6;">${generatedPost}</div>`;
        document.getElementById('aiTargetSubreddit').textContent = subreddit;
        document.getElementById('aiOutputCard').style.display = 'block';
        document.getElementById('aiOutputCard').scrollIntoView({ behavior: 'smooth' });
        
        saveToHistory(subreddit, topic, generatedPost, 'ai-generated');
        showToast(`✨ Post generated! Credits left: ${userCredits}`, 'success');
        createConfetti();
        
    } catch (error) {
        console.error('❌ Generation Error:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================
// CONTENT OPTIMIZATION
// ============================================
async function handleOptimizePost() {
    const subreddit = document.getElementById('optimizerSubredditInput').value.trim().toLowerCase();
    const userPost = document.getElementById('optimizerContentInput').value.trim();
    
    if (!subreddit || !userPost) {
        showToast('Please enter both a subreddit and a post to optimize.', 'error');
        return;
    }
    
    if (!hasCreditsLeft()) {
        showToast('❌ No credits remaining! Please upgrade your plan.', 'error');
        navigateToPage('pricing');
        return;
    }
    
    const btn = document.getElementById('optimizerOptimizeBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Optimizing...';
    btn.disabled = true;
    
    try {
        const rulesData = await fetchRedditRulesDirectAPI(subreddit);
        if (!rulesData.rules) throw new Error('Could not fetch subreddit rules.');
        
        const response = await fetch(`${API_URL}/api/optimize-post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subreddit, post: userPost, rules: rulesData.rules })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'AI optimization failed.');
        }
        
        const data = await response.json();
        const optimizedPost = data.post || data.optimizedPost;
        if (!optimizedPost) throw new Error('AI returned no content.');

        // Deduct credit from database
        const deducted = await deductCreditFromDatabase();
        if (!deducted) {
            throw new Error('Failed to deduct credit');
        }
        
        document.getElementById('optimizerOptimizedText').innerHTML = `<div style="white-space: pre-wrap; line-height: 1.6;">${optimizedPost}</div>`;
        document.getElementById('optimizerTargetSubreddit').textContent = subreddit;
        document.getElementById('optimizerOutputCard').style.display = 'block';
        document.getElementById('optimizerOutputCard').scrollIntoView({ behavior: 'smooth' });
        
        saveToHistory(subreddit, userPost, optimizedPost, 'optimized-ai');
        showToast(`✨ Post optimized! Credits left: ${userCredits}`, 'success');
        createConfetti();
        
    } catch (error) {
        console.error('❌ Optimization Error:', error);
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================
// REDDIT RULES FETCHING
// ============================================
async function fetchRedditRulesDirectAPI(subreddit) {
    try {
        const response = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch subreddit rules');
        }
        
        const data = await response.json();
        
        if (!data.success || !data.rules) {
            throw new Error('No rules found for this subreddit');
        }
        
        return {
            rules: data.rules,
            success: true
        };
    } catch (error) {
        console.error('Error fetching rules:', error);
        throw new Error(`Subreddit r/${subreddit} not found or is private`);
    }
}

async function fetchAndDisplayGuidelines(subreddit, type) {
    const btn = document.getElementById(`${type}FetchGuidelinesBtn`);
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;
    
    try {
        const data = await fetchRedditRulesDirectAPI(subreddit);
        
        if (!data.rules) throw new Error(data.error || 'Could not fetch rules');
        
        document.getElementById(`${type}GuidelineSubreddit`).textContent = subreddit;
        document.getElementById(`${type}GuidelinesContent`).innerHTML = data.rules.split('\n').map(rule => 
            `<div class="mb-1"><i class="fas fa-check-circle text-success me-2"></i>${rule}</div>`
        ).join('');
        document.getElementById(`${type}GuidelinesContainer`).style.display = 'block';
        
        if (type === 'optimizer') {
            document.getElementById('optimizerOptimizeBtn').disabled = false;
        }
        
        showToast('Rules fetched successfully!', 'success');
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================
// PAYMENT FUNCTIONS
// ============================================
// ============================================
// PAYMENT FUNCTIONS
// ============================================
// ============================================
// FIXED PAYMENT FLOW - USE BACKEND API
// Replace your initiateDodoPayment function with this
// ============================================

async function initiateDodoPayment(planType) {
    try {
        console.log('🚀 Initiating payment for plan:', planType);
        
        // Get billing cycle
        const billingCycle = document.querySelector('input[name="billingCycle"]:checked')?.value || 'monthly';
        
        // Get user session
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        
        if (sessionError || !session || !session.user) {
            showToast('Please log in to purchase a plan', 'error');
            showAuthModal();
            return;
        }
        
        const userId = session.user.id;
        const userEmail = session.user.email;
        
        // Get pricing data
        const pricingData = PRICING_DATA[planType][billingCycle];
        if (!pricingData) {
            showToast('Invalid plan selected', 'error');
            return;
        }
        
        // Generate transaction ID
        const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Store payment info in localStorage as backup
        localStorage.setItem('pendingPayment', JSON.stringify({
            userId: userId,
            planType: planType,
            posts: pricingData.posts,
            billingCycle: billingCycle,
            amount: pricingData.price,
            timestamp: Date.now()
        }));
        
        // Show loading state
        showToast('Creating payment session...', 'info');
        
        // Call backend API to create Dodo session
        const response = await fetch(`${API_URL}/api/dodo/create-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                plan: planType,
                email: userEmail,
                amount: pricingData.price,
                postsPerMonth: pricingData.posts,
                billingCycle: billingCycle,
                transactionId: transactionId
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create payment session');
        }
        
        const data = await response.json();
        
        if (!data.success || !data.paymentUrl) {
            throw new Error('Invalid response from payment server');
        }
        
        console.log('✅ Payment session created:', data.sessionId);
        console.log('🔗 Payment URL:', data.paymentUrl);
        
        // Store session ID for verification
        localStorage.setItem('paymentSessionId', data.sessionId);
        
        // Redirect to Dodo payment page
        showToast('Redirecting to payment...', 'success');
        
        setTimeout(() => {
            window.location.href = data.paymentUrl;
        }, 500);
        
    } catch (error) {
        console.error('❌ Payment error:', error);
        showToast('Payment failed: ' + error.message, 'error');
        localStorage.removeItem('pendingPayment');
    }
}

// ============================================
// ENHANCED PAYMENT SUCCESS HANDLER
// ============================================
async function handlePaymentSuccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success') {
        console.log('✅ Payment success detected!');
        
        showToast('🎉 Payment successful! Activating your plan...', 'success');
        
        // Get pending payment info
        const pendingPayment = localStorage.getItem('pendingPayment');
        const sessionId = localStorage.getItem('paymentSessionId');
        
        if (pendingPayment) {
            try {
                const paymentData = JSON.parse(pendingPayment);
                console.log('📦 Found pending payment:', paymentData);
                
                // Activate the plan via backend
                const response = await fetch(`${API_URL}/api/user/plan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: paymentData.userId,
                        planType: paymentData.planType,
                        postsPerMonth: paymentData.posts,
                        credits: paymentData.posts,
                        billingCycle: paymentData.billingCycle,
                        amount: paymentData.amount
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    console.log('✅ Plan activated successfully!');
                    
                    // Update local state
                    userPlan = {
                        name: paymentData.planType.charAt(0).toUpperCase() + paymentData.planType.slice(1),
                        tier: paymentData.planType,
                        credits: paymentData.posts,
                        postsPerMonth: paymentData.posts,
                        billingCycle: paymentData.billingCycle,
                        activated: true
                    };
                    userCredits = paymentData.posts;
                    
                    // Update UI
                    updatePlanUI();
                    updateCreditsDisplay();
                    updateStatsDisplay();
                    
                    // Clear storage
                    localStorage.removeItem('pendingPayment');
                    localStorage.removeItem('paymentSessionId');
                    
                    // Show success
                    showToast('✅ Your plan is now active!', 'success');
                    createConfetti();
                    
                    // Clean URL and navigate
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    setTimeout(() => {
                        navigateToPage('aiGenerator');
                    }, 1500);
                    
                } else {
                    throw new Error(data.error || 'Failed to activate plan');
                }
                
            } catch (error) {
                console.error('❌ Error activating plan:', error);
                showToast('Error activating plan. Please contact support.', 'error');
                
                // Fallback: reload plan from database
                setTimeout(async () => {
                    await loadUserPlanFromDatabase();
                    updatePlanUI();
                    updateCreditsDisplay();
                    window.history.replaceState({}, document.title, window.location.pathname);
                }, 2000);
            }
        } else {
            // No localStorage data - try loading from database
            console.log('⚠️ No localStorage data, loading from database...');
            setTimeout(async () => {
                await loadUserPlanFromDatabase();
                updatePlanUI();
                updateCreditsDisplay();
                showToast('✅ Your plan is now active!', 'success');
                window.history.replaceState({}, document.title, window.location.pathname);
                navigateToPage('aiGenerator');
            }, 2000);
        }
        
    } else if (paymentStatus === 'cancelled') {
        console.log('❌ Payment cancelled');
        showToast('Payment was cancelled', 'warning');
        localStorage.removeItem('pendingPayment');
        localStorage.removeItem('paymentSessionId');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ============================================
// OPTIONAL: Verify payment via backend
// ============================================
async function verifyPaymentWithBackend(sessionId, userId) {
    try {
        const response = await fetch(`${API_URL}/api/dodo/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId })
        });
        
        const data = await response.json();
        return data;
        
    } catch (error) {
        console.error('❌ Payment verification error:', error);
        return { success: false, error: error.message };
    }
}
// ============================================
// PRICING PLAN FUNCTIONS
// ============================================
function setupPricingToggle() {
    const monthlyBtn = document.getElementById('monthlyBtn');
    const yearlyBtn = document.getElementById('yearlyBtn');
    
    if (monthlyBtn && yearlyBtn) {
        monthlyBtn.addEventListener('click', () => {
            monthlyBtn.classList.add('active');
            yearlyBtn.classList.remove('active');
            updatePricingDisplay('monthly');
        });
        
        yearlyBtn.addEventListener('click', () => {
            yearlyBtn.classList.add('active');
            monthlyBtn.classList.remove('active');
            updatePricingDisplay('yearly');
        });
    }
}

function updatePricingDisplay(billingCycle) {
    Object.keys(PRICING_DATA).forEach(planKey => {
        const planData = PRICING_DATA[planKey][billingCycle];
        const priceElement = document.getElementById(`${planKey}Price`);
        const postsElement = document.getElementById(`${planKey}Posts`);
        
        if (priceElement) {
            priceElement.textContent = `$${planData.price}`;
        }
        if (postsElement) {
            postsElement.textContent = `${planData.posts} posts/${billingCycle === 'yearly' ? 'year' : 'month'}`;
        }
    });
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================
function updateUIAfterAuth() {
    const userName = currentUser?.email?.split('@')[0] || 'User';
    
    const userNameElements = document.querySelectorAll('.user-name');
    userNameElements.forEach(el => {
        el.textContent = userName;
    });
    
    const userEmailElements = document.querySelectorAll('.user-email');
    userEmailElements.forEach(el => {
        el.textContent = currentUser?.email || '';
    });
    
    console.log('✅ UI updated for authenticated user');
}

function updateStatsDisplay() {
    const totalPostsElement = document.getElementById('totalPosts');
    const creditsLeftElement = document.getElementById('creditsLeft');
    const planNameElement = document.getElementById('planName');
    
    if (totalPostsElement) {
        totalPostsElement.textContent = userPostHistory.length;
    }
    if (creditsLeftElement) {
        creditsLeftElement.textContent = userCredits;
    }
    if (planNameElement) {
        planNameElement.textContent = userPlan.name;
    }
}

function updateCreditsDisplay() {
    const creditsElements = document.querySelectorAll('.credits-display, .user-credits');
    creditsElements.forEach(el => {
        el.textContent = userCredits;
    });
    
    console.log('💾 Saved credits to localStorage:', userCredits);
}

function updatePlanUI() {
    const planBadge = document.getElementById('currentPlanBadge');
    const planNameElement = document.getElementById('planName');
    
    if (planBadge) {
        planBadge.textContent = userPlan.name;
        planBadge.className = 'badge';
        
        if (userPlan.tier === 'free') {
            planBadge.classList.add('bg-secondary');
        } else if (userPlan.tier === 'starter') {
            planBadge.classList.add('bg-primary');
        } else if (userPlan.tier === 'professional') {
            planBadge.classList.add('bg-success');
        } else if (userPlan.tier === 'enterprise') {
            planBadge.classList.add('bg-warning');
        }
    }
    
    if (planNameElement) {
        planNameElement.textContent = userPlan.name;
    }
    
    console.log('🎯 Plan UI updated:', userPlan);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function hasCreditsLeft() {
    return userCredits > 0;
}

function resetPlanToFree() {
    userPlan = {
        name: 'Free',
        tier: 'free',
        credits: 10,
        postsPerMonth: 10,
        monthlyLimit: 10,
        features: [],
        activated: false
    };
    userCredits = 10;
}

function loadUserData() {
    const savedHistory = localStorage.getItem('userPostHistory');
    if (savedHistory) {
        userPostHistory = JSON.parse(savedHistory);
    }
}

function saveToHistory(subreddit, input, output, type) {
    const historyItem = {
        id: Date.now(),
        subreddit: subreddit,
        input: input,
        output: output,
        type: type,
        timestamp: new Date().toISOString()
    };
    
    userPostHistory.unshift(historyItem);
    
    if (userPostHistory.length > 50) {
        userPostHistory = userPostHistory.slice(0, 50);
    }
    
    localStorage.setItem('userPostHistory', JSON.stringify(userPostHistory));
    displayHistory();
    updateStatsDisplay();
}

function displayHistory() {
    const historyContainer = document.getElementById('historyContainer');
    if (!historyContainer) return;
    
    if (userPostHistory.length === 0) {
        historyContainer.innerHTML = '<p class="text-center text-muted">No posts generated yet.</p>';
        return;
    }
    
    historyContainer.innerHTML = userPostHistory.map(item => `
        <div class="card mb-3">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="card-title">r/${item.subreddit}</h5>
                    <span class="badge bg-${item.type === 'ai-generated' ? 'primary' : 'success'}">
                        ${item.type === 'ai-generated' ? 'AI Generated' : 'Optimized'}
                    </span>
                </div>
                <p class="text-muted small mb-2">${new Date(item.timestamp).toLocaleString()}</p>
                <div class="mb-2">
                    <strong>Input:</strong>
                    <p class="mb-1">${item.input}</p>
                </div>
                <div>
                    <strong>Output:</strong>
                    <div style="white-space: pre-wrap; line-height: 1.6;">${item.output}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const text = element.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(err => {
        showToast('Failed to copy', 'error');
        console.error('Copy error:', err);
    });
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    setTimeout(() => toast.remove(), 5000);
}

function createConfetti() {
    if (typeof confetti !== 'undefined') {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
}
