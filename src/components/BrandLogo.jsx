import React from 'react';

/**
 * BrandLogo Component
 * Displays the CodeLife brain logo with proper aspect ratio inside the embossed spherical badge,
 * accompanied by the "CodeLife" pill.
 */
export default function BrandLogo({ title = "CodeLife" }) {
  return (
    <div className="logo-section">
      <div className="embossed-logo-badge" title={title}>
        <div className="logo-inner-sphere">
          <img
            src="/codelife_logo_white_bg.png"
            onError={(e) => {
              e.currentTarget.src = '/codelife_logo_square.png';
            }}
            alt="CodeLife Logo"
            className="logo-img"
          />
        </div>
      </div>
    </div>
  );
}
