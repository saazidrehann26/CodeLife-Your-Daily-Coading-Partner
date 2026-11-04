import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  getUserCircles,
  getPendingCircleInvites,
  respondCircleInvite,
  createCircle,
  searchUsers,
  getCircleMatchHistory,
} from '../services/groupChallengeService';
import PublicProfileModal from './PublicProfileModal';
import './GroupChallengePage.css';

export default function GroupChallengePage({
  currentUser,
  onNavigate,
  onSignOut,
}) {
  // Circles & Invites
  const [circles, setCircles] = useState(() => (currentUser?.username ? getUserCircles(currentUser.username) : []));
  const [pendingInvites, setPendingInvites] = useState(() => (currentUser?.username ? getPendingCircleInvites(currentUser.username) : []));
  const [matchHistory, setMatchHistory] = useState(() => getCircleMatchHistory());

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [joinModalError, setJoinModalError] = useState(null);

  // Member search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceTimerRef = useRef(null);

  // Selected member profile modal
  const [viewingProfileUsername, setViewingProfileUsername] = useState(null);

  // Notification dot: has pending invites or live matches
  const hasNotifications = useMemo(() => {
    if (pendingInvites.length > 0) return true;
    return circles.some((c) => c.status === 'Match live');
  }, [pendingInvites, circles]);

  // Load updated circle data when user changes
  useEffect(() => {
    if (currentUser?.username) {
      Promise.resolve().then(() => {
        setCircles(getUserCircles(currentUser.username));
        setPendingInvites(getPendingCircleInvites(currentUser.username));
        setMatchHistory(getCircleMatchHistory());
      });
    }
  }, [currentUser?.username]);

  // Debounced search effect (~300ms, min 2 chars)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      debounceTimerRef.current = setTimeout(() => {
        setSearchResults([]);
        setSearchTotal(0);
        setSearchHasMore(false);
        setSearchError(null);
        setSearchLoading(false);
      }, 0);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      const res = await searchUsers(trimmed, 0, 10, currentUser?.username);
      if (res.rateLimited) {
        setSearchError(res.error || 'Rate limit exceeded. Please wait a moment.');
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

  // Load more search results pagination
  const handleLoadMoreSearch = async () => {
    if (searchLoading || !searchHasMore) return;
    const nextOffset = searchOffset + 10;
    setSearchLoading(true);

    const res = await searchUsers(searchQuery.trim(), nextOffset, 10, currentUser?.username);
    if (!res.rateLimited && res.results) {
      setSearchResults((prev) => [...prev, ...res.results]);
      setSearchOffset(nextOffset);
      setSearchHasMore(Boolean(res.hasMore));
    }
    setSearchLoading(false);
  };

  // Accept or decline invitation
  const handleRespondInvite = (inviteId, accept) => {
    if (!currentUser?.username) return;
    respondCircleInvite(currentUser.username, inviteId, accept);
    setPendingInvites(getPendingCircleInvites(currentUser.username));
    setCircles(getUserCircles(currentUser.username));
  };

  // Create circle handler
  const handleCreateCircleSubmit = (e) => {
    e.preventDefault();
    if (!newCircleName.trim() || !currentUser?.username) return;
    const created = createCircle(currentUser.username, newCircleName.trim());
    if (created) {
      setCircles(getUserCircles(currentUser.username));
      setNewCircleName('');
      setShowCreateModal(false);
    }
  };

  // Join circle by code handler
  const handleJoinByCodeSubmit = (e) => {
    e.preventDefault();
    const cleanCode = joinInviteCode.trim().toUpperCase();
    if (!cleanCode) return;

    // Check circles across users
    const allUserCircles = circles;
    const found = allUserCircles.find((c) => c.inviteCode === cleanCode);
    if (found) {
      setJoinModalError('You are already a member of this circle.');
      return;
    }

    setJoinModalError('Invalid or expired circle invite code.');
  };

  return (
    <div className="gc-wrapper">
      {/* =====================================================================
          1. TOP NAVIGATION BAR
          ===================================================================== */}
      <header className="gc-navbar">
        <div
          className="gc-brand-wrap"
          onClick={() => (onNavigate ? onNavigate('landing') : null)}
          title="Return to Home / Intro Page"
        >
          <div className="gc-brand-logo-frame">
            <img
              src="/codelife_logo_white_bg.png"
              alt="CodeLife Logo"
              className="gc-brand-logo-img"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/company_logo_clean.png';
              }}
            />
          </div>
          <span className="gc-brand-title">CodeLife</span>
        </div>

        <nav className="gc-nav-links" aria-label="Group Challenge Navigation">
          <button
            type="button"
            className="gc-nav-btn"
            onClick={() => (onNavigate ? onNavigate('dashboard') : null)}
            title="Go to Personal Practice Dashboard"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Dashboard</span>
          </button>

          {/* Group Challenge Button (Active State Highlight) */}
          <button
            type="button"
            className="gc-nav-btn active"
            title="Group Challenge is currently active"
          >
            {hasNotifications && <span className="gc-nav-badge-dot" />}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Group Challenge</span>
          </button>

          {currentUser ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="gc-nav-btn"
                onClick={() => setViewingProfileUsername(currentUser.username)}
                title="View your public profile & settings"
              >
                <span>@{currentUser.username}</span>
              </button>
              {onSignOut && (
                <button
                  type="button"
                  className="gc-nav-btn"
                  onClick={onSignOut}
                  title="Sign out of current account"
                >
                  Sign Out
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="gc-nav-btn"
              onClick={() => (onNavigate ? onNavigate('signin') : null)}
            >
              Sign In
            </button>
          )}
        </nav>
      </header>

      {/* =====================================================================
          2. MAIN CONTENT
          ===================================================================== */}
      <main className="gc-container">
        {/* Hero Banner */}
        <section className="gc-glass-card gc-hero-banner">
          <div className="gc-hero-text-col">
            <span className="gc-hero-tag">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Friend Circle Team Battle
            </span>
            <h1 className="gc-hero-title">Group Challenge</h1>
            <p className="gc-hero-subtitle">
              Assemble your private circle of friends. Form two teams (Team A vs Team B), pick your team captains, and compete in real-time to solve problems.
            </p>
          </div>

          <div className="gc-hero-actions-row">
            <button
              type="button"
              className="spherical-btn spherical-btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create a Circle</span>
            </button>

            <button
              type="button"
              className="spherical-btn"
              onClick={() => setShowJoinModal(true)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>Join with Invite Code</span>
            </button>
          </div>
        </section>

        {/* Pending Invites Banner */}
        {pendingInvites.length > 0 && (
          <section className="gc-glass-card gc-invites-banner">
            <div className="gc-invites-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#e6c4b4" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span>Pending Circle Invitations ({pendingInvites.length})</span>
            </div>

            <div className="gc-invites-list">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="gc-invite-item-card">
                  <div className="gc-invite-meta">
                    <span className="gc-invite-circle-name">{inv.circleName}</span>
                    <span className="gc-invite-inviter">Invited by @{inv.inviterUsername}</span>
                  </div>

                  <div className="gc-invite-actions">
                    <button
                      type="button"
                      className="gc-invite-btn-accept"
                      onClick={() => handleRespondInvite(inv.id, true)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="gc-invite-btn-decline"
                      onClick={() => handleRespondInvite(inv.id, false)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section: Your Circles */}
        <section className="gc-glass-card">
          <div className="gc-section-header">
            <h2 className="gc-heading">
              <span className="gc-heading-dot" />
              Your Friend Circles
            </h2>
            <span style={{ fontSize: '13px', color: '#e6c4b4', fontWeight: 600 }}>
              {circles.length} Active {circles.length === 1 ? 'Circle' : 'Circles'}
            </span>
          </div>

          {circles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'rgba(255, 255, 255, 0.75)' }}>
              <p style={{ fontSize: '15px', marginBottom: '14px' }}>
                You have not joined or created any friend circles yet.
              </p>
              <button
                type="button"
                className="spherical-btn spherical-btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                + Create Your First Circle
              </button>
            </div>
          ) : (
            <div className="gc-circles-grid">
              {circles.map((c) => {
                const badgeClass =
                  c.status === 'Match live'
                    ? 'gc-badge-live'
                    : c.status === 'Lobby open'
                    ? 'gc-badge-lobby'
                    : 'gc-badge-idle';

                return (
                  <div key={c.id} className="gc-circle-card">
                    <div className="gc-circle-card-top">
                      <div>
                        <h3 className="gc-circle-name">{c.name}</h3>
                        <span className="gc-circle-meta-text">
                          {c.members?.length || 1} members • Admin @{c.adminUsername}
                        </span>
                      </div>
                      <span className={`gc-status-badge ${badgeClass}`}>{c.status}</span>
                    </div>

                    <div className="gc-circle-footer">
                      <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                        Code: <strong>{c.inviteCode || 'CODE'}</strong>
                      </span>
                      <button
                        type="button"
                        className="spherical-btn spherical-btn-sm"
                        onClick={() => alert(`Opening Circle: ${c.name}. Ready for Stage 2 circle management.`)}
                      >
                        Enter Circle
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section: Member Search */}
        <section className="gc-glass-card gc-search-panel">
          <div className="gc-section-header">
            <h2 className="gc-heading">
              <span className="gc-heading-dot" />
              Find Members & View Public Profiles
            </h2>
          </div>

          <div className="gc-search-bar-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="gc-search-icon">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              type="text"
              className="gc-search-input"
              placeholder="Search users by username or name (minimum 2 characters)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {searchQuery && (
              <button
                type="button"
                className="gc-search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          {searchError && (
            <div style={{ color: '#ff8a80', fontSize: '13px', fontWeight: 600 }}>
              {searchError}
            </div>
          )}

          {searchLoading && (
            <div style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.7)' }}>
              Searching members...
            </div>
          )}

          {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && !searchError && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255, 255, 255, 0.65)' }}>
              No users found matching "{searchQuery}".
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="gc-search-results-grid">
              {searchResults.map((user) => (
                <div
                  key={user.username}
                  className="gc-user-card"
                  onClick={() => setViewingProfileUsername(user.username)}
                  title={`View public profile of @${user.username}`}
                >
                  <div className="gc-user-card-info">
                    <img
                      src={user.photoUrl}
                      alt={user.name}
                      className="gc-user-card-avatar"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/codelife_logo_white_bg.png';
                      }}
                    />
                    <div className="gc-user-card-texts">
                      <span className="gc-user-card-name">{user.name}</span>
                      <span className="gc-user-card-username">@{user.username}</span>
                      <span className="gc-user-card-institution">{user.institution}</span>
                    </div>
                  </div>

                  <span className="gc-user-card-view-btn">View Profile</span>
                </div>
              ))}
            </div>
          )}

          {searchHasMore && !searchLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
              <button
                type="button"
                className="spherical-btn"
                onClick={handleLoadMoreSearch}
              >
                Load More Results ({searchTotal - searchResults.length} remaining)
              </button>
            </div>
          )}
        </section>

        {/* Section: Recent Match History */}
        <section className="gc-glass-card">
          <div className="gc-section-header">
            <h2 className="gc-heading">
              <span className="gc-heading-dot" />
              Recent Team Match History
            </h2>
          </div>

          {matchHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'rgba(255, 255, 255, 0.7)' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>
                No team matches recorded yet. Match history, win/loss stats, and MVP records will appear here after your first battle.
              </p>
            </div>
          ) : (
            <div className="gc-history-grid">
              {matchHistory.map((m) => (
                <div key={m.id} className="gc-history-row">
                  <div>
                    <strong style={{ fontSize: '15px' }}>{m.circleName}</strong>
                    <div style={{ fontSize: '12px', color: '#e6c4b4' }}>
                      {m.teamAName} ({m.teamASize} players) vs {m.teamBName} ({m.teamBSize} players)
                    </div>
                  </div>
                  <span className={`gc-history-result-badge ${m.won ? 'gc-history-win' : 'gc-history-loss'}`}>
                    {m.won ? 'Victory' : 'Defeat'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* =====================================================================
          3. MODALS
          ===================================================================== */}
      {/* Create Circle Modal */}
      {showCreateModal && (
        <div className="dash-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="dash-modal-window" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">Create a Friend Circle</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCircleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="modal-form-group">
                <label className="modal-label">Circle Name</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Code Warriors, Algorithm Squad"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="spherical-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="spherical-btn spherical-btn-primary"
                  disabled={!newCircleName.trim()}
                >
                  Create Circle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join with Invite Code Modal */}
      {showJoinModal && (
        <div className="dash-modal-backdrop" onClick={() => setShowJoinModal(false)}>
          <div className="dash-modal-window" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">Join with Invite Code</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowJoinModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleJoinByCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="modal-form-group">
                <label className="modal-label">Enter 6-Character Circle Code</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. A9B2X7"
                  value={joinInviteCode}
                  onChange={(e) => {
                    setJoinInviteCode(e.target.value);
                    setJoinModalError(null);
                  }}
                  maxLength={10}
                  required
                  autoFocus
                  style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}
                />
              </div>

              {joinModalError && (
                <div style={{ color: '#ff8a80', fontSize: '13px', fontWeight: 600 }}>
                  {joinModalError}
                </div>
              )}

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="spherical-btn"
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="spherical-btn spherical-btn-primary"
                  disabled={!joinInviteCode.trim()}
                >
                  Join Circle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Public Profile Modal */}
      {viewingProfileUsername && (
        <PublicProfileModal
          username={viewingProfileUsername}
          currentUser={currentUser}
          onClose={() => setViewingProfileUsername(null)}
          onInviteSent={() => {
            // Refresh pending states
            if (currentUser?.username) {
              setPendingInvites(getPendingCircleInvites(currentUser.username));
            }
          }}
        />
      )}
    </div>
  );
}
