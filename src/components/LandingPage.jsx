import React, { useEffect, useRef, useState } from 'react';
import CompanyLogo from './CompanyLogo';
import { getUserProfile } from '../services/dashboardService';
import './LandingPage.css';

/**
 * LandingPage Component
 * 
 * Initial introduction and feature showcase page presented to the user
 * before the login/auth flow.
 * 
 * Features:
 * - Still fixed background with smooth scrolling content.
 * - Top Navigation Bar with brand identity, "Get started for free", "Contact Us", "Privacy Policy", "About us".
 * - Hero section featuring landing_page.jpg, "What is the purpose of CodeLife", and introductory paragraph.
 * - Scroll-triggered animated feature showcases:
 *   1. "Code Store" with codestore.png (opposite slide-in).
 *   2. "Code Editor" with compiler.png + C, C++, Python language logos (slide-in-up together).
 *   3. "Streak Counter" with streak.png + graph.png analytics.
 *   4. Ending showcase with combine.png and call-to-action.
 */
const CURRENT_YEAR = new Date().getFullYear();

export default function LandingPage({ onGetStarted, currentUser, onNavigate, onSignOut }) {
  // Active modal state: null | 'contact' | 'privacy' | 'about'
  const [activeModal, setActiveModal] = useState(null);

  // Authenticated user profile for home page display
  const profile = currentUser ? getUserProfile(currentUser) : null;
  const isLoggedIn = !!currentUser;

  // References to observe for scroll transitions
  const containerRef = useRef(null);

  useEffect(() => {
    // Prevent browser from restoring awkward half-scroll offsets on page refresh
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Set up IntersectionObserver to trigger animations continuously as user scrolls back and forth
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.1,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        } else {
          // Remove class when element exits viewport so animation replays every time user scrolls through
          entry.target.classList.remove('is-visible');
        }
      });
    }, observerOptions);

    const animatedElements = containerRef.current?.querySelectorAll('.scroll-reveal');
    animatedElements?.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-page-container" ref={containerRef}>
      {/* Fixed Still Background */}
      <div className="landing-fixed-bg" aria-hidden="true">
        <div className="landing-bg-vignette" />
      </div>

      {/* Top Navigation Bar */}
      <header className="landing-navbar">
        <div className="landing-navbar-inner">
          {/* Left Brand Identity */}
          <div className="landing-brand-group">
            <div className="landing-company-wrapper">
              <CompanyLogo position="static" />
            </div>
            <div className="landing-brand-divider" />
            <div className="landing-brand-logo">
              <div className="landing-logo-circle">
                <img
                  src="/codelife_logo_white_bg.png"
                  alt="CodeLife Logo"
                  className="landing-logo-img"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/favicon_brand.png';
                  }}
                />
              </div>
              <span className="landing-brand-name">CodeLife</span>
            </div>
          </div>

          {/* Right Navigation Controls */}
          <nav className="landing-nav-links" aria-label="Main Navigation">
            {isLoggedIn ? (
              <>
                <button
                  type="button"
                  className="landing-cta-btn"
                  onClick={() => (onNavigate ? onNavigate('dashboard') : onGetStarted())}
                  title="Enter your coding dashboard"
                >
                  <span>Go to Dashboard</span>
                  <svg className="landing-btn-arrow" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                <div
                  className="landing-user-badge"
                  onClick={() => (onNavigate ? onNavigate('dashboard') : onGetStarted())}
                  title="View your dashboard & profile"
                >
                  <span className="landing-user-name">{profile?.fullName || currentUser?.name || 'My Account'}</span>
                </div>

                <button
                  type="button"
                  className="landing-nav-item"
                  onClick={onSignOut}
                  title="Sign out of current account"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="landing-cta-btn"
                  onClick={onGetStarted}
                >
                  <span>Get started for free</span>
                  <svg className="landing-btn-arrow" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="landing-nav-item"
                  onClick={() => (onNavigate ? onNavigate('signin') : onGetStarted())}
                >
                  Sign In
                </button>
              </>
            )}

            <button
              type="button"
              className="landing-nav-item"
              onClick={() => setActiveModal('contact')}
            >
              Contact Us
            </button>

            <button
              type="button"
              className="landing-nav-item"
              onClick={() => setActiveModal('privacy')}
            >
              Privacy Policy
            </button>

            <button
              type="button"
              className="landing-nav-item"
              onClick={() => {
                scrollToSection('purpose-section');
                setActiveModal('about');
              }}
            >
              About us
            </button>
          </nav>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="landing-main-content">
        {/* =========================================================================
            HERO / PURPOSE SECTION
            - landing_page.jpg in (fade in up)
            - "What is the purpose of CodeLife" in (fade in up)
            - Paragraph in (slide in up)
           ========================================================================= */}
        <section className="landing-hero-section" id="purpose-section">
          <div className="landing-hero-content">
            {/* Landing Hero Image in (fade in up) */}
            <div className="scroll-reveal anim-fade-in-up landing-hero-media">
              <div className="landing-media-frame">
                <img
                  src="/landing_page.jpg"
                  alt="CodeLife Platform Overview"
                  className="landing-hero-img"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/landing_page.png';
                  }}
                />
                <div className="landing-media-glow" />
              </div>
            </div>

            {/* Title in (fade in up) */}
            <h1 className="scroll-reveal anim-fade-in-up landing-hero-title">
              What is the purpose of <span className="highlight-text">CodeLife</span>
            </h1>

            {/* Paragraph in (slide in up) from public/webite_landing_text.txt */}
            <div className="scroll-reveal anim-slide-in-up landing-hero-desc-wrapper">
              <p className="landing-hero-desc">
                This platform provides students with an all-in-one workspace to write, store, and master
                programming skills directly in the browser. It combines a personal code store where one can
                make a collection of problems, multi-language online compiler, eliminating the need for
                local development setups. The website bridges the gap between learning and real-world
                application by offering adaptive practice patterns, detailed performance tracking, and
                competitive leaderboards with your friends. Ultimately, it serves as a centralized,
                interactive environment designed to help students continuously improve their coding
                proficiency, track their momentum, and test their logic seamlessly.
              </p>
            </div>
          </div>
        </section>

        {/* Section Divider */}
        <div className="landing-section-divider">
          <span className="divider-pill">Platform Features</span>
        </div>

        {/* =========================================================================
            FEATURE 1: CODE STORE
            - Image (codestore.png) and text (Code Store) come from opposite sides
           ========================================================================= */}
        <section className="landing-feature-section" id="feature-codestore">
          <div className="landing-feature-grid">
            {/* Text side: comes from left */}
            <div className="scroll-reveal anim-slide-in-left landing-feature-text">
              <h2 className="landing-feature-title">Code Store</h2>
              <p className="landing-feature-description">
                Your personal vault for curated programming challenges, solution templates, and
                algorithmic snippets. Organize problems by difficulty, tag custom patterns, and build a
                lasting archive of solutions that stays with you forever.
              </p>
              <ul className="feature-perks-list">
                <li>
                  <span className="perk-check">✓</span>
                  <span>Personalized problem bank tailored to your learning pace</span>
                </li>
                <li>
                  <span className="perk-check">✓</span>
                  <span>Categorized by data structures, algorithms, and tags</span>
                </li>
                <li>
                  <span className="perk-check">✓</span>
                  <span>Instant retrieval and multi-device cloud synchronization</span>
                </li>
              </ul>
            </div>

            {/* Image side: comes from right */}
            <div className="scroll-reveal anim-slide-in-right landing-feature-media">
              <div className="landing-card-glow-wrap">
                <img
                  src="/codestore.png"
                  alt="Code Store Feature Showcase"
                  className="landing-feature-img"
                />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            FEATURE 2: CODE EDITOR
            - Image (compiler.png) and text (Code Editor) come from opposite sides
            - 3 language logos (C, C++, Python) appear together in slide up transition
           ========================================================================= */}
        <section className="landing-feature-section landing-feature-reversed landing-feature-compiler" id="feature-editor">
          <div className="landing-feature-grid landing-compiler-grid">
            {/* Image side: comes from left, significantly enlarged */}
            <div className="scroll-reveal anim-slide-in-left landing-feature-media compiler-media-container">
              <div className="landing-card-glow-wrap compiler-glow-wrap">
                <img
                  src="/compiler.png"
                  alt="Multi-Language Cloud Code Editor"
                  className="landing-feature-img compiler-feature-img"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/compiler .png';
                  }}
                />
              </div>
            </div>

            {/* Text & Languages side: comes from right */}
            <div className="scroll-reveal anim-slide-in-right landing-feature-text">
              <h2 className="landing-feature-title">Code Editor</h2>
              <p className="landing-feature-description">
                Experience zero-setup coding directly inside your web browser. A lightning-fast,
                responsive compiler equipped with intelligent error diagnostics, customizable test cases,
                and seamless execution across modern programming languages.
              </p>

              {/* 3 language names and logos sliding up together */}
              <div className="scroll-reveal anim-slide-in-up languages-showcase-box">
                <span className="languages-label">Supported Core Languages</span>
                <div className="languages-grid">
                  <div className="language-pill">
                    <div className="lang-icon-wrap">
                      <img src="/c_logo_white.png" alt="C Language Logo" className="lang-logo" />
                    </div>
                    <span className="lang-name">C</span>
                  </div>

                  <div className="language-pill">
                    <div className="lang-icon-wrap">
                      <img src="/cpp_logo_white.png" alt="C++ Language Logo" className="lang-logo" />
                    </div>
                    <span className="lang-name">C++</span>
                  </div>

                  <div className="language-pill">
                    <div className="lang-icon-wrap">
                      <img src="/python_logo_white.png" alt="Python Language Logo" className="lang-logo" />
                    </div>
                    <span className="lang-name">Python</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            FEATURE 3: STREAK COUNTER
            - Image (streak.png) and text (Streak Counter) come from opposite sides
            - Graph image (graph.png) shows performance metrics
           ========================================================================= */}
        <section className="landing-feature-section" id="feature-streak">
          <div className="landing-feature-grid">
            {/* Text side: comes from left */}
            <div className="scroll-reveal anim-slide-in-left landing-feature-text">
              <h2 className="landing-feature-title">Streak Counter</h2>
              <p className="landing-feature-description">
                Transform sporadic practice into an unbreakable daily habit. Every daily problem solved
                ignites your streak counter, giving you visual feedback and cognitive momentum to achieve
                long-term muscle memory.
              </p>

              {/* Streak Icon and Callout Card */}
              <div className="streak-callout-card">
                <div className="streak-icon-wrap">
                  <img src="/streak.png" alt="Daily Streak Fire Icon" className="streak-badge-img" />
                </div>
                <div className="streak-card-info">
                  <span className="streak-card-tag">Daily Consistency Metric</span>
                  <p className="streak-card-quote">"1 Code Daily = Lifelong Retention"</p>
                </div>
              </div>
            </div>

            {/* Graph side: comes from right */}
            <div className="scroll-reveal anim-slide-in-right landing-feature-media">
              <div className="landing-card-glow-wrap graph-media-wrap">
                <img
                  src="/graph.png"
                  alt="Streak Analytics and Performance Graph"
                  className="landing-feature-img graph-img"
                />
                <div className="graph-caption">
                  <span className="caption-dot" />
                  <span>Real-time retention curves & momentum tracker</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            ENDING SECTION
            - Image: combine.png
            - Final Call To Action Banner
           ========================================================================= */}
        <section className="landing-ending-section">
          <div className="scroll-reveal anim-fade-in-up ending-content-wrapper">
            <h2 className="ending-title">
              Master Coding with <span className="highlight-text">CodeLife</span>
            </h2>
            <p className="ending-subtitle">
              All your coding tools unified in one seamless, distraction-free environment.
            </p>

            {/* End Combine Image */}
            <div className="ending-media-container">
              <div className="landing-card-glow-wrap combine-frame">
                <img
                  src="/combine.png"
                  alt="CodeLife Ecosystem Combined View"
                  className="ending-combine-img"
                />
              </div>
            </div>

            {/* Final CTA Bar */}
            <div className="ending-cta-box">
              <h3 className="cta-box-title">
                {isLoggedIn ? 'Continue building your daily practice' : 'Ready to build your long-term coding habit?'}
              </h3>
              <p className="cta-box-text">
                {isLoggedIn ? 'Jump back into your problems and keep your streak burning.' : 'Start your first daily challenge today — completely free.'}
              </p>
              <button
                type="button"
                className="landing-cta-btn landing-cta-btn-large"
                onClick={isLoggedIn ? () => (onNavigate ? onNavigate('dashboard') : onGetStarted()) : onGetStarted}
              >
                <span>{isLoggedIn ? 'Go to Dashboard' : 'Get started for free'}</span>
                <svg className="landing-btn-arrow" viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-left">
            <span className="footer-brand">CodeLife</span>
            <span className="footer-copyright">© {CURRENT_YEAR} CodeLife. All rights reserved.</span>
          </div>
          <div className="footer-links">
            <button type="button" onClick={() => setActiveModal('about')}>About us</button>
            <span className="footer-bullet">•</span>
            <button type="button" onClick={() => setActiveModal('privacy')}>Privacy Policy</button>
            <span className="footer-bullet">•</span>
            <button type="button" onClick={() => setActiveModal('contact')}>Contact Us</button>
          </div>
        </div>
      </footer>

      {/* =========================================================================
          MODALS: Contact Us | Privacy Policy | About Us
         ========================================================================= */}
      {activeModal && (
        <div className="landing-modal-overlay" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true">
          <div className="landing-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setActiveModal(null)}
              aria-label="Close dialog"
            >
              ✕
            </button>

            {activeModal === 'contact' && (
              <div className="modal-content">
                <div className="modal-icon-badge">✉️</div>
                <h3 className="modal-title">Contact Us</h3>
                <p className="modal-body-text">
                  Have questions, suggestions, or need support? Reach out directly to our team:
                </p>
                <div className="contact-details-box">
                  <div className="contact-row">
                    <span className="contact-label">Email Support:</span>
                    <a href="mailto:support@codelife.dev" className="contact-val">support@codelife.dev</a>
                  </div>
                  <div className="contact-row">
                    <span className="contact-label">Feedback:</span>
                    <a href="mailto:feedback@codelife.dev" className="contact-val">feedback@codelife.dev</a>
                  </div>
                  <div className="contact-row">
                    <span className="contact-label">Community:</span>
                    <span className="contact-val">CodeLife Developer Community Hub</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="modal-primary-btn"
                  onClick={() => setActiveModal(null)}
                >
                  Close
                </button>
              </div>
            )}

            {activeModal === 'privacy' && (
              <div className="modal-content">
                <div className="modal-icon-badge">🔒</div>
                <h3 className="modal-title">Privacy Policy</h3>
                <div className="modal-scrollable-body">
                  <p><strong>1. Data Encryption & Storage:</strong> CodeLife protects user credentials and submission history with industry-standard encryption protocols. Your code solutions and personal problem sets remain strictly confidential.</p>
                  <p><strong>2. Account Information:</strong> We collect only necessary identifiers (username and email address) for authentication, account recovery, and streak persistence.</p>
                  <p><strong>3. Zero Third-Party Selling:</strong> We do not sell, rent, or monetize your personal information or programming code to third parties.</p>
                  <p><strong>4. Browser Storage:</strong> Local preferences and active editor sessions are preserved in your local browser cache for immediate responsiveness.</p>
                </div>
                <button
                  type="button"
                  className="modal-primary-btn"
                  onClick={() => setActiveModal(null)}
                >
                  Understood
                </button>
              </div>
            )}

            {activeModal === 'about' && (
              <div className="modal-content">
                <div className="modal-icon-badge">💡</div>
                <h3 className="modal-title">About CodeLife</h3>
                <div className="modal-scrollable-body">
                  <p>
                    <strong>CodeLife</strong> was built with a singular mission: to make daily coding practice an
                    effortless, habit-forming experience for students and aspiring software engineers.
                  </p>
                  <p>
                    By uniting a curated <em>Code Store</em>, an instant multi-language <em>Code Editor</em> (C, C++, Python),
                    and an inspiring <em>Streak Counter</em>, CodeLife bridges the gap between passive learning and
                    active muscle memory retention.
                  </p>
                  <p>
                    <strong>"1 Code Daily = Lifelong Retention"</strong> — Commit to just one challenge every day,
                    and watch your problem-solving intuition compound exponentially.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-primary-btn"
                  onClick={() => {
                    setActiveModal(null);
                    if (isLoggedIn) {
                      if (onNavigate) {
                        onNavigate('dashboard');
                      } else {
                        onGetStarted();
                      }
                    } else {
                      onGetStarted();
                    }
                  }}
                >
                  {isLoggedIn ? 'Go to Dashboard' : 'Get Started For Free'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
