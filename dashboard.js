// ============================================
// PRODUCTION-READY DASHBOARD.JS
// ============================================

// --- SUPABASE & API CONFIG ---
// !! IMPORTANT: Replace with your actual Supabase URL and Anon Key !!
const SUPABASE_URL = 'https://duzaoqvdukdnbjzccwbp.supabase.co'; // e.g., 'https://duzaoqvdukdnbjzccwbp.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1emFvcXZkdWtkbmJqemNjd2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTE2MTIsImV4cCI6MjA3NzQ2NzYxMn0.eMvGGHRuqzeGjVMjfLViaJnMvaKryGCPWWaDyFK6UP8 '; // e.g., 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...ZDyFK6UP8'
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// !! IMPORTANT: Replace with your deployed backend URL !!
const API_URL = 'https://redditfix-backend.onrender.com'; // e.g., 'https://reddi-gen-api.onrender.com'

// --- GLOBAL STATE ---
let currentUser = null;
let userProfile = null;
let userPlan = null;
let userHistory = [];
let bootstrapModals = {}; // To store modal instances
let bootstrapToast = null;

// --- PRICING DATA (Source of Truth) ---
const PRICING_DATA = {
    starter: {
        monthly: { price: 1.99, posts: 150 },
        yearly: { price: 21.49, posts: 1800 } // Assuming 1.99*12 * 0.9
    },
    professional: {
        monthly: { price: 2.99, posts: 250 },
        yearly: { price: 32.49, posts: 3000 } // Assuming 2.99*12 * 0.9
    },
    enterprise: {
        monthly: { price: 3.99, posts: 500 },
        yearly: { price: 43.49, posts: 6000 } // Assuming 3.99*12 * 0.9
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ Dashboard initializing...');

    // Initialize Bootstrap components
    initBootstrapComponents();

    // Check for payment callback
    await handlePaymentCallback();

    // Check auth state
    await checkAuthState();

    // Initialize event listeners
    initializeEventListeners();

    // Set initial pricing display
    updatePricingDisplay();
});

function initBootstrapComponents() {
    // Modals
    const modalIds = ['authModal', 'viewPostModal', 'changePasswordModal', 'deleteAccountModal'];
    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) bootstrapModals[id] = new bootstrap.Modal(el);
    });

    // Toast
    const toastEl = document.getElementById('notificationToast');
    if (toastEl) bootstrapToast = new bootstrap.Toast(toastEl, { delay: 4000 });
}

async function checkAuthState() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;

        if (session) {
            console.log('✅ User authenticated:', session.user.email);
            currentUser = session.user;
            await loadUserData(); // Load user data
            hideAuthModal();
            hideLoadingScreen();
        } else {
            console.log('⚠️ No active session');
            showAuthModal();
            hideLoadingScreen();
        }
    } catch (error) {
        console.error('❌ Auth state check error:', error);
        showToast('Error checking authentication', 'error');
        hideLoadingScreen();
    }
}

// ============================================
// DATA FETCHING & UI UPDATES
// ============================================

/**
 * Fetches all user data (profile, plan, history) from the backend
 */
async function loadUserData() {
    if (!currentUser) return;

    try {
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
        const response = await fetch(`${API_URL}/api/user/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user data');
        }

        const data = await response.json();
        
        if (data.success) {
            userProfile = data.profile;
            userPlan = data.plan;
            userHistory = data.history;
            
            // Update all parts of the UI
            updateUI();
        } else {
            throw new Error(data.error || 'Could not load data');
        }

    } catch (error) {
        console.error('❌ Error loading user data:', error);
        showToast(error.message, 'error');
        if (error.message.includes('Authentication')) await handleSignOut(); // Force sign out
    }
}

/**
 * Main function to update all dynamic UI elements
 */
function updateUI() {
    if (!userProfile || !userPlan) return;

    const credits = userPlan.credits_remaining;
    const maxCredits = userPlan.posts_per_month;
    const creditsUsed = maxCredits - credits;
    const progressPercent = maxCredits > 0 ? (creditsUsed / maxCredits) * 100 : 0;
    const joinDate = new Date(userProfile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Sidebar
    setText('creditsLeft', credits);

    // User Dropdown
    setText('dropdownUserName', userProfile.display_name || userProfile.email);
    setText('dropdownUserEmail', userProfile.email);
    setText('dropdownCreditsUsed', `${creditsUsed} / ${maxCredits}`);
    setStyle('creditsProgress', 'width', `${progressPercent}%`);
    setText('dropdownTotalPosts', userHistory.length);
    setText('dropdownJoinDate', joinDate);

    // Profile Page
    setText('profileName', userProfile.display_name || userProfile.email);
    setText('profileEmail', userProfile.email);
    setText('totalPosts', userHistory.length);
    setText('creditsUsed', creditsUsed);
    setText('memberSince', joinDate.split(' ')[1]); // Just the year

    // Settings Page
    setValue('settingsEmail', userProfile.email);
    setValue('settingsDisplayName', userProfile.display_name);
    setValue('settingsBio', userProfile.bio);
    setText('settingsCreditsDisplay', credits);
    setText('settingsCreditsSubtext', `${credits} / ${maxCredits} credits remaining`);
    setStyle('settingsProgressDisplay', 'width', `${progressPercent}%`);

    // History Page
    displayHistory();
}

/**
 * Renders the post history table
 */
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
                    <button class="btn btn-sm btn-outline-info" 
                            data-post-id="${post.id}">
                        <i class="fas fa-eye me-1"></i>View
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Add event listeners to new "View" buttons
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
    const email = getValue('loginEmail');
    const password = getValue('loginPassword');
    if (!email || !password) return showToast('Please enter email and password', 'warning');
    
    setButtonLoading('loginButton', true, 'Signing In...');

    try {
        const { data: { session }, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        currentUser = session.user;
        await loadUserData();
        hideAuthModal();
        showToast('Welcome back!', 'success');
    } catch (error) {
        console.error('❌ Login error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('loginButton', false, '<i class="fas fa-sign-in-alt me-2"></i>Sign In');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const email = getValue('signupEmail');
    const password = getValue('signupPassword');
    const confirm = getValue('signupPasswordConfirm');

    if (!email || !password || !confirm) return showToast('Please fill all fields', 'warning');
    if (password.length < 8) return showToast('Password must be at least 8 characters', 'warning');
    if (password !== confirm) return showToast('Passwords do not match!', 'error');

    setButtonLoading('signupButton', true, 'Creating Account...');

    try {
        const { error } = await supabaseClient.auth.signUp({ 
            email, 
            password,
            options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;

        showToast('Account created! Please check your email to verify.', 'success');
        showLoginSection(); // Switch to login view
    } catch (error) {
        console.error('❌ Signup error:', error);
        showToast(error.message, 'error');
    } finally {
        setButtonLoading('signupButton', false, '<i class="fas fa-user-plus me-2"></i>Create Account');
    }
}

async function handleGoogleSignIn() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
        if (error) throw error;
    } catch (error) {
        console.error('❌ Google sign-in error:', error);
        showToast(error.message, 'error');
    }
}

async function handleSignOut() {
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        userProfile = null;
        userPlan = null;
        userHistory = [];
        updateUI(); // Clear UI
        showAuthModal();
        showToast('Signed out successfully', 'success');
    } catch (error) {
        console.error('❌ Sign out error:', error);
        showToast(error.message, 'error');
    }
}

// ============================================
// AI & OPTIMIZER FUNCTIONS
// ============================================

async function handleFetchRules(type) {
    const isAI = type === 'ai';
    const inputId = isAI ? 'aiSubredditInput' : 'optimizerSubredditInput';
    const buttonId = isAI ? 'aiFetchGuidelinesBtn' : 'optimizerFetchGuidelinesBtn';
    const containerId = isAI ? 'aiGuidelinesContainer' : 'optimizerGuidelinesContainer';
    const contentId = isAI ? 'aiGuidelinesContent' : 'aiGuidelineSubreddit';
    const subredditId = isAI ? 'aiGuidelineSubreddit' : 'optimizerGuidelineSubreddit';
    
    const subreddit = getValue(inputId);
    if (!subreddit) return showToast('Please enter a subreddit name', 'warning');

    setButtonLoading(buttonId, true, ''); // Spinner only
    
    try {
        const response = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Could not fetch rules');
        }

        setText(subredditId, data.subreddit);
        // Use innerHTML to render bold tags from the server's rulesText
        document.getElementById(isAI ? 'aiGuidelinesContent' : 'optimizerGuidelinesContent').innerHTML = data.rules.replace(/\n/g, '<br>');
        show(containerId);
        
        if (!isAI) {
            // Enable optimizer button
            document.getElementById('optimizerOptimizeBtn').disabled = false;
            setText('optimizerButtonHelp', 'Ready to optimize!');
        }

    } catch (error) {
        console.error('❌ Rules fetch error:', error);
        showToast(error.message, 'error');
        hide(containerId);
    } finally {
        const icon = '<i class="fas fa-search me-1"></i>Fetch Rules';
        setButtonLoading(buttonId, false, icon);
    }
}

async function handleAIGenerate(isRegen = false) {
    if (userPlan.credits_remaining <= 0) {
        showToast('No credits remaining. Please upgrade.', 'error');
        return navigateToPage('pricing');
    }
    
    const subreddit = getValue('aiSubredditInput');
    const topic = getValue('aiTopicInput');
    const style = getValue('aiStyleSelect');
    const rules = getText('aiGuidelinesContent');

    if (!subreddit || !topic) return showToast('Please enter a subreddit and topic', 'warning');

    setButtonLoading('aiGenerateBtn', true, 'Generating...');
    if (isRegen) setButtonLoading('aiRegenerateBtn', true, '');

    try {
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
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

        // Display results
        setValue('aiGeneratedTitle', data.post.title);
        setValue('aiGeneratedContent', data.post.content);
        setText('aiTargetSubreddit', subreddit);
        show('aiOutputCard');
        
        // Update state
        userPlan.credits_remaining = data.creditsRemaining;
        userHistory.unshift(data.historyItem);
        updateUI(); // Refresh credits and history count
        
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
    if (userPlan.credits_remaining <= 0) {
        showToast('No credits remaining. Please upgrade.', 'error');
        return navigateToPage('pricing');
    }

    const subreddit = getValue('optimizerSubredditInput');
    const content = getValue('optimizerContentInput');
    const style = getValue('optimizationStyleSelect');
    const rules = getText('optimizerGuidelinesContent');

    if (!subreddit || !content) return showToast('Please enter a subreddit and content', 'warning');

    setButtonLoading('optimizerOptimizeBtn', true, 'Optimizing...');
    if (isRegen) setButtonLoading('optimizerRegenerateBtn', true, '');

    try {
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
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

        // Display results
        setValue('optimizerOptimizedText', data.optimizedPost);
        setText('optimizerTargetSubreddit', subreddit);
        show('optimizerOutputCard');
        
        // Update state
        userPlan.credits_remaining = data.creditsRemaining;
        userHistory.unshift(data.historyItem);
        updateUI(); // Refresh credits and history count
        
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
    if (!currentUser) return showAuthModal();
    
    const billingCycle = document.querySelector('input[name="billingCycle"]:checked').value;
    const planData = PRICING_DATA[planType][billingCycle];
    
    const paymentData = {
        plan: planType,
        postsPerMonth: planData.posts,
        billingCycle: billingCycle,
        amount: planData.price,
        transactionId: `TXN_${Date.now()}_${currentUser.id.substring(0, 8)}`
    };

    try {
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
        const response = await fetch(`${API_URL}/api/dodo/create-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(paymentData)
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to create payment session');

        showToast('Redirecting to payment...', 'info');
        
        // Redirect to Dodo's checkout URL
        window.location.href = data.paymentUrl;

    } catch (error) {
        console.error('❌ Dodo init error:', error);
        showToast(error.message, 'error');
    }
}

async function handlePaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success') {
        showToast('Payment successful! 🎉 Activating your plan...', 'success');
        // The webhook handles activation. We just need to reload data.
        // We add a small delay to give the webhook time to process.
        setTimeout(() => {
            loadUserData();
            navigateToPage('aiGenerator'); // Go to a useful page
        }, 3000); // 3-second delay
        
        // Clean the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
    } else if (paymentStatus === 'cancelled') {
        showToast('Payment was cancelled.', 'warning');
        navigateToPage('pricing'); // Go back to pricing
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
    const displayName = getValue('settingsDisplayName');
    const bio = getValue('settingsBio');

    setButtonLoading('saveProfileBtn', true, 'Saving...');

    try {
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
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

        userProfile = data.profile; // Update local state
        updateUI(); // Refresh UI
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
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
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

    setButtonLoading('logoutAllBtn', true, 'Logging out...');

    try {
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
        const response = await fetch(`${API_URL}/api/auth/logout-all`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // This action logs out the current session too
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

    setButtonLoading('deleteAccountBtn', true, 'Deleting...');

    try {
        const token = (await supabaseClient.auth.getSession()).data.session.access_token;
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
        await handleSignOut(); // Sign out locally
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
    // Auth
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('googleSignInBtn')?.addEventListener('click', handleGoogleSignIn);
    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('dropdownSignOutBtn')?.addEventListener('click', handleSignOut);
    
    // Auth UI switching
    document.getElementById('showSignupLink')?.addEventListener('click', (e) => { e.preventDefault(); showSignupSection(); });
    document.getElementById('showLoginLink')?.addEventListener('click', (e) => { e.preventDefault(); showLoginSection(); });

    // Navigation
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

    // AI Generator
    document.getElementById('aiFetchGuidelinesBtn')?.addEventListener('click', () => handleFetchRules('ai'));
    document.getElementById('aiGenerateBtn')?.addEventListener('click', () => handleAIGenerate(false));
    document.getElementById('aiRegenerateBtn')?.addEventListener('click', () => handleAIGenerate(true));
    document.getElementById('aiCopyBtn')?.addEventListener('click', () => {
        const text = `Title: ${getValue('aiGeneratedTitle')}\n\nContent:\n${getValue('aiGeneratedContent')}`;
        copyToClipboard(text, 'Full post copied to clipboard!');
    });

    // Content Optimizer
    document.getElementById('optimizerFetchGuidelinesBtn')?.addEventListener('click', () => handleFetchRules('optimizer'));
    document.getElementById('optimizerOptimizeBtn')?.addEventListener('click', () => handleOptimize(false));
    document.getElementById('optimizerRegenerateBtn')?.addEventListener('click', () => handleOptimize(true));
    document.getElementById('optimizerCopyBtn')?.addEventListener('click', () => {
        copyToClipboard(getValue('optimizerOptimizedText'), 'Optimized content copied!');
    });

    // Pricing
    document.getElementById('monthlyBilling')?.addEventListener('change', updatePricingDisplay);
    document.getElementById('yearlyBilling')?.addEventListener('change', updatePricingDisplay);

    // Settings
    document.getElementById('saveProfileBtn')?.addEventListener('click', handleSaveProfile);
    document.getElementById('changePasswordBtn')?.addEventListener('click', handleChangePassword);
    document.getElementById('logoutAllBtn')?.addEventListener('click', handleLogoutAll);
    document.getElementById('deleteAccountBtn')?.addEventListener('click', handleDeleteAccount);
    
    // History Modal
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
    
    // Close sidebar on mobile after navigation
    document.getElementById('sidebar').classList.remove('active');
}

function showViewPostModal(post) {
    setValue('viewPostSubreddit', `r/${post.subreddit}`);
    setValue('viewPostContentTitle', post.title || '');
    setValue('viewPostContent', post.content);
    bootstrapModals.viewPostModal.show();
}

function showAuthModal() { show('authModal', 'modal'); }
function hideAuthModal() { hide('authModal', 'modal'); }
function showLoadingScreen() { show('loadingScreen', 'flex'); }
function hideLoadingScreen() { hide('loadingScreen'); }

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
    if (el) {
        if (displayType === 'modal') bootstrapModals[id]?.show();
        else el.style.display = displayType;
    }
}

function hide(id, displayType = 'none') {
    const el = document.getElementById(id);
    if (el) {
        if (displayType === 'modal') bootstrapModals[id]?.hide();
        else el.style.display = 'none';
    }
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
        btn.innerHTML = loadingText; // loadingText is the original HTML
    }
}

function showToast(message, type = 'info') {
    const toastEl = document.getElementById('notificationToast');
    const titleEl = document.getElementById('toastTitle');
    const messageEl = document.getElementById('toastMessage');

    // Reset classes
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

    bootstrapToast.show();
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
// GLOBAL WINDOW EXPORTS (for inline HTML onclick)
// ============================================
window.navigateToPage = navigateToPage;
window.initiateDodoPayment = initiateDodoPayment;