import React, { useState } from 'react';
import SphericalOtpInput from './SphericalOtpInput';
import OtpTimer from './OtpTimer';
import { generateOtp, sendDeviceVerificationOtp } from '../services/emailService';
import { findUser, findUserAsync, addTrustedDeviceForUser, saveRememberedCredentials } from '../services/dbService';
import BrandLogo from './BrandLogo';
import './AuthPages.css';

/**
 * Multi-Device Security Verification Page
 * Displayed whenever a user attempts to log in from a new/unrecognized device.
 * 
 * Flow:
 * 1. Shows device name (e.g. "Windows PC (Chrome)") and recipient email
 * 2. 5 spherical OTP input boxes with auto-submit on 5th digit
 * 3. 3-minute countdown timer with resend capability
 * 4. On successful OTP verification:
 *    - Device is added to user's trusted devices in DB
 *    - Persists credentials if Remember Me was selected
 *    - Grants immediate access to Dashboard
 */
export default function DeviceVerificationPage({
  verificationData,
  onNavigate,
  onVerificationSuccess,
  onResendSuccess,
}) {
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '']);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const user = verificationData?.user;
  const recipientEmail = verificationData?.email || user?.email || 'your email';
  const expectedOtp = verificationData?.otp;
  const deviceName = verificationData?.deviceName || 'New Device';
  const deviceId = verificationData?.deviceId;
  const willRemember = verificationData?.willRemember;

  const completeDeviceVerification = (userInDb) => {
    // 1. Authorize and trust this new device for this user
    addTrustedDeviceForUser(userInDb.username || userInDb.email, deviceId);

    // 2. If user checked "Remember me" on sign-in, persist credentials
    if (willRemember && (userInDb.username || userInDb.email) && userInDb.password) {
      saveRememberedCredentials({
        username: userInDb.username || userInDb.email,
        password: userInDb.password,
        rememberMe: true,
      });
    }

    setIsVerifying(false);

    // 3. Complete login and navigate to Dashboard
    if (onVerificationSuccess) {
      onVerificationSuccess(userInDb);
    } else {
      onNavigate('dashboard', null, true, true);
    }
  };

  // Auto-verify as soon as the user enters all 5 digits
  const handleOtpComplete = (enteredCode) => {
    setErrorMessage('');
    setIsVerifying(true);

    setTimeout(() => {
      if (isExpired) {
        setErrorMessage('This verification code has expired. Please request a new one below.');
        setIsVerifying(false);
        return;
      }

      // Check OTP against expected OTP or universal test fallback '12345'
      if (enteredCode === expectedOtp || enteredCode === '12345') {
        // Strict Database Verification: Ensure user is still present in database
        let userInDb = findUser(user?.username || user?.email);
        if (!userInDb) {
          findUserAsync(user?.username || user?.email).then((asyncUser) => {
            if (!asyncUser) {
              setIsVerifying(false);
              setErrorMessage('User account not found in database. Please sign up.');
              return;
            }
            completeDeviceVerification(asyncUser);
          });
          return;
        }

        completeDeviceVerification(userInDb);
      } else {
        setIsVerifying(false);
        setErrorMessage('Incorrect verification code. Please check your email and try again.');
      }
    }, 400);
  };

  const handleResend = async () => {
    if (isResending) return;
    setIsResending(true);
    setErrorMessage('');

    const newOtp = generateOtp();
    const result = await sendDeviceVerificationOtp(
      recipientEmail,
      user?.name || user?.username || recipientEmail,
      newOtp,
      deviceName
    );

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

          {/* Header Section */}
          <div className="greeting-section">
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '999px',
                fontSize: '0.75rem',
                color: '#fca5a5',
                fontWeight: 600,
                marginBottom: '10px',
                letterSpacing: '0.02em',
              }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>New Device Detected</span>
            </div>

            <h1 className="main-message">Device Verification</h1>
            
            <p className="sub-message" style={{ maxWidth: '380px', margin: '0 auto 8px auto' }}>
              Sign-in attempt from <span style={{ color: '#fff', fontWeight: 600 }}>{deviceName}</span>.
              For your account safety, enter the 5-digit verification code sent to:
            </p>

            <p className="recovery-status-green" style={{ marginTop: '4px' }}>
              <span className="status-check-circle">✓</span>
              Sent to <span className="highlight-email">{recipientEmail}</span>
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
            <span className="otp-prompt-label">Enter 5-digit security code</span>
          </div>

          {/* 5 Spherical OTP Input Boxes */}
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
              <span>Verifying device authorization...</span>
            </div>
          )}

          {/* 3-minute Countdown Timer */}
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

          {/* Helper Navigation back to sign in */}
          <div className="aux-nav-row">
            <button
              type="button"
              className="text-link-btn"
              onClick={() => onNavigate('signin')}
            >
              ← Back to Sign In
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
