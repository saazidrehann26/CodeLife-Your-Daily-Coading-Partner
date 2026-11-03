import React, { useState } from 'react';
import { generateOtp, sendPasswordResetOtp } from '../services/emailService';
import { findUser, findUserAsync, isValidApprovedEmail, getApprovedEmailErrorMessage } from '../services/dbService';
import BrandLogo from './BrandLogo';
import './AuthPages.css';

/**
 * 1. Forgot Password Page
 * Heading: "Recover your account"
 * Input: "Your registered mail/username"
 * Button: "Check database and send OTP"
 * - Validates email format {name}@{domain}.com
 * - Checks database for existing user before sending OTP
 * - Press Enter on keyboard triggers submission
 */
export default function ForgotPasswordPage({ onNavigate, onOtpSent }) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setErrorMsg('');

    const trimmed = identifier.trim();
    if (!trimmed) {
      setErrorMsg('Please enter your registered mail or username');
      return;
    }

    const isEmail = trimmed.includes('@');
    // 1. Strict Email Security Policy: Only approved Gmail and educational emails
    if (isEmail && !isValidApprovedEmail(trimmed)) {
      setErrorMsg(getApprovedEmailErrorMessage(trimmed));
      return;
    }

    // 2. Database validation: check if email or username is present in database
    let existingUser = findUser(trimmed);
    if (!existingUser) {
      existingUser = await findUserAsync(trimmed);
    }
    if (!existingUser) {
      setErrorMsg('This email/username is not found in our database. Please check your spelling or sign up.');
      return;
    }

    // 3. Verified email address from registered database record
    const recipientEmail = existingUser.email;
    const recipientUsername = existingUser.username || existingUser.name || trimmed;

    setLoading(true);
    const newOtp = generateOtp();

    // Call EmailJS using resetpass_coadingweb service
    const result = await sendPasswordResetOtp(recipientEmail, recipientUsername, newOtp);
    setLoading(false);

    // Call onOtpSent with the verified email and otp generated
    onOtpSent({
      email: recipientEmail,
      username: recipientUsername,
      otp: newOtp,
      isEmailActual: true,
      emailSentSuccessfully: result.success,
      emailError: result.success ? null : result.message,
    });

    // Navigate to Recovery OTP Page
    onNavigate('recovery-otp');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
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
            <p className="sub-message">Enter your credentials to receive a 5-digit verification code</p>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="toast-alert toast-error">
              <span className="toast-dot"></span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            
            {/* Box: Your registered mail/username */}
            <div className="input-group">
              <label htmlFor="registered-identifier-input" className="field-label">
                Your registered mail/username
              </label>
              <div className="embossed-input-container">
                <span className="input-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </span>
                <input
                  id="registered-identifier-input"
                  type="text"
                  className="embossed-input"
                  placeholder="name@university.edu or username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="username"
                  disabled={loading}
                  required
                />
                {identifier && !loading && (
                  <button
                    type="button"
                    className="clear-btn"
                    onClick={() => setIdentifier('')}
                    aria-label="Clear input"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Button: Check database and send OTP */}
            <button
              type="submit"
              className="embossed-submit-btn"
              disabled={loading}
            >
              <span className="btn-backlit-beam"></span>
              <span className="btn-text">
                {loading ? 'Checking database & sending OTP...' : 'Check database and send OTP'}
              </span>
              <svg className="btn-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </form>

          {/* Back to Sign in link */}
          <div className="aux-nav-row">
            <button
              type="button"
              className="aux-back-link"
              onClick={() => onNavigate('signin')}
            >
              ← Back to Sign in
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
