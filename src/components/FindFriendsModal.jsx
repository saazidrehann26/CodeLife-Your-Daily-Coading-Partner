import React, { useState, useEffect, useRef } from 'react';
import { searchUsers } from '../services/groupChallengeService';
import PublicProfileModal from './PublicProfileModal';
import './FindFriendsModal.css';

export default function FindFriendsModal({
  currentUser,
  onClose,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [viewingProfileUsername, setViewingProfileUsername] = useState(null);
  const debounceTimerRef = useRef(null);

  // Debounced live user search
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      debounceTimerRef.current = setTimeout(() => {
        setSearchResults([]);
        setSearchTotal(0);
        setSearchHasMore(false);
        setSearchLoading(false);
      }, 0);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      const res = await searchUsers(trimmed, 0, 10, currentUser?.username);
      if (res.rateLimited) {
        setSearchError(res.error || 'Search rate limit exceeded. Please wait a moment.');
        setSearchResults([]);
      } else {
        setSearchResults(res.results || []);
        setSearchTotal(res.total || 0);
        setSearchOffset(0);
        setSearchHasMore(Boolean(res.hasMore));
      }
      setSearchLoading(false);
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchQuery, currentUser?.username]);

  const handleLoadMoreSearch = async () => {
    if (searchLoading || !searchHasMore) return;
    const nextOffset = searchOffset + 10;
    setSearchLoading(true);
    const res = await searchUsers(searchQuery.trim(), nextOffset, 10, currentUser?.username);
    if (!res.rateLimited) {
      setSearchResults((prev) => [...prev, ...(res.results || [])]);
      setSearchOffset(nextOffset);
      setSearchHasMore(Boolean(res.hasMore));
    }
    setSearchLoading(false);
  };

  return (
    <>
      <div className="dash-modal-backdrop" onClick={onClose}>
        <div
          className="dash-modal-window find-friends-window"
          style={{ maxWidth: '640px', width: '92%' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header-row">
            <div>
              <h2 className="modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Find Your Friend
              </h2>
              <span style={{ fontSize: '13px', color: '#e6c4b4', marginTop: '3px', display: 'block' }}>
                Search coders across CodeLife & view their public profiles
              </span>
            </div>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Search Bar Wrap */}
          <div className="ff-search-bar-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="ff-search-icon">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              type="text"
              className="ff-search-input"
              placeholder="Search by username or name (minimum 2 characters)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />

            {searchQuery && (
              <button
                type="button"
                className="ff-search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Messages */}
          {searchError && (
            <div style={{ color: '#ff8a80', fontSize: '13px', fontWeight: 600, background: 'rgba(244, 67, 54, 0.15)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
              {searchError}
            </div>
          )}

          {searchLoading && (
            <div style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', padding: '14px 0' }}>
              🔍 Searching members across CodeLife...
            </div>
          )}

          {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && !searchError && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255, 255, 255, 0.65)' }}>
              <p style={{ margin: 0, fontSize: '15px' }}>No users found matching &quot;{searchQuery}&quot;.</p>
              <span style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px', display: 'block' }}>
                Make sure you typed the correct username or name.
              </span>
            </div>
          )}

          {!searchQuery.trim() && (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'rgba(255, 255, 255, 0.6)' }}>
              <p style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#ffffff', fontWeight: 600 }}>
                Looking for your friends?
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)' }}>
                Type at least 2 characters in the search bar above to discover fellow developers, check their stats, and view their profiles!
              </p>
            </div>
          )}

          {/* Results Grid */}
          {searchResults.length > 0 && (
            <div className="ff-search-results-grid">
              {searchResults.map((user) => (
                <div
                  key={user.username}
                  className="ff-user-card"
                  onClick={() => setViewingProfileUsername(user.username)}
                  title={`View public profile of @${user.username}`}
                >
                  <div className="ff-user-card-info">
                    <img
                      src={user.photoUrl}
                      alt={user.name}
                      className="ff-user-card-avatar"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/codelife_logo_white_bg.png';
                      }}
                    />
                    <div className="ff-user-card-texts">
                      <span className="ff-user-card-name">{user.name}</span>
                      <span className="ff-user-card-username">@{user.username}</span>
                      {user.institution && (
                        <span className="ff-user-card-institution">{user.institution}</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="spherical-btn spherical-btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingProfileUsername(user.username);
                    }}
                  >
                    View Profile
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchHasMore && !searchLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px' }}>
              <button
                type="button"
                className="spherical-btn"
                onClick={handleLoadMoreSearch}
              >
                Load More Results ({searchTotal - searchResults.length} remaining)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Public Profile Modal when a friend is clicked */}
      {viewingProfileUsername && (
        <PublicProfileModal
          username={viewingProfileUsername}
          currentUser={currentUser}
          onClose={() => setViewingProfileUsername(null)}
        />
      )}
    </>
  );
}
