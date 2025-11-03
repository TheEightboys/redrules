/* ============================================
   SUPABASE CONFIGURATION
   ============================================ */
const SUPABASE_URL = 'https://duzaoqvdukdnbjzccwbp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1emFvcXZkdWtkbmJqemNjd2JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTE2MTIsImV4cCI6MjA3NzQ2NzYxMn0.eMvGGHRuqzeGjVMjfLViaJnMvaKryGCPWWaDyFK6UP8';
const API_URL = 'https://redrules.onrender.com'; // ✅ CORRECT


const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userCredits = 10;
let postHistory = [];

// Plan system
let userPlan = {
    name: 'Free',
    tier: 'free',
    credits: 10,
    postsPerMonth: 10,
    monthlyLimit: 10,
    features: [],
    activated: false,
    activatedDate: null,
    expiryDate: null,
    billingType: 'free'
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ Dashboard.js loaded');
    setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) loadingScreen.classList.add('hidden');
    }, 500);

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        hideAuthModal();
        updateUIAfterAuth();
        loadUserData();
        loadUserPlan();
    } else {
        showAuthModal();
    }

    initializeEventListeners();
    initializeEnhancedFeatures();
    setupPricingToggle();
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            hideAuthModal();
            updateUIAfterAuth();
            loadUserData();
            loadUserPlan();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            userCredits = 10;
            userPlan = { name: 'Free', tier: 'free', credits: 10, postsPerMonth: 10, monthlyLimit: 10, features: [], activated: false, activatedDate: null, expiryDate: null, billingType: 'free' };
            showAuthModal();
        }
    });
});

function initializeEventListeners() {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
    document.getElementById('googleSignInBtn')?.addEventListener('click', handleGoogleSignIn);
    
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
    
    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('dropdownSignOutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleSignOut();
    });
    
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(item.getAttribute('data-page'));
        });
    });
    
    document.querySelectorAll('.dropdown-menu [data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(item.getAttribute('data-page'));
            const bsDropdown = bootstrap.Dropdown.getInstance(document.getElementById('userProfileDropdown'));
            bsDropdown?.hide();
        });
    });
    
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });
    
    document.getElementById('aiFetchGuidelinesBtn')?.addEventListener('click', handleAIFetchGuidelines);
    document.getElementById('aiGenerateBtn')?.addEventListener('click', handleAIGenerate);
    document.getElementById('aiCopyBtn')?.addEventListener('click', () => copyToClipboard('aiGeneratedText'));
    document.getElementById('aiRegenerateBtn')?.addEventListener('click', handleAIGenerate);
    
    document.getElementById('optimizerFetchGuidelinesBtn')?.addEventListener('click', handleOptimizerFetchGuidelines);
    document.getElementById('optimizerOptimizeBtn')?.addEventListener('click', handleOptimizePost);
    document.getElementById('optimizerCopyBtn')?.addEventListener('click', () => copyToClipboard('optimizerOptimizedText'));
    document.getElementById('optimizerRegenerateBtn')?.addEventListener('click', handleOptimizePost);
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loadingBtn = e.target.querySelector('button[type="submit"]');
    const originalText = loadingBtn.innerHTML;
    loadingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in...';
    loadingBtn.disabled = true;
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        hideAuthModal();
        updateUIAfterAuth();
        loadUserData();
        loadUserPlan();
        showToast('Welcome back!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        loadingBtn.innerHTML = originalText;
        loadingBtn.disabled = false;
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    
    if (password !== passwordConfirm) {
        showToast('Passwords do not match', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    const loadingBtn = e.target.querySelector('button[type="submit"]');
    const originalText = loadingBtn.innerHTML;
    loadingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating account...';
    loadingBtn.disabled = true;
    
    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        
        userCredits = 10;
        userPlan = { name: 'Free', tier: 'free', credits: 10, postsPerMonth: 10, monthlyLimit: 10, features: [], activated: false, activatedDate: null, expiryDate: null, billingType: 'free' };
        saveToLocalStorage();
        savePlanToStorage();
        showToast('✅ Account created! You get 10 FREE credits! Check email to verify.', 'success');
        document.getElementById('signupSection').style.display = 'none';
        document.getElementById('emailAuthSection').style.display = 'block';
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        loadingBtn.innerHTML = originalText;
        loadingBtn.disabled = false;
    }
}

async function handleGoogleSignIn() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/dashboard.html' }
        });
        if (error) throw error;
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleSignOut() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        currentUser = null;
        userCredits = 10;
        userPlan = { name: 'Free', tier: 'free', credits: 10, postsPerMonth: 10, monthlyLimit: 10, features: [], activated: false, activatedDate: null, expiryDate: null, billingType: 'free' };
        localStorage.clear();
        showAuthModal();
        showToast('Signed out successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function showAuthModal() {
    const authModal = new bootstrap.Modal(document.getElementById('authModal'));
    authModal.show();
}

function updateSidebarCreditCount() {
    const creditsElement = document.getElementById('creditsLeft');
    if (creditsElement) {
        creditsElement.textContent = userCredits;
    }
}

function hideAuthModal() {
    const authModal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
    if (authModal) authModal.hide();
}

function updateUIAfterAuth() {
    if (currentUser) {
        const userName = currentUser.email.split('@')[0];
        const profileName = document.getElementById('profileName');
        if (profileName) profileName.textContent = userName;
        const profileEmail = document.getElementById('profileEmail');
        if (profileEmail) profileEmail.textContent = currentUser.email;
        const dropdownUserName = document.getElementById('dropdownUserName');
        if (dropdownUserName) dropdownUserName.textContent = userName;
        const dropdownUserEmail = document.getElementById('dropdownUserEmail');
        if (dropdownUserEmail) dropdownUserEmail.textContent = currentUser.email;
        
        if (currentUser.user_metadata?.avatar_url) {
            const userAvatar = document.getElementById('userAvatar');
            if (userAvatar) userAvatar.innerHTML = `<img src="${currentUser.user_metadata.avatar_url}" alt="User">`;
            const profileAvatarLarge = document.getElementById('profileAvatarLarge');
            if (profileAvatarLarge) profileAvatarLarge.innerHTML = `<img src="${currentUser.user_metadata.avatar_url}" alt="User">`;
        }
        updateStatsDisplay();
    }
}

function updateStatsDisplay() {
    const creditsUsed = userPlan.monthlyLimit - userCredits;
    const creditsPercent = (creditsUsed / userPlan.monthlyLimit) * 100;
    
    const dropdownCreditsUsed = document.getElementById('dropdownCreditsUsed');
    if (dropdownCreditsUsed) dropdownCreditsUsed.textContent = `${creditsUsed} / ${userPlan.monthlyLimit}`;
    
    const creditsProgress = document.getElementById('creditsProgress');
    if (creditsProgress) creditsProgress.style.width = creditsPercent + '%';
    
    const dropdownTotalPosts = document.getElementById('dropdownTotalPosts');
    if (dropdownTotalPosts) dropdownTotalPosts.textContent = postHistory.length;
    
    if (currentUser) {
        const joinDate = new Date(currentUser.created_at);
        const dropdownJoinDate = document.getElementById('dropdownJoinDate');
        if (dropdownJoinDate) {
            dropdownJoinDate.textContent = joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
    }
    
    const totalPosts = document.getElementById('totalPosts');
    if (totalPosts) totalPosts.textContent = postHistory.length;
    
    const creditsUsedDisplay = document.getElementById('creditsUsed');
    if (creditsUsedDisplay) creditsUsedDisplay.textContent = creditsUsed;
    
    const memberSince = document.getElementById('memberSince');
    if (memberSince) memberSince.textContent = currentUser ? new Date(currentUser.created_at).getFullYear() : 2025;
    
    const creditsDisplay = document.getElementById('creditsDisplay');
    if (creditsDisplay) creditsDisplay.textContent = `${userCredits} / ${userPlan.monthlyLimit}`;

    const settingsCredits = document.getElementById('settingsCredits');
    if (settingsCredits) settingsCredits.textContent = userCredits;
    
    const settingsProgress = document.getElementById('settingsProgress');
    if (settingsProgress) {
        settingsProgress.style.width = creditsPercent + '%';
        settingsProgress.innerHTML = `<small class="text-dark fw-bold">${creditsUsed}/${userPlan.monthlyLimit}</small>`;
    }
    
    updateSidebarCreditCount();
    updatePlanUI();
}

async function fetchRedditRulesDirectAPI(subreddit) {   
    try {
        const response = await fetch(`${API_URL}/api/reddit-rules/${subreddit}`);
        if (!response.ok) throw new Error(`Subreddit r/${subreddit} not found`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return { subreddit: subreddit, rules: data.rules, timestamp: data.timestamp };
    } catch (error) {
        console.error('Reddit API fetch error:', error);
        throw error;
    }
}

async function handleAIFetchGuidelines() {
    const subreddit = document.getElementById('aiSubredditInput').value.trim().toLowerCase();
    if (!subreddit) {
        showToast('Enter subreddit name', 'error');
        return;
    }
    
    const btn = document.getElementById('aiFetchGuidelinesBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Fetching...';
    btn.disabled = true;
    
    try {
        showToast('🔍 Fetching real rules from r/' + subreddit + '...', 'info');
        const rulesData = await fetchRedditRulesDirectAPI(subreddit);
        document.getElementById('aiGuidelineSubreddit').textContent = subreddit;
        document.getElementById('aiGuidelinesContent').innerHTML = `<div style="background: white; padding: 15px; border-radius: 5px; max-height: 300px; overflow-y: auto;"><strong>📋 Rules:</strong><pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; margin-top: 10px;">${rulesData.rules}</pre></div>`;
        document.getElementById('aiGuidelinesContainer').style.display = 'block';
        document.getElementById('aiGenerateBtn').disabled = false;
        showToast(`✅ Rules loaded for r/${subreddit}!`, 'success');
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

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

async function handleOptimizerFetchGuidelines() {
    const subreddit = document.getElementById('optimizerSubredditInput').value.trim().toLowerCase();
    if (!subreddit) {
        showToast('Enter subreddit name', 'error');
        return;
    }
    
    const btn = document.getElementById('optimizerFetchGuidelinesBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Fetching...';
    btn.disabled = true;
    
    try {
        showToast('🔍 Fetching real rules from r/' + subreddit + '...', 'info');
        const rulesData = await fetchRedditRulesDirectAPI(subreddit);
        document.getElementById('optimizerGuidelineSubreddit').textContent = subreddit;
        document.getElementById('optimizerGuidelinesContent').innerHTML = `<div style="background: white; padding: 15px; border-radius: 5px; max-height: 300px; overflow-y: auto;"><strong>📋 Rules:</strong><pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; margin-top: 10px;">${rulesData.rules}</pre></div>`;
        document.getElementById('optimizerGuidelinesContainer').style.display = 'block';
        document.getElementById('optimizerOptimizeBtn').disabled = false;
        showToast(`✅ Rules loaded for r/${subreddit}!`, 'success');
    } catch (error) {
        showToast(`❌ ${error.message}`, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

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

function navigateToPage(page) {
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    
    const sectionMap = {
        'aiGenerator': 'aiGeneratorSection',
        'contentOptimizer': 'contentOptimizerSection',
        'history': 'historySection',
        'profile': 'profileSection',
        'settings': 'settingsSection',
        'pricing': 'pricingSection'
    };
    
    const section = document.getElementById(sectionMap[page]);
    if (section) section.classList.add('active');
    
    const titles = {
        'aiGenerator': 'AI Generator',
        'contentOptimizer': 'Content Optimizer',
        'history': 'Post History',
        'profile': 'Your Profile',
        'settings': 'Settings',
        'pricing': 'Pricing Plans'
    };
    
    document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';
    if (window.innerWidth < 992) document.getElementById('sidebar').classList.remove('active');
    if (page === 'settings') loadProfileSettings();
}

function saveToHistory(subreddit, original, optimized, type) {
    const historyItem = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        subreddit: subreddit,
        original: original.substring(0, 80) + '...',
        optimized: optimized.substring(0, 80) + '...',
        type: type,
        fullOptimized: optimized
    };
    postHistory.unshift(historyItem);
    updateHistoryTable();
    saveToLocalStorage();
}

function updateHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    
    if (postHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-5"><i class="fas fa-inbox fa-3x mb-3 d-block"></i>No posts yet. Start generating!</td></tr>`;
        return;
    }
    
    tbody.innerHTML = postHistory.map(item => `
        <tr>
            <td>${item.date}</td>
            <td><span class="badge bg-danger">r/${item.subreddit}</span></td>
            <td>${item.optimized}</td>
            <td><span class="badge bg-${item.type === 'ai-generated' ? 'primary' : 'success'}">${item.type}</span></td>
            <td><button class="btn btn-sm btn-outline-secondary" onclick="viewPost(${item.id})"><i class="fas fa-eye"></i></button></td>
        </tr>
    `).join('');
}

function viewPost(id) {
    const post = postHistory.find(p => p.id === id);
    if (post) alert(post.fullOptimized);
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const text = element.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('notificationToast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

function updateCreditsDisplay() {
    const creditsDisplay = document.getElementById('creditsDisplay');
    if (creditsDisplay) creditsDisplay.textContent = `${userCredits} / ${userPlan.monthlyLimit}`;
    saveToLocalStorage();
}

function saveToLocalStorage() {
    localStorage.setItem('reddiGenCredits', userCredits);
    localStorage.setItem('reddiGenHistory', JSON.stringify(postHistory));
    console.log('💾 Saved credits to localStorage:', userCredits);
}

async function loadUserData() {
    const savedCredits = localStorage.getItem('reddiGenCredits');
    const savedHistory = localStorage.getItem('reddiGenHistory');
    
    if (savedCredits !== null) {
        userCredits = parseInt(savedCredits);
    } else {
        userCredits = userPlan.credits;
    }
    
    if (savedHistory) {
        try {
            postHistory = JSON.parse(savedHistory);
        } catch (e) {
            postHistory = [];
        }
    }
    
    updateCreditsDisplay();
    updateStatsDisplay();
    updateHistoryTable();
}

function initializeEnhancedFeatures() {
    createScrollProgressBar();
    initializeNavbarScrollEffect();
    initializeSmoothScrolling();
    initializeMagneticButtons();
    initializeRippleEffect();
}

function createScrollProgressBar() {
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    document.body.appendChild(progressBar);
    
    window.addEventListener('scroll', () => {
        const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (window.scrollY / windowHeight) * 100;
        progressBar.style.width = scrolled + '%';
    });
}

function initializeNavbarScrollEffect() {
    const topNavbar = document.querySelector('.top-navbar');
    if (!topNavbar) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            topNavbar.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        } else {
            topNavbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.08)';
        }
    });
}

function initializeSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href.length > 1) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function initializeMagneticButtons() {
    document.querySelectorAll('.btn-reddit, .btn-success, .btn-outline-success, .btn-outline-reddit').forEach(button => {
        button.addEventListener('mousemove', (e) => {
            const rect = button.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            button.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px) scale(1.02)`;
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translate(0, 0) scale(1)';
        });
    });
}

function initializeRippleEffect() {
    document.querySelectorAll('.btn').forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple-effect');
            
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });
    
    if (!document.getElementById('ripple-style')) {
        const style = document.createElement('style');
        style.id = 'ripple-style';
        style.textContent = `
            .ripple-effect {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.6);
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            }
            @keyframes ripple {
                to { transform: scale(4); opacity: 0; }
            }
            .btn { position: relative; overflow: hidden; }
            .scroll-progress {
                position: fixed;
                top: 0;
                left: 0;
                height: 3px;
                background: linear-gradient(to right, #ff4500, #ff5722);
                width: 0%;
                z-index: 9999;
                transition: width 0.1s ease;
            }
        `;
        document.head.appendChild(style);
    }
}

function createConfetti() {
    const colors = ['#ff4500', '#ff5722', '#ff6f43', '#ffa500'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: fixed;
            width: 10px;
            height: 10px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            left: ${Math.random() * 100}%;
            top: -10px;
            opacity: 1;
            pointer-events: none;
            z-index: 9999;
            animation: confetti-fall ${2 + Math.random() * 2}s linear forwards;
        `;
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 4000);
    }
    
    if (!document.getElementById('confetti-style')) {
        const style = document.createElement('style');
        style.id = 'confetti-style';
        style.textContent = `
            @keyframes confetti-fall {
                0% { top: -10px; opacity: 1; }
                100% { top: 100vh; opacity: 0; transform: translateX(${Math.random() * 200 - 100}px) rotate(${Math.random() * 720}deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

// ============================================
// PRICING & DODO PAYMENTS
// ============================================

const DODO_PAYMENT_LINKS = {
    starter_monthly: 'https://test.checkout.dodopayments.com/buy/pdt_XocDrGw3HxTb0nD7nyYyl?quantity=1',
    starter_yearly: 'https://checkout.dodopayments.com/buy/pdt_RBEfQWVlN9bnWihieBQSt?quantity=1',  // ✅ ADD THIS
    professional_monthly: 'https://checkout.dodopayments.com/buy/pdt_dumBrrIeNTtENukKXHiGh?quantity=1',
    professional_yearly: 'https://checkout.dodopayments.com/buy/pdt_gBCE38rNQm8x30iqAltc6?quantity=1',
    enterprise_monthly: 'https://checkout.dodopayments.com/buy/pdt_UHLjlc1qPLgSvK1ubHjgJ?quantity=1',
    enterprise_yearly: 'https://checkout.dodopayments.com/buy/pdt_E9rxQwDMZahet7kADcna5?quantity=1'  // ✅ ADD THIS
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

function setupPricingToggle() {
    const radios = document.querySelectorAll('input[name="billingCycle"]');
    radios.forEach(radio => {
        radio.addEventListener('change', updatePricingDisplay);
    });
    setTimeout(() => updatePricingDisplay(), 100);
}

function updatePricingDisplay() {
    const billingType = document.querySelector('input[name="billingCycle"]:checked')?.value || 'monthly';
    
    updatePlanDisplay('starter', billingType);
    updatePlanDisplay('professional', billingType);
    updatePlanDisplay('enterprise', billingType);
}

function updatePlanDisplay(planName, billingType) {
    const data = PRICING_DATA[planName][billingType];
    const postsLabel = billingType === 'yearly' ? ' Posts Per Year' : ' Posts Per Month';
    const billingLabel = billingType === 'yearly' ? '/year (Save 10%)' : '/month';
    
    document.getElementById(planName + 'Price').textContent = '$' + data.price.toFixed(2);
    document.getElementById(planName + 'Posts').textContent = data.posts + postsLabel;
    document.getElementById(planName + 'Billing').textContent = billingLabel;
}

async function initiateDodoPayment(plan) {
    try {
        const userId = auth.currentUser?.uid;
        const userEmail = auth.currentUser?.email;
        
        if (!userId || !userEmail) {
            alert('Please sign in first');
            return;
        }

        console.log('🛒 Initiating payment for plan:', plan);

        // Plan details
        const plans = {
            basic: { 
                amount: 4.99, 
                postsPerMonth: 50,
                billingCycle: 'monthly',
                name: 'Basic Plan'
            },
            pro: { 
                amount: 9.99, 
                postsPerMonth: 200,
                billingCycle: 'monthly',
                name: 'Pro Plan'
            }
        };

        const selectedPlan = plans[plan];
        if (!selectedPlan) {
            throw new Error('Invalid plan selected');
        }

        const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Call YOUR RENDER BACKEND
        const response = await fetch('https://redrules.onrender.com/api/dodo/create-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                plan: plan,
                email: userEmail,
                amount: selectedPlan.amount,
                postsPerMonth: selectedPlan.postsPerMonth,
                billingCycle: selectedPlan.billingCycle,
                transactionId: transactionId
            })
        });

        // Handle errors properly
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Backend error:', errorText);
            throw new Error(`Payment request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Payment session created:', data);

        if (data.success && data.paymentUrl) {
            // Redirect to Dodo payment page
            window.location.href = data.paymentUrl;
        } else {
            throw new Error(data.error || 'Failed to create payment session');
        }

    } catch (error) {
        console.error('❌ Payment error:', error);
        alert(`Payment failed: ${error.message}`);
    }
}

function handleDodoSuccessAutoRedirect() {
    // Simulate payment success for now
    const purchase = {
        plan: 'professional',
        posts: 250,
        amount: 2.99,
        billingType: 'monthly'
    };
    
    activatePlan(purchase);
    
    showToast('✅ Payment successful! Redirecting...', 'success');
    createConfetti();
    
    // Redirect to dashboard
    setTimeout(() => {
        window.location.href = window.location.origin + '/dashboard.html?payment=success';
    }, 1500);
}


function handlePaymentSuccess() {
    const pendingPurchase = localStorage.getItem('pendingPurchase');
    
    if (pendingPurchase) {
        try {
            const purchase = JSON.parse(pendingPurchase);
            activatePlan(purchase);
            
            showToast(`✅ Payment successful! ${purchase.posts} posts added to ${purchase.plan} plan!`, 'success');
            createConfetti();
            
            localStorage.removeItem('pendingPurchase');
            window.history.replaceState({}, document.title, window.location.pathname);
            
            setTimeout(() => {
                navigateToPage('aiGenerator');
            }, 2000);
            
        } catch (error) {
            showToast('Error processing payment: ' + error.message, 'error');
            console.error('Payment error:', error);
        }
    }
}

function activatePlan(purchase) {
    const planDetails = {
        starter: {
            name: 'Starter',
            tier: 'starter',
            credits: 150,
            postsPerMonth: 150,
            monthlyLimit: 150,
            features: ['AI Post Generation', 'Content Optimization', 'Reddit Rules Fetching', 'Post Scheduling']
        },
        professional: {
            name: 'Professional',
            tier: 'professional',
            credits: 250,
            postsPerMonth: 250,
            monthlyLimit: 250,
            features: ['Advanced AI Models', 'Unlimited Optimization', 'Post Scheduling', 'Priority Support', 'Basic Analytics']
        },
        enterprise: {
            name: 'Enterprise',
            tier: 'enterprise',
            credits: 500,
            postsPerMonth: 500,
            monthlyLimit: 500,
            features: ['Unlimited Posts', 'All Professional Features', 'Custom AI Training', 'White Label Support', '24/7 Premium Support', 'Advanced Analytics']
        }
    };
    
    const plan = planDetails[purchase.plan];
    if (!plan) return;
    
    const expiryDate = new Date();
    if (purchase.billingType === 'yearly') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
    }
    
    userPlan = {
        name: plan.name,
        tier: plan.tier,
        credits: plan.credits,
        postsPerMonth: plan.postsPerMonth,
        monthlyLimit: plan.monthlyLimit,
        features: plan.features,
        billingType: purchase.billingType,
        amount: purchase.amount,
        activated: true,
        activatedDate: new Date().toISOString(),
        expiryDate: expiryDate.toISOString()
    };
    
    userCredits = plan.credits;
    
    savePlanToStorage();
    saveToLocalStorage();
    updateStatsDisplay();
    updateCreditsDisplay();
}

function savePlanToStorage() {
    localStorage.setItem('userPlan', JSON.stringify(userPlan));
    console.log('💾 Plan saved:', userPlan);
}

function loadUserPlan() {
    const savedPlan = localStorage.getItem('userPlan');
    if (savedPlan) {
        try {
            userPlan = JSON.parse(savedPlan);
            
            if (userPlan.expiryDate && new Date(userPlan.expiryDate) < new Date()) {
                resetPlanToFree();
                showToast('⏰ Your plan has expired. Reset to free.', 'info');
            } else {
                userCredits = userPlan.credits;
                updatePlanUI();
            }
        } catch (error) {
            console.error('Error loading plan:', error);
        }
    }
}

function resetPlanToFree() {
    userPlan = {
        name: 'Free',
        tier: 'free',
        credits: 10,
        postsPerMonth: 10,
        monthlyLimit: 10,
        features: [],
        activated: false,
        activatedDate: null,
        expiryDate: null,
        billingType: 'free'
    };
    
    userCredits = 10;
    savePlanToStorage();
    updateStatsDisplay();
    updatePlanUI();
}

function updatePlanUI() {
    const planBadge = document.querySelector('.credits-display');
    if (planBadge) {
        const bgColor = userPlan.tier === 'starter' ? 'info' : userPlan.tier === 'professional' ? 'warning' : userPlan.tier === 'enterprise' ? 'danger' : 'secondary';
        planBadge.innerHTML = `<span class="badge bg-${bgColor}">${userPlan.name.toUpperCase()}</span><br>${userCredits} Credits left`;
    }
    console.log('🎯 Plan UI updated:', userPlan);
}

function hasCreditsLeft() {
    return userCredits > 0;
}

function deductCredit() {
    if (hasCreditsLeft()) {
        userCredits--;
        savePlanToStorage();
        saveToLocalStorage();
        updateCreditsDisplay();
        updateStatsDisplay();
        return true;
    }
    return false;
}

// ============================================
// SETTINGS - PROFILE, PASSWORD, DELETE ACCOUNT
// ============================================

function showChangePasswordModal() {
    const modal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    modal.show();
}

function showDeleteAccountModal() {
    const modal = new bootstrap.Modal(document.getElementById('deleteAccountModal'));
    modal.show();
}

async function handleChangePassword() {
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (newPassword.length < 8) {
        showToast('New password must be at least 8 characters', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
        
        showToast('✅ Password updated successfully!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
        if (modal) modal.hide();
        
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function handleDeleteAccount() {
    const email = document.getElementById('deleteConfirmEmail')?.value;
    const password = document.getElementById('deleteConfirmPassword')?.value;
    const isConfirmed = document.getElementById('deleteConfirmCheck')?.checked;
    
    if (!email || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (!isConfirmed) {
        showToast('Please confirm you understand this is permanent', 'error');
        return;
    }
    
    if (email !== currentUser.email) {
        showToast('Email does not match your account', 'error');
        return;
    }
    
    const confirmDelete = confirm('🚨 Are you absolutely sure? This cannot be undone!');
    if (!confirmDelete) return;
    
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        localStorage.clear();
        
        showToast('❌ Account deleted. Signing out...', 'info');
        setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function saveProfileChanges() {
    const displayName = document.getElementById('settingsDisplayName')?.value;
    const bio = document.getElementById('settingsBio')?.value;
    
    localStorage.setItem('userDisplayName', displayName);
    localStorage.setItem('userBio', bio);
    
    showToast('✅ Profile updated successfully!', 'success');
}

function savePreferences() {
    const optimizationStyle = document.querySelector('select')?.value;
    const emailNotifications = document.getElementById('emailNotifications')?.checked;
    const saveHistory = document.getElementById('saveHistory')?.checked;
    
    localStorage.setItem('optimizationStyle', optimizationStyle);
    localStorage.setItem('emailNotifications', emailNotifications);
    localStorage.setItem('saveHistory', saveHistory);
    
    showToast('✅ Preferences saved successfully!', 'success');
}

function handleLogoutAllDevices() {
    if (window.confirm('Are you sure? You will be logged out from all devices.')) {
        handleSignOut();
        showToast('✅ Logged out from all devices', 'success');
    }
}

function loadProfileSettings() {
    if (currentUser) {
        document.getElementById('settingsEmail').value = currentUser.email;
        document.getElementById('settingsDisplayName').value = localStorage.getItem('userDisplayName') || '';
        document.getElementById('settingsBio').value = localStorage.getItem('userBio') || '';
        document.getElementById('settingsCreditsDisplay').textContent = userCredits;
        
        const creditsUsed = userPlan.monthlyLimit - userCredits;
        const creditsPercent = (creditsUsed / userPlan.monthlyLimit) * 100;
        document.getElementById('settingsProgressDisplay').style.width = creditsPercent + '%';
    }
}

function showUpgradeModal() {
    navigateToPage('pricing');
}

console.log('%c🚀 ReddiGen Dashboard Loaded!', 'color: #ff4500; font-size: 20px; font-weight: bold;');
console.log('%c✅ AI-Powered Reddit Post Generator!', 'color: #28a745; font-size: 14px;');
console.log('%c💰 Dodo Payments Integrated!', 'color: #007bff; font-size: 14px;');
