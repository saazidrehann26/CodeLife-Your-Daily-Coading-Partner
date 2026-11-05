import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import RecoveryOtpPage from './components/RecoveryOtpPage';
import NewPasswordPage from './components/NewPasswordPage';
import SignUpOtpPage from './components/SignUpOtpPage';
import DeviceVerificationPage from './components/DeviceVerificationPage';
import DashboardPage from './components/DashboardPage';
import GroupChallengePage from './components/GroupChallengePage';
import BattleZonePage from './components/BattleZonePage';
import CompanyLogo from './components/CompanyLogo';
import { setActiveUser, getActiveUser } from './services/dashboardService';
import { deleteUser, syncUsersFromSupabase } from './services/dbService';
import './components/LoginPage.css';

/**
 * Valid application page routes
 */
const VALID_PAGES = [
  'landing',
  'signin',
  'forgot-password',
  'recovery-otp',
  'new-password',
  'signup-otp',
  'device-verification',
  'dashboard',
  'group-challenge',
  'battle-zone',
  'battle-field',
];

/**
 * Helper to extract battleId from window hash or URL
 */
const getBattleIdFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  const hashMatch = hash.match(/^(?:battle-zone|battle-field)\/([^/?#]+)/i);
  if (hashMatch) return hashMatch[1];
  const pathMatch = (window.location.pathname || '').match(/^\/(?:battle-zone|battle-field)\/([^/?#]+)/i);
  if (pathMatch) return pathMatch[1];
  try {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('battleId') || null;
  } catch {
    return null;
  }
};

/**
 * Known sub-hashes that belong to dashboard modals and views
 */
const DASHBOARD_HASHES = [
  'dashboard',
  'practice-area',
  'compiler',
  'compiler-c',
  'compiler-cpp',
  'compiler-python',
  'code-store',
  'view-code',
  'add-code',
  'settings',
  'find-friends',
  'personal-details',
  'profile',
];

/**
 * Helper to extract current page from the browser URL hash.
 * Every time the app is accessed/launched through localhost,
 * it always starts from the home page ('landing').
 */
const getPageFromHash = () => {
  if (typeof window === 'undefined') return 'landing';

  // Check if browser URL is navigating to /group-challenge or /battle-zone
  const pathname = (window.location.pathname || '').replace(/^\//, '').toLowerCase();
  if (pathname === 'group-challenge' || pathname.startsWith('group-challenge/')) {
    return 'group-challenge';
  }
  if (
    pathname === 'battle-zone' || pathname.startsWith('battle-zone/') ||
    pathname === 'battle-field' || pathname.startsWith('battle-field/')
  ) {
    return 'battle-zone';
  }

  // On fresh window session start (e.g. opening localhost in a new tab or window),
  // always start from the home page ('landing')
  const sessionStarted = sessionStorage.getItem('codelife_session_started');
  if (!sessionStarted) {
    sessionStorage.setItem('codelife_session_started', 'true');
    const directHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (directHash === 'group-challenge' || directHash.startsWith('group-challenge/') || directHash.startsWith('group-challenge-')) {
      return 'group-challenge';
    }
    if (
      directHash === 'battle-zone' || directHash.startsWith('battle-zone/') || directHash.startsWith('battle-zone-') ||
      directHash === 'battle-field' || directHash.startsWith('battle-field/') || directHash.startsWith('battle-field-')
    ) {
      return 'battle-zone';
    }
    if (window.location.hash && window.location.hash !== '#landing') {
      window.history.replaceState({ page: 'landing' }, '', window.location.pathname);
    }
    return 'landing';
  }

  const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();

  if (hash === 'group-challenge' || hash.startsWith('group-challenge/') || hash.startsWith('group-challenge-') || hash.startsWith('group-challenge?')) {
    return 'group-challenge';
  }

  if (
    hash === 'battle-zone' || hash.startsWith('battle-zone/') || hash.startsWith('battle-zone-') || hash.startsWith('battle-zone?') ||
    hash === 'battle-field' || hash.startsWith('battle-field/') || hash.startsWith('battle-field-') || hash.startsWith('battle-field?')
  ) {
    return 'battle-zone';
  }
  
  if (DASHBOARD_HASHES.some((dh) => hash === dh || hash.startsWith(dh + '-') || hash.startsWith(dh + '/'))) {
    return 'dashboard';
  }

  if (VALID_PAGES.includes(hash)) {
    return hash;
  }

  // Root URL / localhost default is always the home page ('landing')
  return 'landing';
};

export default function App() {
  // Navigation states: 'landing' (default) | 'signin' | 'forgot-password' | 'recovery-otp' | 'new-password' | 'signup-otp'
  const [currentPage, setCurrentPage] = useState(() => getPageFromHash());
  
  // Active logged-in user state
  const [currentUser, setCurrentUser] = useState(() => getActiveUser());
  const [activeBattleId, setActiveBattleId] = useState(() => getBattleIdFromUrl());
  
  // Data passed between recovery and registration flow pages
  const [recoveryData, setRecoveryData] = useState(null);
  const [signUpData, setSignUpData] = useState(null);
  const [deviceVerificationData, setDeviceVerificationData] = useState(null);
  const [initialNotification, setInitialNotification] = useState(null);

  /**
   * Unified navigation handler with browser History API integration.
   * Enables native browser Back (←) and Forward (→) buttons.
   * 
   * @param {string} page - Target page identifier
   * @param {string|null} toastMessage - Optional toast alert for next page
   * @param {boolean} pushHistory - Whether to push a new entry to browser history
   * @param {boolean} replaceHistory - Whether to replace the current history entry
   */
  const navigateTo = useCallback((page, toastMessage = null, pushHistory = true, replaceHistory = false, extraBattleId = null) => {
    let targetPage = page;
    let targetBattleId = extraBattleId;

    if (page.startsWith('battle-zone/') || page.startsWith('battle-field/')) {
      const parts = page.split('/');
      targetPage = 'battle-zone';
      targetBattleId = parts[1];
    } else if (page.startsWith('battle-zone?') || page.startsWith('battle-field?') || page === 'battle-field') {
      targetPage = 'battle-zone';
    }

    if (targetBattleId) {
      setActiveBattleId(targetBattleId);
    }

    if (!VALID_PAGES.includes(targetPage)) {
      targetPage = 'landing';
    }

    if (toastMessage) {
      setInitialNotification(toastMessage);
    }
    setCurrentPage(targetPage);

    if (typeof window !== 'undefined') {
      let targetHash = targetPage === 'landing' ? '' : `#${targetPage}`;
      if (targetPage === 'battle-zone' && targetBattleId) {
        targetHash = `#battle-zone/${targetBattleId}`;
      }
      const newUrl = targetHash ? `${window.location.pathname}${targetHash}` : window.location.pathname;
      
      if (replaceHistory) {
        window.history.replaceState(
          { page: targetPage, battleId: targetBattleId },
          '',
          newUrl
        );
      } else if (pushHistory) {
        // Push new state entry into the browser's session history stack
        window.history.pushState(
          { page: targetPage, battleId: targetBattleId },
          '',
          newUrl
        );
      }
    }
  }, []);

  /**
   * Browser Back (←) and Forward (→) popstate event listener
   */
  useEffect(() => {
    const handlePopState = (event) => {
      // Determine destination page from event state or URL hash
      const pageFromState = event.state?.page;
      const pageFromUrl = getPageFromHash();
      let targetPage = pageFromState || pageFromUrl || 'landing';

      const battleIdFromState = event.state?.battleId || getBattleIdFromUrl();
      if (battleIdFromState) {
        setActiveBattleId(battleIdFromState);
      }

      // Crucial fix: If user is logged in, never let backward navigation kick them to signin
      const activeUser = getActiveUser();
      if (activeUser && (targetPage === 'signin' || targetPage === 'login')) {
        targetPage = 'dashboard';
      }

      // Restore data payloads if present in state
      if (event.state?.recoveryData) {
        setRecoveryData(event.state.recoveryData);
      }
      if (event.state?.signUpData) {
        setSignUpData(event.state.signUpData);
      }
      if (event.state?.deviceVerificationData) {
        setDeviceVerificationData(event.state.deviceVerificationData);
      }

      // Update active view without pushing a duplicate history entry
      navigateTo(targetPage, null, false);
    };

    window.addEventListener('popstate', handlePopState);

    // Initialize baseline history entry so user can always navigate backward to it
    const initialPage = getPageFromHash();
    const initialHash = initialPage === 'landing' ? '' : `#${initialPage}`;
    const initialUrl = initialHash ? `${window.location.pathname}${initialHash}` : window.location.pathname;

    window.history.replaceState(
      { page: initialPage },
      '',
      initialUrl
    );

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigateTo]);

  const handleOtpSentForRecovery = (data) => {
    setRecoveryData(data);
  };

  const handleRecoveryResendSuccess = (newOtp, emailSuccess) => {
    setRecoveryData((prev) => ({
      ...prev,
      otp: newOtp,
      emailSentSuccessfully: emailSuccess,
    }));
  };

  const handleSignUpOtp = (data) => {
    setSignUpData(data);
    navigateTo('signup-otp');
  };

  const handleSignUpResendSuccess = (newOtp, emailSuccess) => {
    setSignUpData((prev) => ({
      ...prev,
      otp: newOtp,
      emailSentSuccessfully: emailSuccess,
    }));
  };

  /**
   * Strictly verify if the active user session still exists in the database.
   * If the user was removed from the database, invalidate session and redirect to signin.
   */
  const verifyCurrentSession = useCallback(async () => {
    const active = getActiveUser();
    if (!active) {
      if (currentUser) {
        setCurrentUser(null);
        setActiveUser(null);
      }
      if (currentPage === 'dashboard' || currentPage === 'group-challenge') {
        navigateTo('signin', 'Your account has been deleted or is no longer active.', true, true);
      }
      return null;
    }

    // Remote database verification if online
    if (typeof window !== 'undefined' && window.navigator?.onLine) {
      try {
        const res = await fetch('/api/auth/check-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: active.username || active.email }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.exists === false) {
            // User was removed from Supabase! Purge local data and redirect
            deleteUser(active.username || active.email);
            setCurrentUser(null);
            setActiveUser(null);
            if (currentPage === 'dashboard' || currentPage === 'group-challenge') {
              navigateTo('signin', 'Your account has been removed from the database.', true, true);
            }
            return null;
          }
        }
      } catch {
        // Fallback to local cache verification
      }
    }

    if (!currentUser || currentUser.username !== active.username) {
      setCurrentUser(active);
    }
    return active;
  }, [currentUser, currentPage, navigateTo]);

  // Live session listener & heartbeat check
  useEffect(() => {
    const handleAuthCheck = () => {
      verifyCurrentSession();
      syncUsersFromSupabase();
    };

    const handleAuthInvalidated = () => {
      setCurrentUser(null);
      setActiveUser(null);
      if (currentPage === 'dashboard' || currentPage === 'group-challenge') {
        navigateTo('signin', 'Your account was deleted from the database.', true, true);
      }
    };

    window.addEventListener('focus', handleAuthCheck);
    window.addEventListener('visibilitychange', handleAuthCheck);
    window.addEventListener('codelife_auth_invalidated', handleAuthInvalidated);
    window.addEventListener('storage', (e) => {
      if (e.key === 'codelife_active_user' || e.key === 'daily_code_practice_users_db') {
        handleAuthCheck();
      }
    });

    // Heartbeat check every 3 seconds while on authenticated pages
    const interval = setInterval(() => {
      if (currentPage === 'dashboard' || currentPage === 'group-challenge') {
        verifyCurrentSession();
      }
    }, 3000);

    return () => {
      window.removeEventListener('focus', handleAuthCheck);
      window.removeEventListener('visibilitychange', handleAuthCheck);
      window.removeEventListener('codelife_auth_invalidated', handleAuthInvalidated);
      clearInterval(interval);
    };
  }, [currentPage, navigateTo, verifyCurrentSession]);

  // When on initial intro landing page, render LandingPage with fixed background & smooth scrolling
  if (currentPage === 'landing') {
    const verifiedUser = getActiveUser();
    return (
      <LandingPage
        currentUser={verifiedUser}
        onNavigate={navigateTo}
        onGetStarted={() => {
          const active = getActiveUser();
          if (active) {
            navigateTo('dashboard');
          } else {
            if (currentUser) setCurrentUser(null);
            navigateTo('signin');
          }
        }}
        onSignOut={() => {
          setActiveUser(null);
          setCurrentUser(null);
          navigateTo('landing');
        }}
      />
    );
  }

  // When on Group Challenge page
  if (currentPage === 'group-challenge') {
    const verifiedUser = getActiveUser();
    if (!verifiedUser) {
      if (currentUser) setCurrentUser(null);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('codelife_return_page', 'group-challenge');
      }
      navigateTo('signin', 'Please sign in to access Group Challenge.', true, true);
      return null;
    }

    return (
      <GroupChallengePage
        currentUser={verifiedUser}
        onNavigate={navigateTo}
        onSignOut={() => {
          setActiveUser(null);
          setCurrentUser(null);
          navigateTo('landing');
        }}
      />
    );
  }

  // When in live Battle Zone split-screen arena
  if (currentPage === 'battle-zone') {
    const verifiedUser = getActiveUser();
    if (!verifiedUser) {
      if (currentUser) setCurrentUser(null);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('codelife_return_page', activeBattleId ? `battle-zone/${activeBattleId}` : 'battle-zone');
      }
      navigateTo('signin', 'Please sign in to enter the Battle Zone arena.', true, true);
      return null;
    }

    return (
      <BattleZonePage
        battleId={activeBattleId}
        currentUser={verifiedUser}
        onNavigate={navigateTo}
      />
    );
  }

  // When on the main authenticated Dashboard / Platform page
  if (currentPage === 'dashboard') {
    // Strictly ensure user exists in database before allowing access to dashboard
    const verifiedUser = getActiveUser();
    if (!verifiedUser) {
      if (currentUser) setCurrentUser(null);
      navigateTo('signin', 'Please sign in to access your dashboard.', true, true);
      return null;
    }

    return (
      <DashboardPage
        currentUser={verifiedUser}
        onNavigate={navigateTo}
        onSignOut={() => {
          setActiveUser(null);
          setCurrentUser(null);
          navigateTo('signin');
        }}
      />
    );
  }

  return (
    <div className="login-page-wrapper">
      {/* Company Branding Logo with proper ratio and high visibility */}
      <CompanyLogo position="top-left" />

      {/* Button to return to Landing Page */}
      <button
        type="button"
        className="back-to-landing-btn"
        onClick={() => navigateTo('landing')}
        title="Return to Home / Intro Page"
      >
        ← Home
      </button>

      {/* Background Image Layer with proper ratio */}
      <div className="login-page-bg" aria-hidden="true"></div>

      {/* Decorative ambient background glows */}
      <div className="ambient-glow ambient-glow-1"></div>
      <div className="ambient-glow ambient-glow-2"></div>

      {/* Render Current Active Page Flow */}
      {currentPage === 'signin' && (
        <LoginPage
          onForgotPassword={() => navigateTo('forgot-password')}
          onSignUpOtp={handleSignUpOtp}
          onDeviceVerificationRequired={(data) => {
            setDeviceVerificationData(data);
            navigateTo('device-verification');
          }}
          initialNotification={initialNotification}
          onLoginSuccess={(user) => {
            if (user) {
              setActiveUser(user);
              setCurrentUser(user);
            }
            let targetPage = 'landing';
            if (typeof window !== 'undefined') {
              const returnPage = sessionStorage.getItem('codelife_return_page');
              if (returnPage && VALID_PAGES.includes(returnPage)) {
                sessionStorage.removeItem('codelife_return_page');
                targetPage = returnPage;
              }
            }
            navigateTo(targetPage, null, true, true);
          }}
        />
      )}

      {currentPage === 'forgot-password' && (
        <ForgotPasswordPage
          onNavigate={navigateTo}
          onOtpSent={handleOtpSentForRecovery}
        />
      )}

      {currentPage === 'recovery-otp' && (
        <RecoveryOtpPage
          recoveryData={recoveryData}
          onNavigate={navigateTo}
          onOtpVerified={() => {}}
          onResendSuccess={handleRecoveryResendSuccess}
        />
      )}

      {currentPage === 'new-password' && (
        <NewPasswordPage
          recoveryData={recoveryData}
          onNavigate={navigateTo}
          onSuccessToast={(msg) => setInitialNotification(msg)}
        />
      )}

      {currentPage === 'signup-otp' && (
        <SignUpOtpPage
          signUpData={signUpData}
          onNavigate={navigateTo}
          onVerificationSuccess={(user) => {
            const activeUserObj = user || signUpData;
            if (activeUserObj) {
              setActiveUser(activeUserObj);
              setCurrentUser(activeUserObj);
            }
            let targetPage = 'dashboard';
            if (typeof window !== 'undefined') {
              const returnPage = sessionStorage.getItem('codelife_return_page');
              if (returnPage && VALID_PAGES.includes(returnPage)) {
                sessionStorage.removeItem('codelife_return_page');
                targetPage = returnPage;
              }
            }
            navigateTo(targetPage, null, true, true);
          }}
          onResendSuccess={handleSignUpResendSuccess}
        />
      )}

      {currentPage === 'device-verification' && (
        <DeviceVerificationPage
          verificationData={deviceVerificationData}
          onNavigate={navigateTo}
          onVerificationSuccess={(user) => {
            const activeUserObj = user || deviceVerificationData?.user;
            if (activeUserObj) {
              setActiveUser(activeUserObj);
              setCurrentUser(activeUserObj);
            }
            let targetPage = 'dashboard';
            if (typeof window !== 'undefined') {
              const returnPage = sessionStorage.getItem('codelife_return_page');
              if (returnPage && VALID_PAGES.includes(returnPage)) {
                sessionStorage.removeItem('codelife_return_page');
                targetPage = returnPage;
              }
            }
            navigateTo(targetPage, `Welcome back, ${activeUserObj.name || activeUserObj.username}!`, true, true);
          }}
          onResendSuccess={(newOtp, emailSuccess) => {
            setDeviceVerificationData((prev) => ({
              ...prev,
              otp: newOtp,
              emailSentSuccessfully: emailSuccess,
            }));
          }}
        />
      )}
    </div>
  );
}
