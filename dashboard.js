// ============================================
// PRODUCTION-READY DASHBOARD.JS (FULLY FIXED)
// ============================================

// --- SUPABASE & API CONFIG ---
const SUPABASE_URL = 'https://duzaoqvdukdnbjzccwbp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1emFvcXZkdWtkbmJqemNjd2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTE2MTIsImV4cCI6MjA3NzQ2NzYxMn0.eMvGGHRuqzeGjVMjfLViaJnMvaKryGCPWWaDyFK6UP8';
const API_URL = 'https://redrules.onrender.com';

// --- GLOBAL STATE ---
let supabaseClient = null;
let currentUser = null;
let userProfile = null;
let userPlan = null;
let userHistory = [];
let bootstrapModals = {};
let bootstrapToast = null;
let isServerAwake = false;
let isDataLoading = false;
let serverWakeupPromise = null;

// --- PRICING DATA ---
const PRICING_DATA = {
    starter: {
        monthly: { 
            price: 1.99, 
            posts: 150,
            productId: 'pdt_LBHf0mWr6mV54umDhx9cn',
            checkoutUrl: 'https://test.checkout.dodopayments.com/buy/pdt_XocDrGw3HxTb0nD7nyYyl?quantity=1'
        },
        yearly: { 
            price: 21.49, 
            posts: 1800,
            productId: 'pdt_RBEfQWVlN9bnWihieBQSt',
            checkoutUrl: 'https://checkout.dodopayments.com/buy/pdt_RBEfQWVlN9bnWihieBQSt'
        }
    },
    professional: {
        monthly: { 
            price: 2.99, 
            posts: 250,
            productId: 'pdt_dumBrrIeNTtENukKXHiGh',
            checkoutUrl: 'https://checkout.dodopayments.com/buy/pdt_dumBrrIeNTtENukKXHiGh'
        },
        yearly: { 
            price: 32.49, 
            posts: 3000,
            productId: 'pdt_gBCE38rNQm8x30iqAltc6',
            checkoutUrl: 'https://checkout.dodopayments.com/buy/pdt_gBCE38rNQm8x30iqAltc6'
        }
    },
    enterprise: {
        monthly: { 
            price: 3.99, 
            posts: 500,
            productId: 'pdt_UHLjlc1qPLgSvK1ubHjgJ',
            checkoutUrl: 'https://checkout.dodopayments.com/buy/pdt_UHLjlc1qPLgSvK1ubHjgJ'
        },
        yearly: { 
            price: 43.49, 
            posts: 6000,
            productId: 'pdt_E9rxQwDMZahet7kADcna5',
            checkoutUrl: 'https://checkout.dodopayments.com/buy/pdt_E9rxQwDMZahet7kADcna5'
        }
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ Dashboard initializing...');
    
    try {
        if (!window.supabase) throw new Error('Supabase library not loaded.');
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        if (!window.bootstrap) throw new Error('Bootstrap library not loaded.');
        initBootstrapComponents();
        
        initializeEventListeners();
        updatePricingDisplay();
        
        // Wake up server immediately on page load
        wakeUpServerInBackground();
        
        await handlePaymentCallback();
        
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Auth state changed:', event);
            
            if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
                currentUser = session.user;
                hideAuthModal();
                
                await loadUserData(session.access_token);
                
                if (event === 'SIGNED_IN') {
                    showToast('Welcome back!', 'success');
                }
                hideLoadingScreen();

            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                userProfile = null;
                userPlan = null;
                userHistory = [];
                isServerAwake = false;
                isDataLoading = false;
                showAuthModal();
                hideLoadingScreen();
            }
        });
        
        await checkAuthState();

    } catch (error) {
        console.error('❌ FATAL: Dashboard initialization failed:', error);
        hideLoadingScreen();
        showErrorAlert(error.message);
    }
});

function initBootstrapComponents() {
    const modalIds = ['authModal', 'viewPostModal', 'changePasswordModal', 'deleteAccountModal'];
    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) bootstrapModals[id] = new bootstrap.Modal(el);
    });

    const toastEl = document.getElementById('notificationToast');
    if (toastEl) bootstrapToast = new bootstrap.Toast(toastEl, { delay: 4000 });
}

function showErrorAlert(message) {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        loadingScreen.innerHTML = `
            <div class="text-danger p-5 text-center" style="max-width: 600px; margin: auto;">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <h5 class="fw-bold">Application Failed to Load</h5>
                <p class="text-muted">An error occurred. Please refresh the page.</p>
                <code class="text-dark d-block bg-light p-2 rounded small">${message}</code>
                <button class="btn btn-primary mt-3" onclick="location.reload()">Reload Page</button>
            </div>`;
    }
}

// Improved server wake-up with promise caching
async function wakeUpServerInBackground() {
    if (isServerAwake || serverWakeupPromise) return serverWakeupPromise;

    console.log('🔥 Waking up server in background...');
    
    serverWakeupPromise = (async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout
            
            const response = await fetch(`${API_URL}/api/test`, { 
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            
            console.log('✅ Server is awake and ready!');
            isServerAwake = true;
            return true;
        } catch (error) {
            console.error('❌ Server wake-up failed:', error.message);
            isServerAwake = false;
            serverWakeupPromise = null; // Reset so it can be retried
            throw error;
        }
    })();
    
    return serverWakeupPromise;
}

async function checkAuthState() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        if (!session) {
            console.log('⚠️ No active session');
            hideLoadingScreen();
            showAuthModal();
        }
    } catch (error) {
        console.error('❌ Auth state check error:', error);
        hideLoadingScreen();
        showErrorAlert(error.message);
    }
}

// ============================================
// DATA FETCHING & UI UPDATES (FIXED)
// ============================================

function showDataLoadingPlaceholders() {
    console.log('Displaying loading placeholders...');
    const shimmer = '<span class="placeholder-glow"><span class="placeholder col-6"></span></span>';
    
    setText('creditsLeft', '...');
    setText('dropdownUserName', 'Loading...');
    setText('dropdownUserEmail', '...');
    setText('dropdownCreditsUsed', '... / ...');
    setText('dropdownTotalPosts', '...');
    setText('dropdownJoinDate', '...');
    setText('profileName', 'Loading...');
    setText('profileEmail', '...');
    setText('totalPosts', '...');
    setText('creditsUsed', '...');
    setText('memberSince', '...');
    setValue('settingsEmail', 'Loading...');
    setText('settingsCreditsDisplay', '...');
}

async function loadUserData(token) {
    if (isDataLoading) {
        console.log('[loadUserData] Already loading, skipping.');
        return;
    }
    if (!currentUser || !token) {
        console.error('[loadUserData] No user or token.');
        return;
    }
    
    isDataLoading = true;
    console.log('[loadUserData] Starting data fetch...');
    showDataLoadingPlaceholders();

    try {
        // Ensure server is awake
        await wakeUpServerInBackground();
        
        console.log('[loadUserData] Fetching user data from API...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout
        
        const response = await fetch(`${API_URL}/api/user/data`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log(`[loadUserData] Response status: ${response.status}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
            console.log('[loadUserData] ✅ Data loaded successfully');
            userProfile = data.profile;
            userPlan = data.plan;
            userHistory = data.history || [];
            updateUI();
        } else {
            throw new Error(data.error || 'Failed to load data');
        }

    } catch (error) {
        console.error('❌ Error loading data:', error.message);
        
        if (error.name === 'AbortError') {
            showToast('Server is taking too long to respond. Please refresh.', 'error');
        } else {
            showToast(`Failed to load data: ${error.message}`, 'error');
        }
        
        showDataErrorState(error.message);
    } finally {
        isDataLoading = false;
    }
}

function showDataErrorState(errorMessage) {
    console.error('Displaying error state:', errorMessage);
    setText('creditsLeft', '!');
    setText('dropdownUserName', 'Error');
    setText('dropdownUserEmail', 'Could not load');
    setText('profileName', 'Error');
    setText('settingsCreditsDisplay', '!');
}

function updateUI() {
    if (!userProfile || !userPlan) return;
    console.log('Updating UI with real data...');

    const credits = userPlan.credits_remaining || 0;
    const maxCredits = userPlan.posts_per_month || 0;
    const creditsUsed = maxCredits - credits;
    const progressPercent = maxCredits > 0 ? (creditsUsed / maxCredits) * 100 : 0;
    const joinDate = new Date(userProfile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    setText('creditsLeft', credits);
    setText('dropdownUserName', userProfile.display_name || userProfile.email);
    setText('dropdownUserEmail', userProfile.email);
    setText('dropdownCreditsUsed', `${creditsUsed} / ${maxCredits}`);
    setStyle('creditsProgress', 'width', `${progressPercent}%`);
    setText('dropdownTotalPosts', userHistory.length);
    setText('dropdownJoinDate', joinDate);
    setText('profileName', userProfile.display_name || userProfile.email);
    setText('profileEmail', userProfile.email);
    setText('totalPosts', userHistory.length);
    setText('creditsUsed', creditsUsed);
    setText('memberSince', joinDate.split(' ')[1]);
    setValue('settingsEmail', userProfile.email);
    setValue('settingsDisplayName', userProfile.display_name || '');
    setValue('settingsBio', userProfile.bio || '');
    setText('settingsCreditsDisplay', credits);
    setText('settingsCreditsSubtext', `${credits} / ${maxCredits} credits remaining`);
    setStyle('settingsProgressDisplay', 'width', `${progressPercent}%`);

    displayHistory();
}

function displayHistory() {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;

    if (userHistory.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-5">
                    <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                    No posts yet. Start generating!
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = userHistory.map(post => {
        const date = new Date(post.created_at).toLocaleDateString();
        const type = post.post_type === 'generated' 
            ? '<span class="badge bg-primary">Generated</span>'
            : '<span class="badge bg-success">Optimized</span>';
        const preview = (post.title || post.content).substring(0, 50) + '...';

        return `
            <tr>
                <td>${date}</td>
                <td>r/${post.subreddit}</td>
                <td>${type}</td>
                <td>${preview}</td>
                <td>
                    <button class="btn btn-sm btn-outline-info" data-post-id="${post.id}">
                        <i class="fas fa-eye me-1"></i>View
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.querySelectorAll('[data-post-id]').forEach(button => {
        button.addEventListener('click', () => {
            const postId = button.dataset.postId;
            const post = userHistory.find(p => p.id == postId);
            if (post) showViewPostModal(post);
        });
    });
}

// ============================================
// AUTHENTICATION
// ============================================

async function handleLogin(e) {
    e.preventDefault();
    const email = getValue('loginEmail').trim();
    const password = getValue('loginPassword');
    
    if (!email || !password) {
        return showToast('Please enter email and password', 'warning');
    }
    
    setButtonLoading('loginButton', true, 'Signing In...');

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ 
            email, 
            password 
        });
        
        if (error) throw error;
        if (!data.session) throw new Error('Login failed - no session created');
        
    } catch (error) {
        console.error('❌ Login error:', error);
        showToast(error.message || 'Login failed', 'error');
    } finally {
        setButtonLoading('loginButton', false, '<i class="fas fa-sign-in-alt me-2"></i>Sign In');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const email = getValue('signupEmail').trim();
    const password = getValue('signupPassword');
    const confirm = getValue('signupPasswordConfirm');

    if (!email || !password || !confirm) {
        return showToast('Please fill all fields', 'warning');
    }
    if (password.length < 8) {
        return showToast('Password must be at least 8 characters', 'warning');
    }
    if (password !== confirm) {
        return showToast('Passwords do not match!', 'error');
    }

    setButtonLoading('signupButton', true, 'Creating Account...');

    try {
        const { data, error } = await supabaseClient.auth.signUp({ 
            email, 
            password,
            options: { 
                emailRedirectTo: `${window.location.origin}/dashboard.html`
            }
        });
        
        if (error) throw error;

        if (data.user) {
            showToast('Account created! Check email to verify.', 'success');
            setValue('signupEmail', '');
            setValue('signupPassword', '');
            setValue('signupPasswordConfirm', '');
            setTimeout(showLoginSection, 2000);
        }
    } catch (error) {
        console.error('❌ Signup error:', error);
        showToast(error.message || 'Signup failed', 'error');
    } finally {
        setButtonLoading('signupButton', false, '<i class="fas fa-user-plus me-2"></i>Create Account');
    }
}

async function handleGoogleSignIn() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { 
                redirectTo: `${window.location.origin}/dashboard.html`
            }
        });
        
        if (error) throw error;
        
    } catch (error) {
        console.error('❌ Google sign-in error:', error);
        showToast(error.message || 'Google sign-in failed', 'error');
    }
}

async function handleSignOut() {
    try {
        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error('❌ Sign out error:', error);
        showToast(error.message || 'Sign out failed', 'error');
    }
}

// ============================================
// AI & OPTIMIZER FUNCTIONS (FIXED)
// ============================================

async function handleFetchRules(type) {
    const isAI = type === 'ai';
    const inputId = isAI ? 'aiSubredditInput' : 'optimizerSubredditInput';
    const buttonId = isAI ? 'aiFetchGuidelinesBtn' : 'optimizerFetchGuidelinesBtn';
    const containerId = isAI ? 'aiGuidelinesContainer' : 'optimizerGuidelinesContainer';
    const contentId = isAI ? 'aiGuidelinesContent' : 'optimizerGuidelinesContent';
    const subredditId = isAI ? 'aiGuidelineSubreddit' : 'optimizerGuidelineSubreddit';
    
    const subreddit = getValue(inputId).trim();
    if (!subreddit) return showToast('Please enter a subreddit name', 'warning');

    setButtonLoading(buttonId, true, 'Fetching...');
    
    try {
        await wakeUpServerInBackground();
        
        const response = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Could not fetch rules');
        }

        setText(subredditId, data.subreddit);
        document.getElementById(contentId).innerHTML = data.rules.replace(/\n/g, '<br>');
        show(containerId);
        
        if (!isAI) {
            document.getElementById('optimizerOptimizeBtn').disabled = false;
            setText('optimizerButtonHelp', 'Ready to optimize!');
        }
        
        showToast('Rules fetched successfully!', 'success');

    } catch (error) {
        console.error('❌ Rules fetch error:', error);
        showToast(error.message, 'error');
    } finally {
        const icon = '<i class="fas fa-search me-1"></i>Fetch Rules';
        setButtonLoading(buttonId, false, icon);
    }
}

async function handleAIGenerate(isRegen = false) {
    if (!userPlan || userPlan.credits_remaining <= 0) {
        showToast('No credits remaining. Please upgrade.', 'error');
        return navigateToPage('pricing');
    }
    
    const subreddit = getValue('aiSubredditInput').trim();
    const topic = getValue('aiTopicInput').trim();
    const style = getValue('aiStyleSelect');
    const rules = getText('aiGuidelinesContent') || 'Follow standard Reddit etiquette';

    if (!subreddit || !topic) {
        return showToast('Please enter subreddit and topic', 'warning');
    }

    setButtonLoading('aiGenerateBtn', true, 'Generating...');
    if (isRegen) setButtonLoading('aiRegenerateBtn', true, 'Regenerating...');

    try {
        await wakeUpServerInBackground();
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const response = await fetch(`${API_URL}/api/generate-post`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ subreddit, topic, style, rules })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Generation failed');

        setValue('aiGeneratedTitle', data.post.title);
        setValue('aiGeneratedContent', data.post.content);
        setText('aiTargetSubreddit', subreddit);
        show('aiOutputCard');
        
        userPlan.credits_remaining = data.creditsRemaining;
        userHistory.unshift(data.historyItem);
        updateUI();
        
        showToast('Content generated successfully!', 'success');

    } catch (error) {
        console.error('❌ AI generate error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('aiGenerateBtn', false, '<i class="fas fa-wand-magic-sparkles me-2"></i>Generate Content');
        if (isRegen) setButtonLoading('aiRegenerateBtn', false, '<i class="fas fa-sync me-1"></i>Try Again');
    }
}

async function handleOptimize(isRegen = false) {
    if (!userPlan || userPlan.credits_remaining <= 0) {
        showToast('No credits remaining. Please upgrade.', 'error');
        return navigateToPage('pricing');
    }

    const subreddit = getValue('optimizerSubredditInput').trim();
    const content = getValue('optimizerContentInput').trim();
    const style = getValue('optimizationStyleSelect');
    const rules = getText('optimizerGuidelinesContent') || 'Follow standard Reddit guidelines';

    if (!subreddit || !content) {
        return showToast('Please enter subreddit and content', 'warning');
    }

    setButtonLoading('optimizerOptimizeBtn', true, 'Optimizing...');
    if (isRegen) setButtonLoading('optimizerRegenerateBtn', true, 'Optimizing...');

    try {
        await wakeUpServerInBackground();
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const response = await fetch(`${API_URL}/api/optimize-post`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ subreddit, content, style, rules })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Optimization failed');

        setValue('optimizerOptimizedText', data.optimizedPost);
        setText('optimizerTargetSubreddit', subreddit);
        show('optimizerOutputCard');
        
        userPlan.credits_remaining = data.creditsRemaining;
        userHistory.unshift(data.historyItem);
        updateUI();
        
        showToast('Content optimized successfully!', 'success');

    } catch (error) {
        console.error('❌ Optimize error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('optimizerOptimizeBtn', false, '<i class="fas fa-magic me-2"></i>Optimize Content');
        if (isRegen) setButtonLoading('optimizerRegenerateBtn', false, '<i class="fas fa-sync me-1"></i>Optimize Again');
    }
}

// ============================================
// PAYMENT FUNCTIONS (FIXED WITH METADATA)
// ============================================

// ==========================================
// PAYMENT FUNCTIONS (FIXED)
// ==========================================

// ==========================================
// PAYMENT FUNCTIONS (FULLY FIXED)
// ==========================================

async function initiateDodoPayment(planType) {
    if (!currentUser) {
        showToast('Please sign in to upgrade', 'warning');
        return showAuthModal();
    }
    
    const billingCycle = document.querySelector('input[name="billingCycle"]:checked').value;
    const planData = PRICING_DATA[planType][billingCycle];
    
    try {
        const pendingPayment = {
            userId: currentUser.id,
            email: currentUser.email,
            plan: planType,
            billingCycle: billingCycle,
            postsPerMonth: planData.posts,
            amount: planData.price,
            timestamp: Date.now()
        };
        
        localStorage.setItem('pending_payment', JSON.stringify(pendingPayment));
        showToast('Redirecting to secure checkout...', 'info');
        
        // Build complete checkout URL with all parameters
        const successUrl = encodeURIComponent(`${FRONTEND_URL}/dashboard.html?payment=success`);
        const cancelUrl = encodeURIComponent(`${FRONTEND_URL}/dashboard.html?payment=cancelled`);
        
        let checkoutUrl = planData.checkoutUrl;
        
        // Add separator
        const separator = checkoutUrl.includes('?') ? '&' : '?';
        
        // Add ALL metadata for webhook processing
        const params = new URLSearchParams({
            'return_url': successUrl,
            'cancel_url': cancelUrl,
            'metadata[userId]': currentUser.id,
            'metadata[email]': currentUser.email,
            'metadata[plan]': planType,
            'metadata[billingCycle]': billingCycle,
            'metadata[posts]': planData.posts.toString(),
            'metadata[amount]': planData.price.toString()
        });
        
        checkoutUrl = `${checkoutUrl}${separator}${params.toString()}`;
        
        console.log('🔗 Redirecting to:', checkoutUrl);
        
        setTimeout(() => {
            window.location.href = checkoutUrl;
        }, 800);

    } catch (error) {
        console.error('❌ Payment init error:', error);
        showToast(error.message || 'Failed to initiate payment', 'error');
    }
}

async function handlePaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id') || urlParams.get('payment_id');
    
    // Detect Dodo redirect (has session_id but no explicit status)
    if (sessionId && !paymentStatus) {
        console.log('🎉 Detected Dodo return with session:', sessionId);
        await processPaymentSuccess(sessionId);
        return;
    }
    
    // Handle explicit status
    if (paymentStatus === 'success') {
        console.log('✅ Payment success status detected');
        await processPaymentSuccess(sessionId);
    } else if (paymentStatus === 'cancelled') {
        showToast('Payment was cancelled.', 'warning');
        localStorage.removeItem('pending_payment');
        window.history.replaceState({}, document.title, window.location.pathname);
        navigateToPage('pricing');
    }
}

async function processPaymentSuccess(sessionId) {
    showToast('🎉 Payment successful! Activating plan...', 'success');
    
    const pendingPayment = localStorage.getItem('pending_payment');
    if (!pendingPayment) {
        showToast('Payment data not found. Please check your plan status.', 'warning');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }
    
    try {
        const paymentData = JSON.parse(pendingPayment);
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (!session) {
            throw new Error('Not authenticated');
        }
        
        // Ensure server is awake
        await wakeUpServerInBackground();
        
        console.log('📡 Verifying payment with backend...');
        
        const response = await fetch(`${API_URL}/api/payment/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ 
                ...paymentData, 
                sessionId: sessionId || `manual_${Date.now()}`
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('✅ Plan activated successfully!', 'success');
            localStorage.removeItem('pending_payment');
            
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Reload user data to get updated credits
            setTimeout(async () => {
                await loadUserData(session.access_token);
                navigateToPage('aiGenerator');
            }, 1500);
        } else {
            throw new Error(result.error || 'Activation failed');
        }
    } catch (error) {
        console.error('❌ Payment verification error:', error);
        showToast('Payment received but activation failed. Contact support.', 'warning');
        localStorage.removeItem('pending_payment');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function updatePricingDisplay() {
    const cycleInput = document.querySelector('input[name="billingCycle"]:checked');
    if (!cycleInput) return;
    
    const cycle = cycleInput.value;
    
    Object.keys(PRICING_DATA).forEach(plan => {
        const data = PRICING_DATA[plan][cycle];
        setText(`${plan}Price`, `$${data.price}`);
        setText(`${plan}Posts`, `${data.posts} Posts Per ${cycle === 'yearly' ? 'Year' : 'Month'}`);
        setText(`${plan}Billing`, cycle === 'yearly' ? '/year' : '/month');
    });
}

// ============================================
// SETTINGS PAGE FUNCTIONS
// ============================================

async function handleSaveProfile() {
    const displayName = getValue('settingsDisplayName').trim();
    const bio = getValue('settingsBio').trim();

    setButtonLoading('saveProfileBtn', true, 'Saving...');

    try {
        await wakeUpServerInBackground();
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const response = await fetch(`${API_URL}/api/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ displayName, bio })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        userProfile = data.profile;
        updateUI();
        showToast('Profile saved successfully!', 'success');

    } catch (error) {
        console.error('❌ Save profile error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('saveProfileBtn', false, '<i class="fas fa-save me-2"></i>Save Profile Changes');
    }
}

async function handleChangePassword() {
    const newPassword = getValue('newPassword');
    const confirm = getValue('confirmPassword');

    if (!newPassword || !confirm) return showToast('Please fill all fields', 'warning');
    if (newPassword.length < 8) return showToast('Password must be at least 8 characters', 'warning');
    if (newPassword !== confirm) return showToast('Passwords do not match!', 'error');

    setButtonLoading('changePasswordBtn', true, 'Updating...');

    try {
        await wakeUpServerInBackground();
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const response = await fetch(`${API_URL}/api/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ newPassword })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        showToast('Password updated successfully!', 'success');
        bootstrapModals.changePasswordModal.hide();
        setValue('newPassword', '');
        setValue('confirmPassword', '');

    } catch (error) {
        console.error('❌ Change password error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('changePasswordBtn', false, '<i class="fas fa-save me-2"></i>Update Password');
    }
}

async function handleLogoutAll() {
    if (!confirm('Sign out from all devices?')) return;
    
    setButtonLoading('logoutAllBtn', true, 'Logging out...');

    try {
        await wakeUpServerInBackground();
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const response = await fetch(`${API_URL}/api/auth/logout-all`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        await handleSignOut();

    } catch (error) {
        console.error('❌ Logout all error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('logoutAllBtn', false, '<i class="fas fa-sign-out-alt me-2"></i>Logout All Devices');
    }
}

async function handleDeleteAccount() {
    const password = getValue('deleteConfirmPassword');
    if (!password) return showToast('Enter password to confirm', 'warning');

    setButtonLoading('deleteAccountBtn', true, 'Deleting...');

    try {
        await wakeUpServerInBackground();
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const response = await fetch(`${API_URL}/api/auth/delete-account`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        bootstrapModals.deleteAccountModal.hide();
        await handleSignOut();
        showToast('Account deleted.', 'success');

    } catch (error) {
        console.error('❌ Delete account error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('deleteAccountBtn', false, '<i class="fas fa-trash me-2"></i>Delete My Account');
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function initializeEventListeners() {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('googleSignInBtn')?.addEventListener('click', handleGoogleSignIn);
    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('dropdownSignOutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('showSignupLink')?.addEventListener('click', (e) => { e.preventDefault(); showSignupSection(); });
    document.getElementById('showLoginLink')?.addEventListener('click', (e) => { e.preventDefault(); showLoginSection(); });

    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(item.dataset.page);
        });
    });
    document.querySelectorAll('[data-page-link]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(item.dataset.pageLink);
        });
    });
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });

    document.getElementById('aiFetchGuidelinesBtn')?.addEventListener('click', () => handleFetchRules('ai'));
    document.getElementById('aiGenerateBtn')?.addEventListener('click', () => handleAIGenerate(false));
    document.getElementById('aiRegenerateBtn')?.addEventListener('click', () => handleAIGenerate(true));
    document.getElementById('aiCopyBtn')?.addEventListener('click', () => {
        const text = `Title: ${getValue('aiGeneratedTitle')}\n\nContent:\n${getValue('aiGeneratedContent')}`;
        copyToClipboard(text, 'Post copied!');
    });

    document.getElementById('optimizerFetchGuidelinesBtn')?.addEventListener('click', () => handleFetchRules('optimizer'));
    document.getElementById('optimizerOptimizeBtn')?.addEventListener('click', () => handleOptimize(false));
    document.getElementById('optimizerRegenerateBtn')?.addEventListener('click', () => handleOptimize(true));
    document.getElementById('optimizerCopyBtn')?.addEventListener('click', () => {
        copyToClipboard(getValue('optimizerOptimizedText'), 'Content copied!');
    });

    document.getElementById('monthlyBilling')?.addEventListener('change', updatePricingDisplay);
    document.getElementById('yearlyBilling')?.addEventListener('change', updatePricingDisplay);
    document.getElementById('saveProfileBtn')?.addEventListener('click', handleSaveProfile);
    document.getElementById('changePasswordBtn')?.addEventListener('click', handleChangePassword);
    document.getElementById('logoutAllBtn')?.addEventListener('click', handleLogoutAll);
    document.getElementById('deleteAccountBtn')?.addEventListener('click', handleDeleteAccount);
    document.getElementById('viewPostCopyBtn')?.addEventListener('click', () => {
        copyToClipboard(getValue('viewPostContent'), 'Copied!');
    });
}

// ============================================
// MODAL & NAVIGATION UTILITIES
// ============================================

function navigateToPage(pageName) {
    if (!pageName) return;
    
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${pageName}Section`)?.classList.add('active');
    
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });

    const titles = {
        aiGenerator: 'AI Generator',
        contentOptimizer: 'Content Optimizer',
        history: 'Post History',
        profile: 'Profile',
        settings: 'Settings',
        pricing: 'Pricing Plans'
    };
    setText('pageTitle', titles[pageName] || 'Dashboard');
    document.getElementById('sidebar')?.classList.remove('active');
}

function showViewPostModal(post) {
    setValue('viewPostSubreddit', `r/${post.subreddit}`);
    setValue('viewPostContentTitle', post.title || '');
    setValue('viewPostContent', post.content);
    if (bootstrapModals.viewPostModal) bootstrapModals.viewPostModal.show();
}

function showAuthModal() {
    if (bootstrapModals.authModal) bootstrapModals.authModal.show();
}

function hideAuthModal() {
    if (bootstrapModals.authModal) {
        try {
            bootstrapModals.authModal.hide();
        } catch (e) {
            console.warn("Auth modal hide error:", e.message);
        }
    }
}

function showLoadingScreen() {
    const el = document.getElementById('loadingScreen');
    if (el) el.style.display = 'flex';
}

function hideLoadingScreen() {
    const el = document.getElementById('loadingScreen');
    if (el) el.style.display = 'none';
}

function showLoginSection() {
    hide('signupSection');
    show('emailAuthSection');
}

function showSignupSection() {
    hide('emailAuthSection');
    show('signupSection');
}

// ============================================
// DOM & UTILITY HELPERS
// ============================================

function show(id, displayType = 'block') {
    const el = document.getElementById(id);
    if (el) el.style.display = displayType;
}

function hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function getText(id) {
    const el = document.getElementById(id);
    return el ? el.textContent : '';
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function setStyle(id, prop, value) {
    const el = document.getElementById(id);
    if (el) el.style[prop] = value;
}

function setButtonLoading(id, isLoading, loadingText = '') {
    const btn = document.getElementById(id);
    if (!btn) return;
    
    btn.disabled = isLoading;
    if (isLoading) {
        btn.innerHTML = `
            <span class="spinner-border spinner-border-sm" role="status"></span>
            ${loadingText}
        `;
    } else {
        btn.innerHTML = loadingText;
    }
}

function showToast(message, type = 'info') {
    const toastEl = document.getElementById('notificationToast');
    const titleEl = document.getElementById('toastTitle');
    const messageEl = document.getElementById('toastMessage');

    if (!toastEl || !titleEl || !messageEl || !bootstrapToast) return;

    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-white');
    
    const types = {
        success: { title: 'Success', icon: 'fa-check-circle', bg: 'bg-success' },
        error:   { title: 'Error', icon: 'fa-exclamation-circle', bg: 'bg-danger' },
        warning: { title: 'Warning', icon: 'fa-exclamation-triangle', bg: 'bg-warning' },
        info:    { title: 'Info', icon: 'fa-info-circle', bg: 'bg-info' }
    };
    
    const config = types[type] || types.info;
    
    titleEl.innerHTML = `<i class="fas ${config.icon} me-2"></i>${config.title}`;
    messageEl.textContent = message;
    toastEl.classList.add(config.bg, 'text-white');

    if (bootstrapToast) bootstrapToast.show();
}

function copyToClipboard(text, successMessage) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage, 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy', 'error');
    });
}

// ============================================
// GLOBAL EXPORTS
// ============================================
window.navigateToPage = navigateToPage;
window.initiateDodoPayment = initiateDodoPayment;