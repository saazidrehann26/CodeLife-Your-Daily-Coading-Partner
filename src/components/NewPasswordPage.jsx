import React, { useState, useRef } from 'react';
import { updateUserPassword } from '../services/dbService';
import { evaluatePasswordStrength } from '../services/passwordService';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import BrandLogo from './BrandLogo';
import './AuthPages.css';

/**
 * 2b. New Password Page (Password Recovery Flow)
 * Heading: "Recover your account"
 * Fields: "Your new password" & "Confirm new password"
 * Action: Updates password in database and brings user back to Sign in
 * Keyboard: Pressing Enter moves focus to next box or submits
 */
export default function NewPasswordPage({ recoveryData, onNavigate, onSuccessToast }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const newPasswordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const passwordEval = evaluatePasswordStrength(newPassword);
  const isPasswordStrong = passwordEval.isStrong;

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    setErrorMsg('');

    if (!newPassword.trim()) {
      setErrorMsg('Please enter your new password');
      newPasswordRef.current?.focus();
      return;
    }
    if (!isPasswordStrong) {
      setErrorMsg(`Password must reach Strong strength before saving. ${passwordEval.helperText}`);
      newPasswordRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Confirm password does not match new password');
      confirmPasswordRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    // Update user password in the persistent database
    const identifier = recoveryData?.email || recoveryData?.username;
    if (identifier) {
      updateUserPassword(identifier, newPassword);
    }

    setTimeout(() => {
      setIsSubmitting(false);
      onSuccessToast?.('Your password has been successfully reset! Please sign in with your new password.');
      onNavigate('signin');
    }, 500);
  };

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

  return (
    <div className="card-outer-halo">
      <div className="spherical-card-frame">
        <div className="embossed-inner-card">

          {/* Top Logo Section */}
          <BrandLogo title="CodeLife" />

          {/* Heading: Recover your account */}
          <div className="greeting-section">
            <h1 className="main-message">Recover your account</h1>
            <p className="sub-message">Create your new password to regain access to your account</p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="toast-alert toast-error">
              <span className="toast-dot"></span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            
            {/* Box 1: Your new password */}
            <div className="input-group">
              <label htmlFor="new-password-input" className="field-label">
                Your new password
              </label>
              <div className="embossed-input-container">
                <span className="input-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input
                  ref={newPasswordRef}
                  id="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  className="embossed-input"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => handleKeyDownToNext(e, confirmPasswordRef)}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  className="toggle-pw-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              <PasswordStrengthIndicator password={newPassword} />
            </div>

            {/* Box 2: Confirm new password */}
            <div className="input-group">
              <label htmlFor="confirm-new-password-input" className="field-label">
                Confirm new password
              </label>
              <div className="embossed-input-container">
                <span className="input-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    <path d="m9 12 2 2 4-4"></path>
                  </svg>
                </span>
                <input
                  ref={confirmPasswordRef}
                  id="confirm-new-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="embossed-input"
                  placeholder="Repeat your new password"
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

            {/* Button: Update password */}
            <button
              type="submit"
              className={`embossed-submit-btn ${!isPasswordStrong ? 'is-disabled-strength' : ''}`}
              disabled={isSubmitting || !isPasswordStrong}
              title={!isPasswordStrong ? 'Password must reach Strong strength before updating' : ''}
            >
              <span className="btn-backlit-beam"></span>
              <span className="btn-text">
                {isSubmitting ? 'Updating password...' : 'Update password & Sign in'}
              </span>
              <svg className="btn-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </form>

          {/* Cancel & return */}
          <div className="aux-nav-row">
            <button
              type="button"
              className="aux-back-link"
              onClick={() => onNavigate('signin')}
            >
              ← Cancel and return to Sign in
            </button>
          </div>

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
