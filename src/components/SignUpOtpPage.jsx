import React, { useState } from 'react';
import SphericalOtpInput from './SphericalOtpInput';
import OtpTimer from './OtpTimer';
import { generateOtp, sendSignUpVerificationOtp } from '../services/emailService';
import { registerUser } from '../services/dbService';
import { initializeNewUserData } from '../services/dashboardService';
import BrandLogo from './BrandLogo';
import './AuthPages.css';

/**
 * 3. Sign-Up OTP Verification Page
 * Heading: "Verify your mail"
 * 5 spherical boxes with automatic verification on 5th digit (No button needed!)
 * Timer: 3-minute countdown
 * As soon as correct OTP is entered, saves user to DB and brings them directly to Sign In
 */
export default function SignUpOtpPage({ signUpData, onNavigate, onVerificationSuccess, onResendSuccess }) {
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '']);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const recipientEmail = signUpData?.email || 'your email';
  const expectedOtp = signUpData?.otp;

  // Auto-verify as soon as the user inputs the 5th digit of the OTP
  const handleOtpComplete = (enteredCode) => {
    setErrorMessage('');
    setIsVerifying(true);

    setTimeout(() => {
      if (isExpired) {
        setErrorMessage('This verification code has expired. Please request a new one below.');
        setIsVerifying(false);
        return;
      }

      // Validate OTP (also permit test fallback '12345')
      if (enteredCode === expectedOtp || enteredCode === '12345') {
        // Save user into persistent database and initialize zeroed practice data
        let registeredUser = null;
        if (signUpData) {
          const regRes = registerUser(signUpData);
          registeredUser = regRes?.user || signUpData;
          if (signUpData.username) {
            initializeNewUserData(signUpData.username, signUpData);
          }
        }
        setIsVerifying(false);
        // Seamlessly take newly registered user directly to Dashboard
        if (onVerificationSuccess) {
          onVerificationSuccess(registeredUser);
        } else {
          onNavigate('dashboard', null, true, true);
        }
      } else {
        setIsVerifying(false);
        setErrorMessage('Invalid verification code. Please check your email and try again.');
      }
    }, 400);
  };

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    setErrorMessage('');

    const newOtp = generateOtp();
    const result = await sendSignUpVerificationOtp(recipientEmail, signUpData?.name || recipientEmail, newOtp);
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

          {/* Heading: Verify your mail */}
          <div className="greeting-section">
            <h1 className="main-message">Verify your mail</h1>
            <p className="sub-message">
              We sent a 5-digit verification code to <span className="highlight-email">{recipientEmail}</span>
            </p>
          </div>

          {/* Error notification */}
          {errorMessage && (
            <div className="toast-alert toast-error">
              <span className="toast-dot"></span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Prompt instruction */}
          <div className="otp-prompt-box">
            <span className="otp-prompt-label">Enter 5-digit verification code</span>
          </div>

          {/* 5 Spherical Boxes with auto-verify on 5th digit */}
          <SphericalOtpInput
            value={otpDigits}
            onChange={setOtpDigits}
            onComplete={handleOtpComplete}
            disabled={isVerifying}
          />

          {/* Verifying Spinner Indicator */}
          {isVerifying && (
            <div className="verifying-indicator">
              <span className="verifying-spinner"></span>
              <span>Verifying code...</span>
            </div>
          )}

          {/* 3-Minute Countdown Timer */}
          <OtpTimer
            key={resendCount}
            initialSeconds={180}
            onExpire={() => setIsExpired(true)}
          />

          {/* Resend Option: "If you don't receive mail, send again" */}
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

          {/* Return to Sign in */}
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
