import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import RecoveryOtpPage from './components/RecoveryOtpPage';
import NewPasswordPage from './components/NewPasswordPage';
import SignUpOtpPage from './components/SignUpOtpPage';
import DeviceVerificationPage from './components/DeviceVerificationPage';
import DashboardPage from './components/DashboardPage';
import CompanyLogo from './components/CompanyLogo';
import { setActiveUser, getActiveUser } from './services/dashboardService';
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
];

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

  // On fresh window session start (e.g. opening localhost in a new tab or window),
  // always start from the home page ('landing')
  const sessionStarted = sessionStorage.getItem('codelife_session_started');
  if (!sessionStarted) {
    sessionStorage.setItem('codelife_session_started', 'true');
    if (window.location.hash && window.location.hash !== '#landing') {
      window.history.replaceState({ page: 'landing' }, '', window.location.pathname);
    }
    return 'landing';
  }

  const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  
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
  const navigateTo = useCallback((page, toastMessage = null, pushHistory = true, replaceHistory = false) => {
    if (!VALID_PAGES.includes(page)) {
      page = 'landing';
    }

    if (toastMessage) {
      setInitialNotification(toastMessage);
    }
    setCurrentPage(page);

    if (typeof window !== 'undefined') {
      const targetHash = page === 'landing' ? '' : `#${page}`;
      const newUrl = targetHash ? `${window.location.pathname}${targetHash}` : window.location.pathname;
      
      if (replaceHistory) {
        window.history.replaceState(
          { page },
          '',
          newUrl
        );
      } else if (pushHistory) {
        // Push new state entry into the browser's session history stack
        window.history.pushState(
          { page },
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

  // When on initial intro landing page, render LandingPage with fixed background & smooth scrolling
  if (currentPage === 'landing') {
    return (
      <LandingPage
        currentUser={currentUser}
        onNavigate={navigateTo}
        onGetStarted={() => {
          if (currentUser || getActiveUser()) {
            navigateTo('dashboard');
          } else {
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

  // When on the main authenticated Dashboard / Platform page
  if (currentPage === 'dashboard') {
    // Strictly ensure user exists in database before allowing access to dashboard
    const verifiedUser = getActiveUser();
    if (!verifiedUser) {
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
            navigateTo('landing', null, true, true);
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
            navigateTo('dashboard', null, true, true);
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
            navigateTo('dashboard', `Welcome back, ${activeUserObj.name || activeUserObj.username}!`, true, true);
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
