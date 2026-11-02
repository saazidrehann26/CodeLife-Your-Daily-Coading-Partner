import React from 'react';
import { evaluatePasswordStrength } from '../services/passwordService';
import './PasswordStrengthIndicator.css';

/**
 * Real-Time Password Strength Meter Component
 * - 5 segmented progress bar updating in real time
 * - Weak (Red 0-2) | Fair/Medium (Orange/Yellow 3-4) | Strong (Green 5)
 * - Real-time helper text explaining what is missing
 */
export default function PasswordStrengthIndicator({ password = '' }) {
  const { metCount, criteria, strength, strengthLabel, helperText } = evaluatePasswordStrength(password);

  // If user hasn't started typing, show a clean initial hint
  if (!password) {
    return (
      <div className="pwd-strength-container is-empty">
        <div className="pwd-meter-track">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="pwd-meter-segment" />
          ))}
        </div>
        <div className="pwd-helper-row">
          <span className="pwd-helper-text">
            Use 8+ chars, uppercase, lowercase, number & symbol
          </span>
          <span className="pwd-strength-badge badge-empty">Required</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`pwd-strength-container strength-${strength}`}>
      {/* 5-Segment Dynamic Progress Meter */}
      <div className="pwd-meter-track" role="progressbar" aria-valuenow={metCount} aria-valuemin={0} aria-valuemax={5}>
        {[0, 1, 2, 3, 4].map((index) => {
          const isActive = index < metCount;
          return (
            <div
              key={index}
              className={`pwd-meter-segment ${isActive ? `active-${strength}` : ''}`}
            />
          );
        })}
      </div>

      {/* Helper Text & Strength Badge */}
      <div className="pwd-helper-row">
        <span className={`pwd-helper-text text-${strength}`}>
          {helperText}
        </span>
        <span className={`pwd-strength-badge badge-${strength}`}>
          {strengthLabel}
        </span>
      </div>

      {/* Checklist items for immediate clarity */}
      <div className="pwd-criteria-checklist">
        {criteria.map((c) => (
          <span
            key={c.id}
            className={`pwd-criterion-pill ${c.isMet ? 'pill-met' : 'pill-missing'}`}
            title={c.missingText}
          >
            <span className="criterion-icon">{c.isMet ? '✓' : '○'}</span>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
