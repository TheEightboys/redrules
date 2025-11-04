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
// PRICING DATA
// ============================================
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
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            await handlePaymentSuccess();
            await loadUserPlanFromDatabase();
            loadUserData();
            hideAuthModal();
            updateUIAfterAuth();
            updateStatsDisplay();
            updateCreditsDisplay();
            updatePlanUI();
            displayHistory();
        } else {
            showAuthModal();
        }
        
        initializeEventListeners();
        setupPricingToggle();
        
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
async function loadUserPlanFromDatabase() {
    if (!currentUser) {
        console.log('⚠️ No current user');
        return;
    }
    
    try {
        console.log('📊 Loading plan from database for:', currentUser.id);
        
        const response = await fetch(`${API_URL}/api/user/plan/${currentUser.id}`);
        
        if (!response.ok) {
            console.error('❌ API returned error:', response.status);
            resetPlanToFree();
            return;
        }
        
        const data = await response.json();
        console.log('📦 Received data:', data);
        
        if (data.success && data.hasPlan) {
            userPlan = data.plan;
            userCredits = data.plan.credits;
            console.log('✅ Plan loaded from database:', userPlan);
        } else {
            resetPlanToFree();
            console.log('ℹ️ No plan found, using free tier');
        }
        
    } catch (error) {
        console.error('❌ Error loading plan from database:', error);
        resetPlanToFree();
    }
}

// ============================================
// DEDUCT CREDIT
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
// PAYMENT FUNCTIONS - FIXED
// ============================================
async function initiateDodoPayment(planType) {
    // CHECK AUTHENTICATION FIRST
    if (!currentUser) {
        showToast('⚠️ Please sign in to purchase a plan', 'warning');
        showAuthModal();
        return;
    }

    try {
        console.log('🚀 Initiating payment for plan:', planType);
        
        const billingCycle = document.querySelector('input[name="billingCycle"]:checked')?.value || 'monthly';
        const pricingData = PRICING_DATA[planType][billingCycle];
        
        if (!pricingData) {
            showToast('Invalid plan selected', 'error');
            return;
        }

        const userId = currentUser.id;
        const userEmail = currentUser.email;
        const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Store payment info as backup
        localStorage.setItem('pendingPayment', JSON.stringify({
            userId: userId,
            planType: planType,
            posts: pricingData.posts,
            billingCycle: billingCycle,
            amount: pricingData.price,
            timestamp: Date.now()
        }));
        
        showToast('Creating payment session...', 'info');
        
        // Call backend to create Dodo session
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
        
        console.log('✅ Payment session created');
        console.log('🔗 Payment URL:', data.paymentUrl);
        
        localStorage.setItem('paymentSessionId', data.sessionId);
        
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
// PAYMENT SUCCESS HANDLER
// ============================================
async function handlePaymentSuccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    
    if (paymentStatus === 'success') {
        console.log('✅ Payment success detected!');
        
        showToast('🎉 Payment successful! Activating your plan...', 'success');
        
        const pendingPayment = localStorage.getItem('pendingPayment');
        
        if (pendingPayment) {
            try {
                const paymentData = JSON.parse(pendingPayment);
                console.log('📦 Found pending payment:', paymentData);
                
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
                    
                    userPlan = {
                        name: paymentData.planType.charAt(0).toUpperCase() + paymentData.planType.slice(1),
                        tier: paymentData.planType,
                        credits: paymentData.posts,
                        postsPerMonth: paymentData.posts,
                        billingCycle: paymentData.billingCycle,
                        activated: true
                    };
                    userCredits = paymentData.posts;
                    
                    updatePlanUI();
                    updateCreditsDisplay();
                    updateStatsDisplay();
                    
                    localStorage.removeItem('pendingPayment');
                    localStorage.removeItem('paymentSessionId');
                    
                    showToast('✅ Your plan is now active!', 'success');
                    createConfetti();
                    
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
                
                setTimeout(async () => {
                    await loadUserPlanFromDatabase();
                    updatePlanUI();
                    updateCreditsDisplay();
                    window.history.replaceState({}, document.title, window.location.pathname);
                }, 2000);
            }
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
// PRICING FUNCTIONS
// ============================================
function setupPricingToggle() {
    const monthlyRadio = document.getElementById('monthlyBilling');
    const yearlyRadio = document.getElementById('yearlyBilling');
    
    if (monthlyRadio && yearlyRadio) {
        monthlyRadio.addEventListener('change', () => updatePricingDisplay('monthly'));
        yearlyRadio.addEventListener('change', () => updatePricingDisplay('yearly'));
    }
}

function updatePricingDisplay(billingCycle) {
    Object.keys(PRICING_DATA).forEach(planKey => {
        const planData = PRICING_DATA[planKey][billingCycle];
        const priceElement = document.getElementById(`${planKey}Price`);
        const postsElement = document.getElementById(`${planKey}Posts`);
        const billingElement = document.getElementById(`${planKey}Billing`);
        
        if (priceElement) {
            priceElement.textContent = `$${planData.price}`;
        }
        if (postsElement) {
            postsElement.textContent = `${planData.posts} Posts`;
        }
        if (billingElement) {
            billingElement.textContent = billingCycle === 'yearly' ? '/year' : '/month';
        }
    });
}

// ============================================
// REST OF YOUR EXISTING FUNCTIONS
// (Keep all your other functions like handleAIGenerate, 
// handleOptimizePost, etc. - they remain unchanged)
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
    document.getElementById('optimizerOptimizeBtn')?.addEventListener('click', handleOptimizePost);
    
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('active');
    });
}

// Keep all your existing AI and optimization functions...
async function handleAIGenerate() {
    // Your existing code
}

async function handleOptimizePost() {
    // Your existing code
}

// Utility functions
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

function updateUIAfterAuth() {
    const userName = currentUser?.email?.split('@')[0] || 'User';
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = userName;
    });
    document.querySelectorAll('.user-email').forEach(el => {
        el.textContent = currentUser?.email || '';
    });
}

function updateStatsDisplay() {
    const totalPostsElement = document.getElementById('totalPosts');
    const creditsLeftElement = document.getElementById('creditsLeft');
    const planNameElement = document.getElementById('planName');
    
    if (totalPostsElement) totalPostsElement.textContent = userPostHistory.length;
    if (creditsLeftElement) creditsLeftElement.textContent = userCredits;
    if (planNameElement) planNameElement.textContent = userPlan.name;
}

function updateCreditsDisplay() {
    document.querySelectorAll('.credits-display, .user-credits').forEach(el => {
        el.textContent = userCredits;
    });
}

function updatePlanUI() {
    const planBadge = document.getElementById('currentPlanBadge');
    if (planBadge) {
        planBadge.textContent = userPlan.name;
        planBadge.className = 'badge';
        
        const colorMap = {
            free: 'bg-secondary',
            starter: 'bg-primary',
            professional: 'bg-success',
            enterprise: 'bg-warning'
        };
        
        planBadge.classList.add(colorMap[userPlan.tier] || 'bg-secondary');
    }
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer') || document.body;
    
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