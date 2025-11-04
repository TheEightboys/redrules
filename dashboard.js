// ============================================
// PRODUCTION-READY DASHBOARD.JS (FIXED)
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
let isServerAwake = false; // <-- NEW: Track server state

// --- PRICING DATA ---
const PRICING_DATA = {
    starter: {
        monthly: { 
            price: 1.99, 
            posts: 150,
            productId: 'pdt_LBHf0mWr6mV54umDhx9cn',
            checkoutUrl: 'https://checkout.dodopayments.com/buy/pdt_LBHf0mWr6mV54umDhx9cn'
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
        
        await handlePaymentCallback();
        
        // --- MODIFIED onAuthStateChange ---
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Auth state changed:', event);
            
            if (event === 'SIGNED_IN' && session) {
                currentUser = session.user;
                hideAuthModal();
                hideLoadingScreen();
                
                await wakeUpServer(); // <-- ADDED PING
                await loadUserData(); 
                showToast('Welcome back!', 'success');

            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                userProfile = null;
                userPlan = null;
                userHistory = [];
                isServerAwake = false; // Reset on sign out
                showAuthModal();
                hideLoadingScreen();
            }
        });
        
        await checkAuthState();
        initializeEventListeners();
        updatePricingDisplay();

    } catch (error) {
        console.error('❌ FATAL: Dashboard initialization failed:', error);
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="text-danger p-5 text-center" style="max-width: 600px; margin: auto;">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                    <h5 class="fw-bold">Application Failed to Load</h5>
                    <p class="text-muted">An error occurred during initialization. Please check your internet connection and make sure browser extensions (like adblockers) are not blocking essential scripts.</p>
                    <code class="text-dark d-block bg-light p-2 rounded small">${error.message}</code>
                </div>`;
        }
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

// --- NEW FUNCTION ---
async function wakeUpServer() {
    if (isServerAwake) return; // Don't ping if already awake

    console.log('Pinging server to wake it up...');
    showToast('Waking up server... this can take up to 60s.', 'info');
    try {
        const startTime = Date.now();
        // Ping the root '/' endpoint which is fast
        const response = await fetch(API_URL, { method: 'GET' }); 
        if (!response.ok) throw new Error(`Server ping returned status ${response.status}`);
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`✅ Server is awake. (Took ${duration.toFixed(2)}s)`);
        showToast('Server is awake! Loading your data.', 'success');
        isServerAwake = true;
    } catch (error) {
        console.error('❌ Server ping failed:', error);
        showToast('Could not connect to the server.', 'error');
        isServerAwake = false; // Allow retry
    }
}

// --- MODIFIED checkAuthState ---
async function checkAuthState() {
    let sessionFound = false;
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;

        if (session && session.user) {
            console.log('✅ User authenticated:', session.user.email);
            currentUser = session.user;
            hideAuthModal();
            sessionFound = true;
        } else {
            console.log('⚠️ No active session');
            showAuthModal();
        }
    } catch (error) {
        console.error('❌ Auth state check error:', error);
        showToast('Error checking authentication', 'error');
        showAuthModal();
    } finally {
        hideLoadingScreen();
        
        if (sessionFound) {
            console.log('Spinner hidden. Waking up server...');
            await wakeUpServer(); // <-- ADDED PING
            console.log('Now loading user data...');
            await loadUserData(); // This should be fast now
            console.log('User data load attempt finished.');
        }
    }
}

// ============================================
// DATA FETCHING & UI UPDATES
// ============================================

function showDataLoadingPlaceholders() {
    console.log('Displaying loading placeholders...');
    const loadingText = '...';
    const longLoadingText = 'Loading...';

    setText('creditsLeft', loadingText);
    setText('dropdownUserName', longLoadingText);
    setText('dropdownUserEmail', loadingText);
    setText('dropdownCreditsUsed', '... / ...');
    setStyle('creditsProgress', 'width', `100%`);
    setText('dropdownTotalPosts', loadingText);
    setText('dropdownJoinDate', loadingText);
    setText('profileName', longLoadingText);
    setText('profileEmail', loadingText);
    setText('totalPosts', loadingText);
    setText('creditsUsed', loadingText);
    setText('memberSince', loadingText);
    setValue('settingsEmail', longLoadingText);
    setValue('settingsDisplayName', '');
    setValue('settingsBio', '');
    setText('settingsCreditsDisplay', loadingText);
    setText('settingsCreditsSubtext', 'Loading credit info...');
    setStyle('settingsProgressDisplay', 'width', '100%');
}

function showDataErrorState(errorMessage) {
    console.error('Displaying error state...');
    const errorText = 'Error';
    setText('creditsLeft', '!');
    setText('dropdownUserName', errorText);
    setText('dropdownUserEmail', 'Could not load data');
    setText('profileName', errorText);
    setText('profileEmail', 'Could not load data');
    setValue('settingsEmail', 'Error loading email');
    setText('settingsCreditsDisplay', '!');
    setText('settingsCreditsSubtext', 'Error loading credits');
    showToast(errorMessage, 'error');
}

async function loadUserData() {
    if (!currentUser) return;
    
    console.log('Attempting to load user data...');
    showDataLoadingPlaceholders(); 

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('No session found');
        
        const token = session.access_token;
        const response = await fetch(`${API_URL}/api/user/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch user data (Status: ${response.status})`);
        }

        const data = await response.json();
        
        if (data.success) {
            console.log('Successfully fetched user data.');
            userProfile = data.profile;
            userPlan = data.plan;
            userHistory = data.history || [];
            updateUI(); 
        } else {
            throw new Error(data.error || 'Could not load data');
        }

    } catch (error) {
        console.error('❌ Error loading user data:', error);
        showDataErrorState(error.message); 
    }
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
        
        // onAuthStateChange will handle the rest
        
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
                emailRedirectTo: `${window.location.origin}/dashboard.html`,
                data: { email_confirmed: false }
            }
        });
        
        if (error) throw error;

        if (data.user) {
            showToast('Account created! Please check your email to verify.', 'success');
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
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { 
                redirectTo: `${window.location.origin}/dashboard.html`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
        
        if (error) throw error;
        console.log('🔄 Redirecting to Google...');
        
    } catch (error) {
        console.error('❌ Google sign-in error:', error);
        showToast(error.message || 'Google sign-in failed', 'error');
    }
}

async function handleSignOut() {
    try {
        await supabaseClient.auth.signOut();
        // onAuthStateChange will handle the rest
    } catch (error) {
        console.error('❌ Sign out error:', error);
        showToast(error.message || 'Sign out failed', 'error');
    }
}

// ============================================
// AI & OPTIMIZER FUNCTIONS
// ============================================

async function handleFetchRules(type) {
    await wakeUpServer(); // Ensure server is awake before API calls
    const isAI = type === 'ai';
    const inputId = isAI ? 'aiSubredditInput' : 'optimizerSubredditInput';
    const buttonId = isAI ? 'aiFetchGuidelinesBtn' : 'optimizerFetchGuidelinesBtn';
    const containerId = isAI ? 'aiGuidelinesContainer' : 'optimizerGuidelinesContainer';
    const contentId = isAI ? 'aiGuidelinesContent' : 'optimizerGuidelinesContent';
    const subredditId = isAI ? 'aiGuidelineSubreddit' : 'optimizerGuidelineSubreddit';
    
    const subreddit = getValue(inputId).trim();
    if (!subreddit) return showToast('Please enter a subreddit name', 'warning');

    setButtonLoading(buttonId, true, '');
    
    try {
        const response = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`);
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
    
    await wakeUpServer(); // Ensure server is awake
    const subreddit = getValue('aiSubredditInput').trim();
    const topic = getValue('aiTopicInput').trim();
    const style = getValue('aiStyleSelect');
    const rules = getText('aiGuidelinesContent');

    if (!subreddit || !topic) {
        return showToast('Please enter a subreddit and topic', 'warning');
    }

    setButtonLoading('aiGenerateBtn', true, 'Generating...');
    if (isRegen) setButtonLoading('aiRegenerateBtn', true, '');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const token = session.access_token;
        const response = await fetch(`${API_URL}/api/generate-post`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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

    await wakeUpServer(); // Ensure server is awake
    const subreddit = getValue('optimizerSubredditInput').trim();
    const content = getValue('optimizerContentInput').trim();
    const style = getValue('optimizationStyleSelect');
    const rules = getText('optimizerGuidelinesContent');

    if (!subreddit || !content) {
        return showToast('Please enter a subreddit and content', 'warning');
    }

    setButtonLoading('optimizerOptimizeBtn', true, 'Optimizing...');
    if (isRegen) setButtonLoading('optimizerRegenerateBtn', true, '');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const token = session.access_token;
        const response = await fetch(`${API_URL}/api/optimize-post`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
// PAYMENT FUNCTIONS
// ============================================

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
        showToast('Redirecting to payment...', 'info');
        const checkoutUrl = `${planData.checkoutUrl}?quantity=1`;
        window.location.href = checkoutUrl;

    } catch (error) {
        console.error('❌ Payment init error:', error);
        showToast(error.message || 'Failed to initiate payment', 'error');
    }
}

async function handlePaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success') {
        showToast('Payment successful! 🎉 Activating your plan...', 'success');
        
        const pendingPayment = localStorage.getItem('pending_payment');
        if (pendingPayment) {
            try {
                const paymentData = JSON.parse(pendingPayment);
                const { data: { session } } = await supabaseClient.auth.getSession();
                
                if (session) {
                    await wakeUpServer(); // Wake server before verifying
                    await fetch(`${API_URL}/api/payment/verify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.access_token}`
                        },
                        body: JSON.stringify({ ...paymentData, sessionId: sessionId })
                    });
                }
                localStorage.removeItem('pending_payment');
            } catch (error) {
                console.error('Error processing payment callback:', error);
            }
        }
        
        setTimeout(() => navigateToPage('aiGenerator'), 2000); // Reloading data happens on auth change
        window.history.replaceState({}, document.title, window.location.pathname);
        
    } else if (paymentStatus === 'cancelled') {
        showToast('Payment was cancelled.', 'warning');
        localStorage.removeItem('pending_payment');
        navigateToPage('pricing');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function updatePricingDisplay() {
    const cycle = document.querySelector('input[name="billingCycle"]:checked').value;
    
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
    await wakeUpServer(); // Ensure server is awake
    const displayName = getValue('settingsDisplayName').trim();
    const bio = getValue('settingsBio').trim();

    setButtonLoading('saveProfileBtn', true, 'Saving...');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const token = session.access_token;
        const response = await fetch(`${API_URL}/api/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
    await wakeUpServer(); // Ensure server is awake
    const newPassword = getValue('newPassword');
    const confirm = getValue('confirmPassword');

    if (!newPassword || !confirm) return showToast('Please fill all fields', 'warning');
    if (newPassword.length < 8) return showToast('Password must be at least 8 characters', 'warning');
    if (newPassword !== confirm) return showToast('Passwords do not match!', 'error');

    setButtonLoading('changePasswordBtn', true, 'Updating...');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const token = session.access_token;
        const response = await fetch(`${API_URL}/api/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
    if (!confirm('Are you sure you want to sign out from all devices?')) return;
    
    await wakeUpServer(); // Ensure server is awake
    setButtonLoading('logoutAllBtn', true, 'Logging out...');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const token = session.access_token;
        const response = await fetch(`${API_URL}/api/auth/logout-all`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        await handleSignOut();
        showToast('Signed out from all devices.', 'success');

    } catch (error) {
        console.error('❌ Logout all error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('logoutAllBtn', false, '<i class="fas fa-sign-out-alt me-2"></i>Logout All Devices');
    }
}

async function handleDeleteAccount() {
    const password = getValue('deleteConfirmPassword');
    if (!password) return showToast('Please enter your password to confirm', 'warning');

    await wakeUpServer(); // Ensure server is awake
    setButtonLoading('deleteAccountBtn', true, 'Deleting...');

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');
        
        const token = session.access_token;
        const response = await fetch(`${API_URL}/api/auth/delete-account`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        bootstrapModals.deleteAccountModal.hide();
        await handleSignOut();
        showToast('Account deleted successfully.', 'success');

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
        copyToClipboard(text, 'Full post copied to clipboard!');
    });

    document.getElementById('optimizerFetchGuidelinesBtn')?.addEventListener('click', () => handleFetchRules('optimizer'));
    document.getElementById('optimizerOptimizeBtn')?.addEventListener('click', () => handleOptimize(false));
    document.getElementById('optimizerRegenerateBtn')?.addEventListener('click', () => handleOptimize(true));
    document.getElementById('optimizerCopyBtn')?.addEventListener('click', () => {
        copyToClipboard(getValue('optimizerOptimizedText'), 'Optimized content copied!');
    });

    document.getElementById('monthlyBilling')?.addEventListener('change', updatePricingDisplay);
    document.getElementById('yearlyBilling')?.addEventListener('change', updatePricingDisplay);
    document.getElementById('saveProfileBtn')?.addEventListener('click', handleSaveProfile);
    document.getElementById('changePasswordBtn')?.addEventListener('click', handleChangePassword);
    document.getElementById('logoutAllBtn')?.addEventListener('click', handleLogoutAll);
    document.getElementById('deleteAccountBtn')?.addEventListener('click', handleDeleteAccount);
    document.getElementById('viewPostCopyBtn')?.addEventListener('click', () => {
        copyToClipboard(getValue('viewPostContent'), 'Post content copied!');
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
    document.getElementById('sidebar').classList.remove('active');
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
    if (bootstrapModals.authModal) bootstrapModals.authModal.hide();
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
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
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

    if (!toastEl || !titleEl || !messageEl || !bootstrapToast) {
        console.warn('Toast elements not found');
        return;
    }

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

    if (bootstrapToast) {
        bootstrapToast.show();
    }
}

function copyToClipboard(text, successMessage) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage, 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Failed to copy text', 'error');
    });
}

// ============================================
// GLOBAL WINDOW EXPORTS
// ============================================
window.navigateToPage = navigateToPage;
window.initiateDodoPayment = initiateDodoPayment;