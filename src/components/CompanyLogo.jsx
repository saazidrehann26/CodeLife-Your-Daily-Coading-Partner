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
      aria-label="Company Logo"
    >
      <div className="company-logo-badge" title="Company Logo">
        <img
          src="/company_logo_clean.png"
          onError={(e) => {
            // Fallback to original public/company_logo.png if clean crop not found
            e.currentTarget.src = '/company_logo.png';
          }}
          alt="Company Logo"
          className="company-logo-img"
        />
      </div>
    </aside>
  );
}
