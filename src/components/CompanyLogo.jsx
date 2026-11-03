import React from 'react';
import './CompanyLogo.css';

/**
 * CompanyLogo Component
 * Renders the organization/company logo from public/company_logo.png (or cropped clean version)
 * with strict aspect ratio preservation (586x256, 2.289:1) and crisp visibility.
 * 
 * Supports positions: 'top-left' (default) | 'top-right' | 'above-card' | 'bottom-center'
 */
export default function CompanyLogo({ position = 'top-left', className = '' }) {
  return (
    <aside
      className={`company-logo-container company-logo-${position} ${className}`}
      aria-label="Localhost"
    >
      <div className="company-logo-badge" title="Localhost">
        <img
          src="/company_emblem.png"
          onError={(e) => {
            // Fallback to clean composite logo if separate emblem is unavailable
            e.currentTarget.src = '/company_logo_clean.png';
          }}
          alt="Localhost Emblem"
          className="company-logo-emblem"
        />
        <span className="company-logo-brand">LOCALHOST</span>
      </div>
    </aside>
  );
}
