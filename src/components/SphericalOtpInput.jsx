import React, { useRef, useEffect } from 'react';
import './SphericalOtpInput.css';

/**
 * 5 Spherical OTP Input Boxes Component
 * - 5 circular/spherical debossed neumorphic frames
 * - Proportional typography
 * - Automatic focus progression, backspace navigation & paste handling
 */
export default function SphericalOtpInput({ value = ['', '', '', '', ''], onChange, onComplete, disabled = false }) {
  const inputRefs = useRef([]);

  useEffect(() => {
    // Focus the first box on initial render
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index, e) => {
    const rawVal = e.target.value;
    // Keep only the last character entered if user typed, and only if numeric
    const digit = rawVal.replace(/\D/g, '').slice(-1);

    const newOtp = [...value];
    newOtp[index] = digit;
    onChange(newOtp);

    // If digit entered, advance to next box
    if (digit && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if all 5 digits are filled
    if (digit && index === 4) {
      if (newOtp.every(d => d !== '')) {
        onComplete?.(newOtp.join(''));
      }
    } else if (newOtp.every(d => d !== '')) {
      onComplete?.(newOtp.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!value[index] && index > 0) {
        // Move back and clear previous
        const newOtp = [...value];
        newOtp[index - 1] = '';
        onChange(newOtp);
        inputRefs.current[index - 1]?.focus();
      } else if (value[index]) {
        const newOtp = [...value];
        newOtp[index] = '';
        onChange(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 4) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (index < 4) {
        inputRefs.current[index + 1]?.focus();
      } else if (value.every((d) => d !== '')) {
        onComplete?.(value.join(''));
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    if (!pastedData) return;

    const newOtp = [...value];
    for (let i = 0; i < 5; i++) {
      newOtp[i] = pastedData[i] || '';
    }
    onChange(newOtp);

    // Focus last filled box or next empty
    const focusIndex = Math.min(pastedData.length, 4);
    inputRefs.current[focusIndex]?.focus();

    if (pastedData.length === 5) {
      onComplete?.(pastedData);
    }
  };

  return (
    <div className="spherical-otp-row" onPaste={handlePaste}>
      {Array.from({ length: 5 }).map((_, index) => {
        const isFilled = Boolean(value[index]);
        return (
          <div
            key={index}
            className={`spherical-otp-sphere ${isFilled ? 'is-filled' : ''} ${disabled ? 'is-disabled' : ''}`}
          >
            <input
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2} // Allow 2 momentarily so onChange extracts last
              value={value[index] || ''}
              onChange={(e) => handleChange(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={disabled}
              className="spherical-otp-input"
              autoComplete="one-time-code"
              aria-label={`Digit ${index + 1}`}
            />
            {/* Subtle specular rim reflection */}
            <span className="sphere-specular-light"></span>
          </div>
        );
      })}
    </div>
  );
}
