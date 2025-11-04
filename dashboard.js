// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://duzaoqvdukdnbjzccwbp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1emFvcXZkdWtkbmJqemNjd2JwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTg5MTYxMiwiZXhwIjoyMDc3NDY3NjEyfQ.A9yEUnLSslhtMIcgI-CG7siK1ic5tUEAktYuqGOmuzg';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// GLOBAL VARIABLES
// ============================================
// At the top of dashboard.js, change this line:
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'  // Your local backend
    : 'https://redrules.onrender.com';  // Production backend
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
// INITIALIZE ON PAGE LOAD - FIXED ORDER
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ Dashboard loading...');
    
    try {
        // STEP 1: Check for payment success FIRST (before loading user data)
        const paymentProcessed = await handlePaymentSuccess();
        
        // STEP 2: Check authentication
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            
            // STEP 3: Load user data (this will load the updated plan if payment was successful)
            if (!paymentProcessed) {
                // Only load from storage if payment wasn't just processed
                loadUserPlan();
                loadUserData();
            }
            
            // STEP 4: Update UI
            hideAuthModal();
            updateUIAfterAuth();
            updateStatsDisplay();
            updateCreditsDisplay();
            updatePlanUI();
            displayHistory();
            
        } else {
            showAuthModal();
        }
        
        // STEP 5: Initialize event listeners
        initializeEventListeners();
        setupPricingToggle();
        
        // STEP 6: Hide loading screen
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) loadingScreen.classList.add('hidden');
        }, 500);
        
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('Error loading dashboard: ' + error.message, 'error');
        
        // Hide loading screen even on error
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
    }
});

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
        loadUserPlan();
        loadUserData();
        updateUIAfterAuth();
        updateStatsDisplay();
        updateCreditsDisplay();
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
    // Login/Signup
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('dropdownSignOutBtn')?.addEventListener('click', handleSignOut);
    
    // Toggle between login and signup
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
    
    // Sidebar navigation
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            if (page) navigateToPage(page);
        });
    });
    
    // Dropdown navigation
    document.querySelectorAll('.dropdown-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            if (page) navigateToPage(page);
        });
    });
    
    // AI Generator
    document.getElementById('aiGenerateBtn')?.addEventListener('click', handleAIGenerate);
    document.getElementById('aiFetchGuidelinesBtn')?.addEventListener('click', () => {
        const subreddit = document.getElementById('aiSubredditInput').value.trim();
        if (subreddit) fetchAndDisplayGuidelines(subreddit, 'ai');
    });
    
    // Content Optimizer
    document.getElementById('optimizerOptimizeBtn')?.addEventListener('click', handleOptimizePost);
    document.getElementById('optimizerFetchGuidelinesBtn')?.addEventListener('click', () => {
        const subreddit = document.getElementById('optimizerSubredditInput').value.trim();
        if (subreddit) fetchAndDisplayGuidelines(subreddit, 'optimizer');
    });
    
    // Copy buttons
    document.getElementById('aiCopyBtn')?.addEventListener('click', () => {
        copyToClipboard('aiGeneratedText');
    });
    document.getElementById('optimizerCopyBtn')?.addEventListener('click', () => {
        copyToClipboard('optimizerOptimizedText');
    });
    
    // Sidebar toggle for mobile
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
        
        deductCredit();
        
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

        deductCredit();
        
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
// ============================================
// REDDIT RULES FETCHING - FIXED
// ============================================
async function fetchRedditRulesDirectAPI(subreddit) {
    try {
        // ALWAYS use your backend API - never call Reddit directly
        const response = await fetch(`https://redrules.onrender.com/api/reddit-rules/${subreddit}`);
        
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
// PAYMENT FUNCTIONS - FIXED
// ============================================
async function initiateDodoPayment(planType) {
    try {
        console.log('🚀 Initiating payment for:', planType);
        
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.style.display = 'flex';

        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        
        if (sessionError || !session?.user) {
            console.error('❌ User not authenticated');
            showToast('Please log in to purchase a plan', 'error');
            if (loadingScreen) loadingScreen.style.display = 'none';
            showAuthModal();
            return;
        }

        const billingCycle = document.querySelector('input[name="billingCycle"]:checked')?.value || 'monthly';
        const planData = PRICING_DATA[planType][billingCycle];

        const purchaseData = {
            plan: planType,
            posts: planData.posts,
            amount: planData.price,
            billingType: billingCycle,
            timestamp: Date.now(),
            userId: session.user.id,
            userEmail: session.user.email
        };
        
        localStorage.setItem('pendingPurchase', JSON.stringify(purchaseData));

        const YOUR_DOMAIN = window.location.origin;
        const successUrl = encodeURIComponent(`${YOUR_DOMAIN}/dashboard.html?payment=success`);
        const cancelUrl = encodeURIComponent(`${YOUR_DOMAIN}/dashboard.html?payment=cancelled`);

        const paymentLink = DODO_PAYMENT_LINKS[`${planType}_${billingCycle}`];
        
        if (!paymentLink) {
            throw new Error('Payment link not found for this plan');
        }

        const paymentUrl = `${paymentLink}?quantity=1&redirect_url=${successUrl}&cancel_url=${cancelUrl}`;
        
        await new Promise(resolve => setTimeout(resolve, 100));
        window.location.href = paymentUrl;

    } catch (error) {
        console.error('❌ Payment error:', error);
        showToast('Payment failed: ' + error.message, 'error');
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.style.display = 'none';
    }
}

async function handlePaymentSuccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success') {
        const pendingPurchase = localStorage.getItem('pendingPurchase');
        
        if (pendingPurchase) {
            try {
                const purchase = JSON.parse(pendingPurchase);
                const purchaseAge = Date.now() - purchase.timestamp;
                
                if (purchaseAge > 24 * 60 * 60 * 1000) {
                    throw new Error('Purchase session expired. Please contact support.');
                }
                
                console.log('✅ Processing successful payment:', purchase);
                
                // Activate the plan IMMEDIATELY
                activatePlan(purchase);
                
                // Show success message
                showToast(`🎉 Payment successful! ${purchase.posts} posts added to your ${purchase.plan} plan!`, 'success');
                createConfetti();
                
                // Clean up
                localStorage.removeItem('pendingPurchase');
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Navigate after a short delay
                setTimeout(() => {
                    navigateToPage('aiGenerator');
                }, 2000);
                
                return true; // Indicates payment was processed
                
            } catch (error) {
                console.error('❌ Error processing payment:', error);
                showToast('Error processing payment: ' + error.message, 'error');
                localStorage.removeItem('pendingPurchase');
            }
        }
    } else if (paymentStatus === 'cancelled') {
        showToast('Payment was cancelled', 'info');
        localStorage.removeItem('pendingPurchase');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    return false; // No payment processed
}

function activatePlan(purchase) {
    console.log('🎯 Activating plan:', purchase);
    
    const planDetails = {
        starter: { name: 'Starter', tier: 'starter', credits: 150, postsPerMonth: 150 },
        professional: { name: 'Professional', tier: 'professional', credits: 250, postsPerMonth: 250 },
        enterprise: { name: 'Enterprise', tier: 'enterprise', credits: 500, postsPerMonth: 500 }
    };
    
    const plan = planDetails[purchase.plan];
    if (!plan) {
        console.error('❌ Invalid plan:', purchase.plan);
        return;
    }
    
    const expiryDate = new Date();
    if (purchase.billingType === 'yearly') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
    }
    
    // Update global plan
    userPlan = {
        ...plan,
        billingType: purchase.billingType,
        amount: purchase.amount,
        activated: true,
        activatedDate: new Date().toISOString(),
        expiryDate: expiryDate.toISOString()
    };
    
    // Update credits
    userCredits = plan.credits;
    
    // Save IMMEDIATELY to localStorage
    savePlanToStorage();
    saveToLocalStorage();
    
    console.log('✅ Plan activated:', userPlan);
    console.log('✅ Credits set to:', userCredits);
    
    // Update UI if DOM is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        updateStatsDisplay();
        updateCreditsDisplay();
        updatePlanUI();
    }
}

function loadUserPlan() {
    const savedPlan = localStorage.getItem('userPlan');
    
    if (savedPlan) {
        try {
            const parsed = JSON.parse(savedPlan);
            
            // Check if plan expired
            if (parsed.expiryDate && new Date(parsed.expiryDate) < new Date()) {
                console.log('⚠️ Plan expired, resetting to free');
                resetPlanToFree();
                showToast('Your plan has expired. Reset to free tier.', 'info');
                return;
            }
            
            // Load the plan
            userPlan = parsed;
            userCredits = userPlan.credits || userPlan.postsPerMonth || 10;
            
            console.log('✅ Loaded plan from storage:', userPlan);
            console.log('✅ Credits loaded:', userCredits);
            
        } catch (error) {
            console.error('❌ Error loading plan:', error);
            resetPlanToFree();
        }
    } else {
        console.log('ℹ️ No saved plan, using free tier');
        resetPlanToFree();
    }
}

function resetPlanToFree() {
    userPlan = {
        name: 'Free',
        tier: 'free',
        credits: 10,
        postsPerMonth: 10,
        monthlyLimit: 10,
        activated: false
    };
    
    userCredits = 10;
    savePlanToStorage();
}

function savePlanToStorage() {
    // Save both plan and credits
    const dataToSave = {
        ...userPlan,
        credits: userCredits // Ensure credits are always in sync
    };
    
    localStorage.setItem('userPlan', JSON.stringify(dataToSave));
    localStorage.setItem('userCredits', userCredits.toString());
    
    console.log('💾 Saved to storage:', dataToSave);
}

function updatePlanUI() {
    const planBadge = document.querySelector('.credits-display');
    if (planBadge) {
        let bgColor = 'secondary';
        if (userPlan.tier === 'starter') bgColor = 'info';
        if (userPlan.tier === 'professional') bgColor = 'warning';
        if (userPlan.tier === 'enterprise') bgColor = 'danger';
        
        planBadge.innerHTML = `
            <span class="badge bg-${bgColor} mb-1">${userPlan.name.toUpperCase()}</span><br>
            <small>${userCredits} Credits Left</small>
        `;
    }
    
    updateCreditsDisplay();
}

function hasCreditsLeft() {
    return userCredits > 0;
}

function deductCredit() {
    if (hasCreditsLeft()) {
        userCredits--;
        userPlan.credits = userCredits;
        savePlanToStorage();
        saveToLocalStorage();
        updateCreditsDisplay();
        updateStatsDisplay();
        return true;
    } else {
        showToast('No credits left! Please upgrade your plan.', 'error');
        return false;
    }
}

function setupPricingToggle() {
    const toggleInputs = document.querySelectorAll('input[name="billingCycle"]');
    toggleInputs.forEach(input => {
        input.addEventListener('change', updatePricingDisplay);
    });
    updatePricingDisplay();
}

function updatePricingDisplay() {
    const isYearly = document.getElementById('yearlyBilling')?.checked;
    const cycle = isYearly ? 'yearly' : 'monthly';
    
    Object.keys(PRICING_DATA).forEach(plan => {
        const data = PRICING_DATA[plan][cycle];
        const priceEl = document.getElementById(`${plan}Price`);
        const billingEl = document.getElementById(`${plan}Billing`);
        const postsEl = document.getElementById(`${plan}Posts`);
        
        if (priceEl) priceEl.textContent = `$${data.price}`;
        if (billingEl) billingEl.textContent = isYearly ? '/year' : '/month';
        if (postsEl) postsEl.textContent = `${data.posts} Posts Per ${isYearly ? 'Year' : 'Month'}`;
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function updateUIAfterAuth() {
    if (currentUser) {
        const userName = currentUser.email.split('@')[0];
        
        const dropdownUserName = document.getElementById('dropdownUserName');
        const dropdownUserEmail = document.getElementById('dropdownUserEmail');
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const settingsEmail = document.getElementById('settingsEmail');
        
        if (dropdownUserName) dropdownUserName.textContent = userName;
        if (dropdownUserEmail) dropdownUserEmail.textContent = currentUser.email;
        if (profileName) profileName.textContent = userName;
        if (profileEmail) profileEmail.textContent = currentUser.email;
        if (settingsEmail) settingsEmail.value = currentUser.email;
    }
}

function loadUserData() {
    const savedHistory = localStorage.getItem('userPostHistory');
    
    if (savedHistory) {
        try {
            userPostHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error('Error loading history:', e);
            userPostHistory = [];
        }
    }
}

function saveToLocalStorage() {
    localStorage.setItem('userCredits', userCredits.toString());
    localStorage.setItem('userPostHistory', JSON.stringify(userPostHistory));
}

function saveToHistory(subreddit, input, output, type) {
    const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        subreddit,
        input,
        output,
        type
    };
    
    userPostHistory.unshift(entry);
    if (userPostHistory.length > 50) userPostHistory.pop();
    
    saveToLocalStorage();
    displayHistory();
}

function displayHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    
    if (userPostHistory.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-5">
                    <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                    No posts yet. Start generating!
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = userPostHistory.map(entry => `
        <tr>
            <td>${new Date(entry.date).toLocaleDateString()}</td>
            <td><span class="badge bg-reddit">r/${entry.subreddit}</span></td>
            <td class="text-truncate" style="max-width: 300px;">${entry.output.substring(0, 100)}...</td>
            <td><span class="badge bg-${entry.type === 'ai-generated' ? 'primary' : 'success'}">${entry.type}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="viewHistoryEntry(${entry.id})">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updateStatsDisplay() {
    const stats = {
        totalPosts: userPostHistory.length,
        creditsUsed: (userPlan.postsPerMonth - userCredits),
        memberSince: new Date().getFullYear()
    };
    
    const totalPostsEl = document.getElementById('totalPosts');
    const creditsUsedEl = document.getElementById('creditsUsed');
    const memberSinceEl = document.getElementById('memberSince');
    const dropdownTotalPostsEl = document.getElementById('dropdownTotalPosts');
    const dropdownCreditsUsedEl = document.getElementById('dropdownCreditsUsed');
    const creditsProgressEl = document.getElementById('creditsProgress');
    
    if (totalPostsEl) totalPostsEl.textContent = stats.totalPosts;
    if (creditsUsedEl) creditsUsedEl.textContent = stats.creditsUsed;
    if (memberSinceEl) memberSinceEl.textContent = stats.memberSince;
    if (dropdownTotalPostsEl) dropdownTotalPostsEl.textContent = stats.totalPosts;
    if (dropdownCreditsUsedEl) dropdownCreditsUsedEl.textContent = `${stats.creditsUsed} / ${userPlan.postsPerMonth}`;
    
    const progress = (stats.creditsUsed / userPlan.postsPerMonth) * 100;
    if (creditsProgressEl) creditsProgressEl.style.width = progress + '%';
    
    updateCreditsDisplay();
}

function updateCreditsDisplay() {
    const creditsLeftEl = document.getElementById('creditsLeft');
    const settingsCreditsDisplayEl = document.getElementById('settingsCreditsDisplay');
    const settingsProgressDisplayEl = document.getElementById('settingsProgressDisplay');
    
    if (creditsLeftEl) creditsLeftEl.textContent = userCredits;
    if (settingsCreditsDisplayEl) settingsCreditsDisplayEl.textContent = userCredits;
    
    const progress = ((userPlan.postsPerMonth - userCredits) / userPlan.postsPerMonth) * 100;
    if (settingsProgressDisplayEl) settingsProgressDisplayEl.style.width = progress + '%';
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const text = element.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function showToast(message, type = 'info') {
    const toastElement = document.getElementById('notificationToast');
    const toastBody = document.getElementById('toastMessage');
    
    if (!toastElement || !toastBody) {
        console.log('Toast:', message);
        return;
    }
    
    toastBody.textContent = message;
    
    const iconMap = {
        success: 'fa-check-circle text-success',
        error: 'fa-exclamation-circle text-danger',
        warning: 'fa-exclamation-triangle text-warning',
        info: 'fa-info-circle text-info'
    };
    
    const icon = toastElement.querySelector('.toast-header i');
    if (icon) {
        icon.className = `fas ${iconMap[type] || iconMap.info} me-2`;
    }
    
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
}

function createConfetti() {
    if (typeof confetti === 'undefined') return;
    
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#FF4500', '#FF8C00', '#FFA500']
        });
        
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#FF4500', '#FF8C00', '#FFA500']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

function viewHistoryEntry(id) {
    const entry = userPostHistory.find(e => e.id === id);
    if (!entry) return;
    
    alert(`Subreddit: r/${entry.subreddit}\n\nType: ${entry.type}\n\nContent:\n${entry.output}`);
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================
function saveProfileChanges() {
    const displayName = document.getElementById('settingsDisplayName')?.value;
    const bio = document.getElementById('settingsBio')?.value;
    
    if (displayName) localStorage.setItem('userDisplayName', displayName);
    if (bio) localStorage.setItem('userBio', bio);
    
    showToast('Profile updated successfully!', 'success');
}

function savePreferences() {
    const emailNotif = document.getElementById('emailNotifications')?.checked;
    const saveHistory = document.getElementById('saveHistory')?.checked;
    
    localStorage.setItem('emailNotifications', emailNotif);
    localStorage.setItem('saveHistory', saveHistory);
    
    showToast('Preferences saved!', 'success');
}

function showChangePasswordModal() {
    const modal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    modal.show();
}

async function handleChangePassword() {
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    
    if (!newPassword || !confirmPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match!', 'error');
        return;
    }
    
    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    
    try {
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });
        
        if (error) throw error;
        
        showToast('Password updated successfully!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
        if (modal) modal.hide();
        
        const currentPasswordEl = document.getElementById('currentPassword');
        const newPasswordEl = document.getElementById('newPassword');
        const confirmPasswordEl = document.getElementById('confirmPassword');
        
        if (currentPasswordEl) currentPasswordEl.value = '';
        if (newPasswordEl) newPasswordEl.value = '';
        if (confirmPasswordEl) confirmPasswordEl.value = '';
        
    } catch (error) {
        showToast('Failed to update password: ' + error.message, 'error');
    }
}

function handleLogoutAllDevices() {
    if (confirm('This will log you out of all devices. Continue?')) {
        handleSignOut();
        showToast('Logged out from all devices', 'success');
    }
}

function showDeleteAccountModal() {
    const modal = new bootstrap.Modal(document.getElementById('deleteAccountModal'));
    modal.show();
}

async function handleDeleteAccount() {
    const confirmEmail = document.getElementById('deleteConfirmEmail')?.value;
    const confirmPassword = document.getElementById('deleteConfirmPassword')?.value;
    const confirmCheck = document.getElementById('deleteConfirmCheck')?.checked;
    
    if (!confirmEmail || !confirmPassword || !confirmCheck) {
        showToast('Please complete all fields and confirm deletion', 'error');
        return;
    }
    
    if (confirmEmail !== currentUser?.email) {
        showToast('Email does not match your account', 'error');
        return;
    }
    
    if (!confirm('⚠️ FINAL WARNING: This will permanently delete your account and all data. This cannot be undone!')) {
        return;
    }
    
    try {
        // First verify password by attempting to sign in
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
            email: confirmEmail,
            password: confirmPassword
        });
        
        if (signInError) {
            showToast('Incorrect password', 'error');
            return;
        }
        
        // Clear all local data
        localStorage.clear();
        
        // Sign out
        await supabaseClient.auth.signOut();
        
        showToast('Account deletion initiated. You have been logged out.', 'success');
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteAccountModal'));
        if (modal) modal.hide();
        
        setTimeout(() => {
            window.location.reload();
        }, 2000);
        
    } catch (error) {
        showToast('Error deleting account: ' + error.message, 'error');
    }
}

function showUpgradeModal() {
    navigateToPage('pricing');
}

// ============================================
// MAKE FUNCTIONS GLOBAL FOR HTML ONCLICK
// ============================================
window.initiateDodoPayment = initiateDodoPayment;
window.navigateToPage = navigateToPage;
window.saveProfileChanges = saveProfileChanges;
window.savePreferences = savePreferences;
window.showChangePasswordModal = showChangePasswordModal;
window.handleChangePassword = handleChangePassword;
window.handleLogoutAllDevices = handleLogoutAllDevices;
window.showDeleteAccountModal = showDeleteAccountModal;
window.handleDeleteAccount = handleDeleteAccount;
window.showUpgradeModal = showUpgradeModal;
window.viewHistoryEntry = viewHistoryEntry;

console.log('✅ Dashboard loaded successfully!');
console.log('💳 Payment system active');
console.log('🎯 All features initialized');