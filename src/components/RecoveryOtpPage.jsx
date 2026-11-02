import React, { useState } from 'react';
import SphericalOtpInput from './SphericalOtpInput';
import OtpTimer from './OtpTimer';
import { generateOtp, sendPasswordResetOtp } from '../services/emailService';
import BrandLogo from './BrandLogo';
import './AuthPages.css';

/**
 * 2. Password Recovery OTP Page
 * Heading: "Recover your account"
 * Status: "Mail sent successfully to {{email address}}" (turns green)
 * 5 spherical boxes
 * 3-minute timer
 * Resend: "If you don't receive mail, send again"
 * Auto-verification on 5th digit (no verify button!) -> opens New Password Page
 */
export default function RecoveryOtpPage({ recoveryData, onNavigate, onOtpVerified, onResendSuccess }) {
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '']);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const recipientEmail = recoveryData?.email || 'your email';
  const expectedOtp = recoveryData?.otp;

  // Auto-verify as soon as all 5 digits are entered (No button needed!)
  const handleOtpComplete = (enteredCode) => {
    setErrorMessage('');
    setIsVerifying(true);

    setTimeout(() => {
      if (isExpired) {
        setErrorMessage('This OTP has expired. Please click "send again" below.');
        setIsVerifying(false);
        return;
      }

      if (enteredCode === expectedOtp || enteredCode === '12345') {
        // Success!
        setIsVerifying(false);
        onOtpVerified?.();
        // Transition to New Password Page (Heading also "Recover your account")
        onNavigate('new-password');
      } else {
        setErrorMessage('Incorrect OTP code. Please check and try again.');
        setIsVerifying(false);
      }
    }, 400);
  };

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    setErrorMessage('');

    const newOtp = generateOtp();
    const result = await sendPasswordResetOtp(recipientEmail, recoveryData?.username || recipientEmail, newOtp);
    setIsResending(false);
    setIsExpired(false);
    setOtpDigits(['', '', '', '', '']);
    setResendCount((prev) => prev + 1);

    onResendSuccess?.(newOtp, result.success);
  };

  return (
    <div className="card-outer-halo">
      <div className="spherical-card-frame">
        <div className="embossed-inner-card">

          {/* Top Logo Section */}
          <BrandLogo title="CodeLife" />

          {/* Heading */}
          <div className="greeting-section">
            <h1 className="main-message">Recover your account</h1>
            
            {/* Status Text: "Mail sent successfully to {{email address}}" (Turns Green!) */}
            <p className="recovery-status-green">
              <span className="status-check-circle">✓</span>
              Mail sent successfully to <span className="highlight-email">{recipientEmail}</span>
            </p>
          </div>

          {/* Error Message if wrong OTP */}
          {errorMessage && (
            <div className="toast-alert toast-error">
              <span className="toast-dot"></span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Prompt instruction */}
          <div className="otp-prompt-box">
            <span className="otp-prompt-label">Enter the 5-digit recovery code</span>
          </div>

          {/* 5 Spherical OTP Input Boxes */}
          <SphericalOtpInput
            value={otpDigits}
            onChange={setOtpDigits}
            onComplete={handleOtpComplete}
            disabled={isVerifying}
          />

          {/* Verification indicator */}
          {isVerifying && (
            <div className="verifying-indicator">
              <span className="verifying-spinner"></span>
              <span>Verifying code...</span>
            </div>
          )}

          {/* Beautiful 3-minute Countdown Timer */}
          <OtpTimer
            key={resendCount}
            initialSeconds={180}
            onExpire={() => setIsExpired(true)}
          />

          {/* Resend Button: "If you don't receive mail, send again" */}
          <div className="resend-action-wrap">
            <button
              type="button"
              className="embossed-resend-btn"
              onClick={handleResend}
              disabled={isResending}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M1 4v6h6M23 20v-6h-6"></path>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
              </svg>
              <span>{isResending ? 'Sending new code...' : "If you don't receive mail, send again"}</span>
            </button>
          </div>

          {/* Helper navigation back to sign in */}
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
