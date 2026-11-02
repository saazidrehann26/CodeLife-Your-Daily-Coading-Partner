import React, { useEffect, useState } from 'react';
import './OtpTimer.css';

/**
 * 3-Minute Beautiful Countdown Timer
 * @param {number} initialSeconds - Default 180 (3 minutes)
 * @param {function} onExpire - Called when timer reaches 0
 */
export default function OtpTimer({ initialSeconds = 180, onExpire }) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire?.();
      return;
    }

    const intervalId = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalId);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [secondsLeft, onExpire]);

  const minutes = Math.floor(secondsLeft / 60);
  const remainingSeconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  
  const isExpiringSoon = secondsLeft <= 30 && secondsLeft > 0;
  const isExpired = secondsLeft === 0;

  return (
    <div className={`otp-timer-badge ${isExpiringSoon ? 'is-warning' : ''} ${isExpired ? 'is-expired' : ''}`}>
      <div className="timer-icon-wrap">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </div>
      <span className="timer-label">Expires in:</span>
      <span className="timer-digits">{formattedTime}</span>
      {isExpired && <span className="timer-expired-tag">(Expired)</span>}
    </div>
  );
}
