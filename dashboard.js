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
    const authModalEl = document.getElementById('authModal');
    if (authModalEl) {
        const authModal = new bootstrap.Modal(authModalEl);
        authModal.show();
    }
}

function hideAuthModal() {
    const authModalEl = document.getElementById('authModal');
    if (authModalEl) {
        const authModal = bootstrap.Modal.getInstance(authModalEl);
        if (authModal) authModal.hide();
    }
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
        displayHistory();
        
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
        const signupSection = document.getElementById('signupSection');
        const emailAuthSection = document.getElementById('emailAuthSection');
        if (signupSection) signupSection.style.display = 'none';
        if (emailAuthSection) emailAuthSection.style.display = 'block';
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
        
        // Reset UI
        navigateToPage('aiGenerator');
    } catch (error) {
        showToast('Sign out failed: ' + error.message, 'error');
    }
}

// ============================================
// PAYMENT FUNCTIONS
// ============================================
async function initiateDodoPayment(planType) {
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
        
        localStorage.setItem('pendingPayment', JSON.stringify({
            userId: userId,
            planType: planType,
            posts: pricingData.posts,
            billingCycle: billingCycle,
            amount: pricingData.price,
            timestamp: Date.now()
        }));
        
        showToast('Creating payment session...', 'info');
        
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
    
    // Initialize with monthly pricing
    updatePricingDisplay('monthly');
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
// NAVIGATION
// ============================================
function navigateToPage(pageName) {
    console.log('🔄 Navigating to:', pageName);
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all sidebar items
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(pageName + 'Section');
    if (targetSection) {
        targetSection.classList.add('active');
        console.log('✅ Section activated:', pageName);
    } else {
        console.error('❌ Section not found:', pageName + 'Section');
    }
    
    // Activate corresponding sidebar item
    const activeMenuItem = document.querySelector(`[data-page="${pageName}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }
    
    // Update page title
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
    
    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function initializeEventListeners() {
    // Auth forms
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const signOutBtn = document.getElementById('signOutBtn');
    const dropdownSignOutBtn = document.getElementById('dropdownSignOutBtn');
    
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);
    if (dropdownSignOutBtn) dropdownSignOutBtn.addEventListener('click', handleSignOut);
    
    // Auth section toggles
    const showSignupLink = document.getElementById('showSignupLink');
    const showLoginLink = document.getElementById('showLoginLink');
    
    if (showSignupLink) {
        showSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            const emailAuthSection = document.getElementById('emailAuthSection');
            const signupSection = document.getElementById('signupSection');
            if (emailAuthSection) emailAuthSection.style.display = 'none';
            if (signupSection) signupSection.style.display = 'block';
        });
    }
    
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            const signupSection = document.getElementById('signupSection');
            const emailAuthSection = document.getElementById('emailAuthSection');
            if (signupSection) signupSection.style.display = 'none';
            if (emailAuthSection) emailAuthSection.style.display = 'block';
        });
    }
    
    // Sidebar navigation
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            if (page) {
                console.log('Sidebar click:', page);
                navigateToPage(page);
            }
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
    
    // AI Generator button
    const aiGenerateBtn = document.getElementById('aiGenerateBtn');
    if (aiGenerateBtn) {
        aiGenerateBtn.addEventListener('click', handleAIGenerate);
    }
    
    // Optimizer button
    const optimizerBtn = document.getElementById('optimizerOptimizeBtn');
    if (optimizerBtn) {
        optimizerBtn.addEventListener('click', handleOptimizePost);
    }
    
    // Mobile sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }
}

// ============================================
// AI GENERATION
// ============================================
async function handleAIGenerate() {
    const subreddit = document.getElementById('subredditInput')?.value.trim();
    const description = document.getElementById('descriptionInput')?.value.trim();
    const tone = document.getElementById('toneSelect')?.value || 'casual';
    
    if (!subreddit || !description) {
        showToast('Please fill in all fields', 'warning');
        return;
    }
    
    if (!currentUser) {
        showToast('Please sign in to generate posts', 'warning');
        showAuthModal();
        return;
    }
    
    if (!hasCreditsLeft()) {
        showToast('No credits remaining. Please upgrade your plan.', 'error');
        navigateToPage('pricing');
        return;
    }
    
    const generateBtn = document.getElementById('aiGenerateBtn');
    const outputDiv = document.getElementById('generatedOutput');
    
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
    }
    
    try {
        // Fetch Reddit rules
        showToast('Fetching subreddit rules...', 'info');
        const rulesResponse = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`);
        
        if (!rulesResponse.ok) {
            throw new Error('Failed to fetch subreddit rules');
        }
        
        const rulesData = await rulesResponse.json();
        
        // Generate post
        showToast('Generating post...', 'info');
        const response = await fetch(`${API_URL}/api/generate-post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subreddit: subreddit,
                description: description,
                tone: tone,
                rules: rulesData.rules
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate post');
        }
        
        const data = await response.json();
        
        if (data.success && data.post) {
            // Deduct credit
            const creditDeducted = await deductCreditFromDatabase();
            
            if (creditDeducted) {
                // Display result
                if (outputDiv) {
                    outputDiv.innerHTML = `
                        <div class="alert alert-success">
                            <h5>✅ Post Generated!</h5>
                            <div class="mt-3">
                                <strong>Title:</strong>
                                <p>${data.post.title || 'No title'}</p>
                                <strong>Content:</strong>
                                <p style="white-space: pre-wrap;">${data.post.content || data.post}</p>
                            </div>
                        </div>
                    `;
                }
                
                // Save to history
                const newPost = {
                    id: Date.now(),
                    type: 'generated',
                    subreddit: subreddit,
                    title: data.post.title || 'Untitled',
                    content: data.post.content || data.post,
                    timestamp: new Date().toISOString()
                };
                
                userPostHistory.unshift(newPost);
                localStorage.setItem('userPostHistory', JSON.stringify(userPostHistory));
                displayHistory();
                
                showToast('Post generated successfully!', 'success');
            } else {
                showToast('Failed to deduct credit', 'error');
            }
        } else {
            throw new Error('Invalid response from server');
        }
        
    } catch (error) {
        console.error('❌ Generation error:', error);
        showToast('Error: ' + error.message, 'error');
        
        if (outputDiv) {
            outputDiv.innerHTML = `
                <div class="alert alert-danger">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
        }
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-magic me-2"></i>Generate Post';
        }
    }
}

// ============================================
// POST OPTIMIZATION
// ============================================
async function handleOptimizePost() {
    const postContent = document.getElementById('optimizerPostInput')?.value.trim();
    const subreddit = document.getElementById('optimizerSubredditInput')?.value.trim();
    
    if (!postContent || !subreddit) {
        showToast('Please fill in all fields', 'warning');
        return;
    }
    
    if (!currentUser) {
        showToast('Please sign in to optimize posts', 'warning');
        showAuthModal();
        return;
    }
    
    if (!hasCreditsLeft()) {
        showToast('No credits remaining. Please upgrade your plan.', 'error');
        navigateToPage('pricing');
        return;
    }
    
    const optimizeBtn = document.getElementById('optimizerOptimizeBtn');
    const outputDiv = document.getElementById('optimizedOutput');
    
    if (optimizeBtn) {
        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Optimizing...';
    }
    
    try {
        // Fetch Reddit rules
        showToast('Fetching subreddit rules...', 'info');
        const rulesResponse = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`);
        
        if (!rulesResponse.ok) {
            throw new Error('Failed to fetch subreddit rules');
        }
        
        const rulesData = await rulesResponse.json();
        
        // Optimize post
        showToast('Optimizing post...', 'info');
        const response = await fetch(`${API_URL}/api/optimize-post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subreddit: subreddit,
                postContent: postContent,
                rules: rulesData.rules
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to optimize post');
        }
        
        const data = await response.json();
        
        if (data.success && data.optimizedPost) {
            // Deduct credit
            const creditDeducted = await deductCreditFromDatabase();
            
            if (creditDeducted) {
                // Display result
                if (outputDiv) {
                    outputDiv.innerHTML = `
                        <div class="alert alert-success">
                            <h5>✅ Post Optimized!</h5>
                            <div class="mt-3">
                                <strong>Optimized Content:</strong>
                                <p style="white-space: pre-wrap;">${data.optimizedPost}</p>
                            </div>
                        </div>
                    `;
                }
                
                // Save to history
                const newPost = {
                    id: Date.now(),
                    type: 'optimized',
                    subreddit: subreddit,
                    title: 'Optimized Post',
                    content: data.optimizedPost,
                    timestamp: new Date().toISOString()
                };
                
                userPostHistory.unshift(newPost);
                localStorage.setItem('userPostHistory', JSON.stringify(userPostHistory));
                displayHistory();
                
                showToast('Post optimized successfully!', 'success');
            } else {
                showToast('Failed to deduct credit', 'error');
            }
        } else {
            throw new Error('Invalid response from server');
        }
        
    } catch (error) {
        console.error('❌ Optimization error:', error);
        showToast('Error: ' + error.message, 'error');
        
        if (outputDiv) {
            outputDiv.innerHTML = `
                <div class="alert alert-danger">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
        }
    } finally {
        if (optimizeBtn) {
            optimizeBtn.disabled = false;
            optimizeBtn.innerHTML = '<i class="fas fa-check-circle me-2"></i>Optimize';
        }
    }
}

// ============================================
// HISTORY DISPLAY
// ============================================
function displayHistory() {
    const historyContainer = document.getElementById('historyContainer');
    
    if (!historyContainer) {
        console.warn('⚠️ History container not found');
        return;
    }
    
    if (userPostHistory.length === 0) {
        historyContainer.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No posts yet. Generate your first post!</p>
            </div>
        `;
        return;
    }
    
    historyContainer.innerHTML = userPostHistory.map(post => `
        <div class="card mb-3">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="card-title mb-0">${post.title}</h5>
                    <span class="badge bg-${post.type === 'generated' ? 'primary' : 'success'}">
                        ${post.type === 'generated' ? 'Generated' : 'Optimized'}
                    </span>
                </div>
                <p class="text-muted small mb-2">
                    <i class="fas fa-reddit me-1"></i>r/${post.subreddit} • 
                    ${new Date(post.timestamp).toLocaleString()}
                </p>
                <p class="card-text" style="white-space: pre-wrap;">${post.content}</p>
                <button class="btn btn-sm btn-outline-primary" onclick="copyToClipboard(\`${post.content.replace(/`/g, '\\`')}\`)">
                    <i class="fas fa-copy me-1"></i>Copy
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteHistoryItem(${post.id})">
                    <i class="fas fa-trash me-1"></i>Delete
                </button>
            </div>
        </div>
    `).join('');
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
        try {
            userPostHistory = JSON.parse(savedHistory);
        } catch (error) {
            console.error('Error loading history:', error);
            userPostHistory = [];
        }
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
    
    // Update plan details in profile section
    const profilePlanName = document.getElementById('profilePlanName');
    const profileCredits = document.getElementById('profileCredits');
    const profileBillingCycle = document.getElementById('profileBillingCycle');
    
    if (profilePlanName) profilePlanName.textContent = userPlan.name;
    if (profileCredits) profileCredits.textContent = `${userCredits} / ${userPlan.postsPerMonth}`;
    if (profileBillingCycle && userPlan.billingCycle) {
        profileBillingCycle.textContent = userPlan.billingCycle.charAt(0).toUpperCase() + userPlan.billingCycle.slice(1);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy', 'error');
    });
}

function deleteHistoryItem(postId) {
    if (confirm('Are you sure you want to delete this post?')) {
        userPostHistory = userPostHistory.filter(post => post.id !== postId);
        localStorage.setItem('userPostHistory', JSON.stringify(userPostHistory));
        displayHistory();
        updateStatsDisplay();
        showToast('Post deleted', 'success');
    }
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    
    if (!toastContainer) {
        console.warn('Toast container not found');
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'primary'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 5000 });
    bsToast.show();
    
    setTimeout(() => toast.remove(), 6000);
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

// ============================================
// EXPOSE FUNCTIONS GLOBALLY
// ============================================
window.navigateToPage = navigateToPage;
window.initiateDodoPayment = initiateDodoPayment;
window.copyToClipboard = copyToClipboard;
window.deleteHistoryItem = deleteHistoryItem;

console.log('✅ Dashboard.js loaded successfully');