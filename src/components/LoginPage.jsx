import React, { useState, useEffect, useRef } from 'react';
import { generateOtp, sendSignUpVerificationOtp, sendDeviceVerificationOtp } from '../services/emailService';
import {
  findUser,
  findUserAsync,
  checkUserExists,
  isValidApprovedEmail,
  getApprovedEmailErrorMessage,
  getOrCreateDeviceId,
  getCurrentDeviceName,
  isDeviceTrustedForUser,
  addTrustedDeviceForUser,
  getRememberedCredentials,
  saveRememberedCredentials,
  clearRememberedCredentials,
} from '../services/dbService';
import { evaluatePasswordStrength } from '../services/passwordService';
import { supabaseSignIn } from '../services/supabaseClient';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import BrandLogo from './BrandLogo';
import './LoginPage.css';

export default function LoginPage({
  onForgotPassword,
  onSignUpOtp,
  onDeviceVerificationRequired,
  initialNotification,
  onLoginSuccess,
}) {
  // Sign in page appears first when new user enters
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  
  // Pre-load remembered credentials if user checked "Remember me"
  const remembered = getRememberedCredentials();

  // Form fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState(remembered?.username || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(remembered?.password || '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(remembered?.rememberMe ?? remembered?.username));
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [notification, setNotification] = useState(
    initialNotification ? { message: initialNotification, type: 'success' } : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Input Refs for Enter key navigation to next credential box
  const signUpNameRef = useRef(null);
  const signUpUsernameRef = useRef(null);
  const signUpEmailRef = useRef(null);
  const signUpPasswordRef = useRef(null);
  const signUpConfirmPasswordRef = useRef(null);

  const signInUsernameRef = useRef(null);
  const signInPasswordRef = useRef(null);

  const isSignUp = mode === 'signup';
  const passwordEval = evaluatePasswordStrength(password);
  const isPasswordStrong = passwordEval.isStrong;

  useEffect(() => {
    if (!initialNotification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [initialNotification]);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  /**
   * Enter key press: passes focus to the next credential box
   */
  const handleKeyDownToNext = (e, nextRef, isLast = false) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isLast) {
        handleSubmit(e);
      } else if (nextRef?.current) {
        nextRef.current.focus();
      }
    }
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();

    if (isSignUp) {
      if (!name.trim()) {
        showToast('Please enter your name', 'error');
        signUpNameRef.current?.focus();
        return;
      }
      if (!username.trim()) {
        showToast('Please enter your username', 'error');
        signUpUsernameRef.current?.focus();
        return;
      }
      if (!email.trim()) {
        showToast('Please enter your email', 'error');
        signUpEmailRef.current?.focus();
        return;
      }

      // 1. Strict Email Security Policy: ONLY Gmail and Educational emails approved
      if (!isValidApprovedEmail(email)) {
        showToast(getApprovedEmailErrorMessage(email), 'error');
        signUpEmailRef.current?.focus();
        return;
      }

      // 2. Database Check: check if email or username is already present in database
      const { emailTaken, usernameTaken } = checkUserExists(email, username);
      if (emailTaken) {
        showToast('This email is already registered in our database. Please sign in.', 'error');
        signUpEmailRef.current?.focus();
        return;
      }
      if (usernameTaken) {
        showToast('This username is already taken. Please choose another username.', 'error');
        signUpUsernameRef.current?.focus();
        return;
      }

      if (!password.trim()) {
        showToast('Please enter your password', 'error');
        signUpPasswordRef.current?.focus();
        return;
      }
      // Password must meet all 5 criteria to be Strong
      if (!isPasswordStrong) {
        showToast(`Password must reach Strong strength before registering. ${passwordEval.helperText}`, 'error');
        signUpPasswordRef.current?.focus();
        return;
      }
      if (password !== confirmPassword) {
        showToast('Confirm password does not match password', 'error');
        signUpConfirmPasswordRef.current?.focus();
        return;
      }

      setIsSubmitting(true);
      const newOtp = generateOtp();

      // Send verification code using EmailJS (mailverify_coadingweb / template_ej77gs2)
      const result = await sendSignUpVerificationOtp(email, name, newOtp);
      setIsSubmitting(false);

      if (onSignUpOtp) {
        onSignUpOtp({
          name: name.trim(),
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password: password.trim(),
          otp: newOtp,
          emailSentSuccessfully: result.success,
          emailError: result.success ? null : result.message,
        });
      } else {
        showToast(`Verification code sent to ${email}!`, 'success');
      }
    } else {
      executeSignIn(username, password, rememberMe);
    }
  };

  /**
   * Execute authenticated sign-in, check device authorization,
   * require mail verification if on an unrecognized/new device,
   * persist credentials if Remember Me is enabled, and grant access.
   */
  const executeSignIn = async (userVal, passVal, shouldRemember) => {
    const trimmedUser = (userVal || '').trim();
    const trimmedPass = (passVal || '').trim();

    if (!trimmedUser || !trimmedPass) {
      showToast('Please enter your username/email and password', 'error');
      if (!trimmedUser) {
        signInUsernameRef.current?.focus();
      } else {
        signInPasswordRef.current?.focus();
      }
      return false;
    }

    // Database verification on Sign In:
    // Ensure every single time that the user already exists in the database!
    let existingUser = findUser(trimmedUser);
    if (!existingUser) {
      existingUser = await findUserAsync(trimmedUser);
    }
    if (!existingUser) {
      showToast('No account found in our database for this username or email. Please sign up first.', 'error');
      signInUsernameRef.current?.focus();
      return false;
    }

    // Validate password: must match user's registered password in database or Supabase Auth
    let isPasswordCorrect = existingUser.password === trimmedPass;
    if (!isPasswordCorrect && existingUser.email) {
      try {
        const sbRes = await supabaseSignIn(existingUser.email, trimmedPass);
        if (sbRes.success) {
          isPasswordCorrect = true;
        }
      } catch {
        // Fallback
      }
    }

    if (!isPasswordCorrect) {
      showToast('Incorrect password. Please try again or click Forgot password.', 'error');
      signInPasswordRef.current?.focus();
      return false;
    }

    const willRemember = typeof shouldRemember === 'boolean' ? shouldRemember : rememberMe;
    const currentDeviceId = getOrCreateDeviceId();
    const isTrusted = isDeviceTrustedForUser(existingUser.username, currentDeviceId);

    // Multi-Device Security: If logging in from an unrecognized device,
    // the user MUST pass through mail verification!
    if (!isTrusted) {
      setIsSubmitting(true);
      const newOtp = generateOtp();
      const deviceName = getCurrentDeviceName();

      showToast(`New device detected (${deviceName}). Sending verification code to ${existingUser.email}...`, 'info');

      try {
        const sendResult = await sendDeviceVerificationOtp(
          existingUser.email,
          existingUser.name || existingUser.username,
          newOtp,
          deviceName
        );
        setIsSubmitting(false);

        if (onDeviceVerificationRequired) {
          onDeviceVerificationRequired({
            user: existingUser,
            email: existingUser.email,
            name: existingUser.name || existingUser.username,
            otp: newOtp,
            deviceId: currentDeviceId,
            deviceName: deviceName,
            willRemember: willRemember,
            emailSentSuccessfully: sendResult.success,
            emailError: sendResult.success ? null : sendResult.message,
          });
        }
      } catch (err) {
        setIsSubmitting(false);
        console.error('[DeviceVerification] Error sending mail:', err);
        if (onDeviceVerificationRequired) {
          onDeviceVerificationRequired({
            user: existingUser,
            email: existingUser.email,
            name: existingUser.name || existingUser.username,
            otp: newOtp,
            deviceId: currentDeviceId,
            deviceName: deviceName,
            willRemember: willRemember,
            emailSentSuccessfully: false,
            emailError: err?.message,
          });
        }
      }
      return true;
    }

    // Device is already trusted
    if (willRemember) {
      saveRememberedCredentials({
        username: existingUser.username,
        password: trimmedPass,
        rememberMe: true,
      });
    } else {
      clearRememberedCredentials();
    }

    // Record last login device and timestamp
    addTrustedDeviceForUser(existingUser.username, currentDeviceId);

    showToast(`Welcome back, ${existingUser.name || existingUser.username}! Ready for today's code challenge.`, 'success');
    setTimeout(() => {
      if (onLoginSuccess) {
        onLoginSuccess(existingUser);
      }
    }, 600);
    return true;
  };

  /**
   * When any user clicks "Remember me", remember credentials and get him in.
   */
  const handleRememberMeToggle = (e) => {
    const isChecked = e.target.checked;
    setRememberMe(isChecked);

    if (isChecked) {
      // User clicked "Remember me": remember credentials and immediately get him in
      const currentUsername = username.trim();
      const currentPassword = password.trim();

      if (currentUsername && currentPassword) {
        // Both credentials already in inputs: save and get him in right now!
        executeSignIn(currentUsername, currentPassword, true);
      } else {
        // Check if there are previously saved credentials to autofill and get in
        const saved = getRememberedCredentials();
        if (saved?.username && saved?.password) {
          setUsername(saved.username);
          setPassword(saved.password);
          executeSignIn(saved.username, saved.password, true);
        } else {
          showToast('Remember Me enabled. Enter your credentials to sign in and be remembered.', 'info');
          if (!currentUsername) {
            signInUsernameRef.current?.focus();
          } else {
            signInPasswordRef.current?.focus();
          }
        }
      }
    } else {
      clearRememberedCredentials();
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    if (onForgotPassword) {
      onForgotPassword();
    } else {
      showToast('Opening password recovery...', 'info');
    }
  };

  return (
    <div className="card-outer-halo">
      <div className="spherical-card-frame">
        <div className="embossed-inner-card">

          {/* Mode Switch Pills */}
          <div className="mode-toggle-pills">
            <button
              type="button"
              className={`mode-pill-btn ${!isSignUp ? 'active' : ''}`}
              onClick={() => {
                setMode('signin');
                setNotification(null);
                const saved = getRememberedCredentials();
                if (saved?.username) {
                  setUsername(saved.username);
                  setPassword(saved.password || '');
                  setRememberMe(true);
                }
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`mode-pill-btn ${isSignUp ? 'active' : ''}`}
              onClick={() => {
                setMode('signup');
                setNotification(null);
              }}
            >
              Sign Up
            </button>
          </div>

          {/* Top Logo Section */}
          <BrandLogo title="CodeLife" />

          {/* Welcome Heading Message */}
          <div className="greeting-section">
            <h1 className="main-message">
              {isSignUp ? "Create your account" : "Let's start coding again"}
            </h1>
          </div>

          {/* Notification Toast */}
          {notification && (
            <div className={`toast-alert toast-${notification.type}`}>
              <span className="toast-dot"></span>
              <span>{notification.message}</span>
            </div>
          )}

          {/* Authentication Form */}
          <form onSubmit={handleSubmit} className="auth-form" noValidate>

            {/* =========================================================
                SEQUENCE REQUIRED BY USER (SIGN-UP / REGISTRATION MODE):
                1. Your name
                2. Your username
                3. Your email
                4. Your password
                5. Confirm Password
                ========================================================= */}

            {isSignUp ? (
              <>
                {/* BOX 1: Your name (Enter -> moves to Username) */}
                <div className="input-group">
                  <label htmlFor="fullname-input" className="field-label">
                    Your name
                  </label>
                  <div className="embossed-input-container">
                    <span className="input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                    </span>
                    <input
                      ref={signUpNameRef}
                      id="fullname-input"
                      type="text"
                      className="embossed-input"
                      placeholder="e.g. John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => handleKeyDownToNext(e, signUpUsernameRef)}
                      autoComplete="name"
                      disabled={isSubmitting}
                      required
                    />
                    {name && !isSubmitting && (
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => setName('')}
                        aria-label="Clear name"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* BOX 2: Your username (Enter -> moves to Email) */}
                <div className="input-group">
                  <label htmlFor="username-input" className="field-label">
                    Your username
                  </label>
                  <div className="embossed-input-container">
                    <span className="input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="4"></circle>
                        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path>
                      </svg>
                    </span>
                    <input
                      ref={signUpUsernameRef}
                      id="username-input"
                      type="text"
                      className="embossed-input"
                      placeholder="e.g. coder_dev"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={(e) => handleKeyDownToNext(e, signUpEmailRef)}
                      autoComplete="username"
                      disabled={isSubmitting}
                      required
                    />
                    {username && !isSubmitting && (
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => setUsername('')}
                        aria-label="Clear username"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* BOX 3: Your email (Enter -> moves to Password) */}
                <div className="input-group">
                  <label htmlFor="email-input" className="field-label">
                    Your email
                  </label>
                  <div className="embossed-input-container">
                    <span className="input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                    </span>
                    <input
                      ref={signUpEmailRef}
                      id="email-input"
                      type="email"
                      className="embossed-input"
                      placeholder="xyz@gmail.com or student@aust.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => handleKeyDownToNext(e, signUpPasswordRef)}
                      autoComplete="email"
                      disabled={isSubmitting}
                      required
                    />
                    {email && !isSubmitting && (
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => setEmail('')}
                        aria-label="Clear email"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span
                    className="field-security-hint"
                    style={{
                      fontSize: '0.74rem',
                      color: 'rgba(235, 235, 245, 0.58)',
                      marginTop: '4px',
                      display: 'block',
                      letterSpacing: '0.01em',
                    }}
                  >
                    Accepted: Gmail & Educational emails (.edu, .ac) only
                  </span>
                </div>

                {/* BOX 4: Your password (Enter -> moves to Confirm Password) */}
                <div className="input-group">
                  <label htmlFor="password-input" className="field-label">
                    Your password
                  </label>
                  <div className="embossed-input-container">
                    <span className="input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </span>
                    <input
                      ref={signUpPasswordRef}
                      id="password-input"
                      type={showPassword ? 'text' : 'password'}
                      className="embossed-input"
                      placeholder="Create your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => handleKeyDownToNext(e, signUpConfirmPasswordRef)}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-pw-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                  {/* Real-time Password Strength Indicator */}
                  <PasswordStrengthIndicator password={password} />
                </div>

                {/* BOX 5: Confirm Password (Enter -> Submits form) */}
                <div className="input-group">
                  <label htmlFor="confirm-password-input" className="field-label">
                    Confirm Password
                  </label>
                  <div className="embossed-input-container">
                    <span className="input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <path d="m9 12 2 2 4-4"></path>
                      </svg>
                    </span>
                    <input
                      ref={signUpConfirmPasswordRef}
                      id="confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="embossed-input"
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => handleKeyDownToNext(e, null, true)}
                      autoComplete="new-password"
                      disabled={isSubmitting}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-pw-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* =========================================================
                 SIGN-IN MODE:
                 - Your username or email
                 - Your password
                 ========================================================= */
              <>
                {/* Username / Mail (Enter -> moves to Password) */}
                <div className="input-group">
                  <label htmlFor="signin-username-input" className="field-label">
                    Your username or email
                  </label>
                  <div className="embossed-input-container">
                    <span className="input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                    </span>
                    <input
                      ref={signInUsernameRef}
                      id="signin-username-input"
                      type="text"
                      className="embossed-input"
                      placeholder="Enter your username or email"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={(e) => handleKeyDownToNext(e, signInPasswordRef)}
                      autoComplete="username"
                      required
                    />
                    {username && (
                      <button
                        type="button"
                        className="clear-btn"
                        onClick={() => setUsername('')}
                        aria-label="Clear username"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Password (Enter -> Submits form) */}
                <div className="input-group">
                  <label htmlFor="signin-password-input" className="field-label">
                    Your password
                  </label>
                  <div className="embossed-input-container">
                    <span className="input-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </span>
                    <input
                      ref={signInPasswordRef}
                      id="signin-password-input"
                      type={showPassword ? 'text' : 'password'}
                      className="embossed-input"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => handleKeyDownToNext(e, null, true)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="toggle-pw-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Options Row: Remember me & Forgot Password (Sign In only) */}
            {!isSignUp && (
              <div className="options-row">
                <label className="checkbox-label" htmlFor="remember-me-checkbox">
                  <div className="embossed-checkbox-wrapper">
                    <input
                      type="checkbox"
                      id="remember-me-checkbox"
                      checked={rememberMe}
                      onChange={handleRememberMeToggle}
                    />
                    <span className="embossed-checkbox-custom">
                      <svg className="check-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  </div>
                  <span className="checkbox-text">Remember me</span>
                </label>

                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={handleForgotPassword}
                >
                  Forgot password
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className={`embossed-submit-btn ${isSignUp && !isPasswordStrong ? 'is-disabled-strength' : ''}`}
              disabled={isSubmitting || (isSignUp && !isPasswordStrong)}
              title={isSignUp && !isPasswordStrong ? 'Password must meet all 5 criteria to be Strong before registering' : ''}
            >
              <span className="btn-backlit-beam"></span>
              <span className="btn-text">
                {isSubmitting
                  ? (isSignUp ? 'Sending verification code...' : 'Signing in...')
                  : (isSignUp ? 'Sign up' : 'Sign in')}
              </span>
              <svg className="btn-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>

          </form>

          {/* Bottom streak quote */}
          <div className="daily-streak-hint">
            <span className="streak-dot"></span>
            <span>1 Code Daily = Lifelong Retention</span>
          </div>

        </div>
      </div>
    </div>
  );
}
