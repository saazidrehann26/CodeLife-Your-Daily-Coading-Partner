import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import './Waitlist.css';

/**
 * Waitlist / Email Capture Form Component
 *
 * Requirements fulfilled:
 * - Direct Supabase integration using existing client at src/services/supabaseClient.js
 * - Inserts into table exactly: 'User Information'
 * - Target column: 'email'
 * - Uses supabase.from('User Information').insert([{ email: ... }])
 * - Controlled input with required validation
 * - State management: email string, status (idle, loading, success, error), and user feedback message
 * - Clean async request handling with event.preventDefault()
 * - Modern UI styled with Tailwind CSS utility classes and scoped fallback theme styles
 */
export default function Waitlist() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();

    // Basic client-side email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      // Execute the exact database insertion specified
      const { error } = await supabase
        .from('User Information')
        .insert([{ email: trimmedEmail }]);

      if (error) {
        // Handle common database errors (e.g., unique constraint violations)
        if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate')) {
          setStatus('error');
          setMessage('This email is already registered on our list!');
        } else {
          setStatus('error');
          setMessage(error.message || 'Failed to submit. Please try again.');
        }
      } else {
        setStatus('success');
        setMessage("You're on the list! We'll keep you updated on CodeLife.");
        setEmail(''); // Reset controlled input
      }
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto my-8 px-4 waitlist-wrapper">
      <div className="waitlist-card relative overflow-hidden rounded-3xl bg-[#231513]/90 border border-[#482c27] p-6 sm:p-8 shadow-2xl backdrop-blur-md transition-all hover:border-[#6a4038]">
        {/* Header & Badging */}
        <div className="waitlist-header text-center mb-6">
          <div className="waitlist-badge inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full bg-[#e28a75]/10 border border-[#e28a75]/30 text-[#e28a75] text-xs font-semibold tracking-wider uppercase">
            <span>✨</span>
            <span>Join the Community</span>
          </div>
          <h3 className="waitlist-title text-2xl sm:text-3xl font-bold text-[#fcf9f8] tracking-tight mb-2">
            Get Early Access & Updates
          </h3>
          <p className="waitlist-subtitle text-sm sm:text-base text-[#b79b94] max-w-md mx-auto">
            Stay in the loop with daily coding challenges, new language environments, and feature drops.
          </p>
        </div>

        {/* Email Capture Form */}
        <form onSubmit={handleSubmit} className="waitlist-form flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full" noValidate>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status !== 'idle') {
                setStatus('idle');
                setMessage('');
              }
            }}
            placeholder="Enter your email address..."
            disabled={status === 'loading'}
            className="waitlist-input flex-1 px-5 py-3 sm:py-3.5 rounded-full bg-[#351e1a] border border-[#5a3731] text-[#fcf9f8] placeholder-[#a68982] focus:outline-none focus:ring-2 focus:ring-[#e28a75] focus:border-transparent transition-all shadow-inner text-sm sm:text-base disabled:opacity-60"
            aria-label="Email address"
          />

          <button
            type="submit"
            disabled={status === 'loading' || !email.trim()}
            className="waitlist-btn inline-flex items-center justify-center gap-2 px-6 py-3 sm:py-3.5 rounded-full font-semibold text-[#180f0e] bg-gradient-to-r from-[#e28a75] to-[#f4ad9b] hover:from-[#e99884] hover:to-[#f8beae] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#e28a75]/25 cursor-pointer text-sm sm:text-base whitespace-nowrap"
          >
            {status === 'loading' ? (
              <>
                <span className="waitlist-spinner inline-block w-4 h-4 border-2 border-[#180f0e]/30 border-t-[#180f0e] rounded-full animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <span>Join Waitlist</span>
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </form>

        {/* Status Messages */}
        {status === 'success' && (
          <div className="waitlist-alert waitlist-alert-success flex items-center justify-center gap-2 p-3.5 mt-4 text-sm font-medium text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-2xl animate-fade-in" role="status">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{message}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="waitlist-alert waitlist-alert-error flex items-center justify-center gap-2 p-3.5 mt-4 text-sm font-medium text-[#f87171] bg-[#f87171]/10 border border-[#f87171]/30 rounded-2xl animate-fade-in" role="alert">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
