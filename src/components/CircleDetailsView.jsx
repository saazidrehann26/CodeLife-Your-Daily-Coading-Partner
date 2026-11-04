import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  getCircleById,
  removeMemberFromCircle,
  leaveCircle,
  deleteCircle,
  sendCircleInvite,
  getCirclePendingInvites,
  revokeCircleInvite,
  updateCircleName,
  searchUsers,
  buildPublicUserDTO,
  MIN_PLAYERS_PER_CIRCLE,
  DEFAULT_MAX_CIRCLE_MEMBERS,
} from '../services/groupChallengeService';
import { findUser } from '../services/dbService';
import PublicProfileModal from './PublicProfileModal';
import TeamFormationView from './TeamFormationView';
import './CircleDetailsView.css';

export default function CircleDetailsView({
  circleId,
  currentUser,
  onBack,
  onCircleDeleted,
}) {
  const [circle, setCircle] = useState(() => (circleId ? getCircleById(circleId) : null));
  const [loading, setLoading] = useState(() => !circle);
  const [pendingInvites, setPendingInvites] = useState(() => (circleId ? getCirclePendingInvites(circleId) : []));
  const [copiedCodeToast, setCopiedCodeToast] = useState(false);
  const [copiedLinkToast, setCopiedLinkToast] = useState(false);
  const [isFormingTeams, setIsFormingTeams] = useState(false);

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteModalTab, setInviteModalTab] = useState('username'); // 'username' | 'email' | 'share'
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState(null);

  const [memberToRemove, setMemberToRemove] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Member search state in invite modal
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);

  // Profile modal
  const [viewingProfileUsername, setViewingProfileUsername] = useState(null);

  // Track sent invites in this session for immediate UI feedback
  const [recentlyInvitedUsers, setRecentlyInvitedUsers] = useState(new Set());

  // Reload circle data
  const reloadCircle = useCallback(() => {
    if (!circleId) return;
    Promise.resolve().then(() => {
      const c = getCircleById(circleId);
      setCircle(c);
      setPendingInvites(getCirclePendingInvites(circleId));
      setLoading(false);
    });
  }, [circleId]);

  useEffect(() => {
    reloadCircle();
  }, [reloadCircle]);

  const isAdmin = useMemo(() => {
    if (!circle || !currentUser) return false;
    return (circle.adminUsername || '').toLowerCase() === currentUser.username?.toLowerCase();
  }, [circle, currentUser]);

  const isMember = useMemo(() => {
    if (!circle || !currentUser) return false;
    return circle.members?.some(
      (m) => (m.username || '').toLowerCase() === currentUser.username?.toLowerCase()
    );
  }, [circle, currentUser]);

  // Debounced member search in invite modal
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      debounceRef.current = setTimeout(() => {
        setSearchResults([]);
        setSearchHasMore(false);
        setSearchLoading(false);
      }, 0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      const res = await searchUsers(trimmed, 0, 10, currentUser?.username);
      if (res.rateLimited) {
        setSearchError(res.error || 'Search rate limit exceeded.');
        setSearchResults([]);
      } else {
        setSearchResults(res.results || []);
        setSearchOffset(0);
        setSearchHasMore(Boolean(res.hasMore));
      }
      setSearchLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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

  const handleCopyInviteCode = () => {
    if (!circle?.inviteCode) return;
    navigator.clipboard?.writeText(circle.inviteCode);
    setCopiedCodeToast(true);
    setTimeout(() => setCopiedCodeToast(false), 2400);
  };

  const handleCopyInviteLink = () => {
    if (!circle?.inviteCode) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/#group-challenge?join=${circle.inviteCode}`;
    navigator.clipboard?.writeText(link);
    setCopiedLinkToast(true);
    setTimeout(() => setCopiedLinkToast(false), 2400);
  };

  const handleSendInviteToUser = (targetUsername) => {
    if (!currentUser || !circle) return;
    const res = sendCircleInvite(currentUser.username, targetUsername, circle.id, circle.name);
    if (res.success) {
      setRecentlyInvitedUsers((prev) => new Set(prev).add(targetUsername.toLowerCase()));
      reloadCircle();
    } else {
      alert(res.error || 'Failed to send invite.');
    }
  };

  const handleRevokeInvite = (inviteId) => {
    if (!isAdmin) return;
    const res = revokeCircleInvite(currentUser.username, circle.id, inviteId);
    if (res.success) {
      reloadCircle();
    }
  };

  const handleRemoveMember = () => {
    if (!memberToRemove || !isAdmin) return;
    const res = removeMemberFromCircle(currentUser.username, circle.id, memberToRemove.username);
    if (res.success) {
      setMemberToRemove(null);
      reloadCircle();
    } else {
      alert(res.error || 'Failed to remove member.');
    }
  };

  const handleLeaveCircle = () => {
    if (!currentUser || !circle) return;
    const res = leaveCircle(currentUser.username, circle.id);
    if (res.success) {
      setShowLeaveModal(false);
      onBack?.();
    } else {
      alert(res.error || 'Failed to leave circle.');
    }
  };

  const handleDeleteCircle = () => {
    if (!isAdmin) return;
    const res = deleteCircle(currentUser.username, circle.id);
    if (res.success) {
      setShowDeleteModal(false);
      onCircleDeleted?.(circle.id);
      onBack?.();
    } else {
      alert(res.error || 'Failed to delete circle.');
    }
  };

  const handleRenameCircle = (e) => {
    e.preventDefault();
    if (!renameInput.trim() || !isAdmin) return;
    const res = updateCircleName(currentUser.username, circle.id, renameInput.trim());
    if (res.success) {
      setShowRenameModal(false);
      setRenameInput('');
      setRenameError(null);
      reloadCircle();
    } else {
      setRenameError(res.error || 'Failed to rename circle.');
    }
  };

  if (loading) {
    return (
      <div className="cd-loading-state">
        <div className="cd-spinner" />
        <p>Loading circle details...</p>
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="cd-not-found-card">
        <h2>Circle Not Found</h2>
        <p>The circle you are trying to view does not exist or may have been deleted.</p>
        <button type="button" className="spherical-btn" onClick={onBack}>
          ← Back to Circles
        </button>
      </div>
    );
  }

  // If in Team Formation Mode (Stage 3)
  if (isFormingTeams) {
    return (
      <TeamFormationView
        circle={circle}
        currentUser={currentUser}
        onBack={() => setIsFormingTeams(false)}
        onChallengeCreated={(challenge) => {
          setIsFormingTeams(false);
          reloadCircle();
          alert(`Challenge match lobby created for ${circle.name}! Teams formed: ${challenge.teams.teamA.name} vs ${challenge.teams.teamB.name}. Stage 3 complete!`);
        }}
      />
    );
  }

  const memberCount = circle.members?.length || 0;
  const maxCapacity = circle.maxMembers || DEFAULT_MAX_CIRCLE_MEMBERS;
  const hasMinPlayers = memberCount >= MIN_PLAYERS_PER_CIRCLE;
  const membersNeeded = Math.max(0, MIN_PLAYERS_PER_CIRCLE - memberCount);

  // Status badge styling
  const statusBadgeClass =
    circle.status === 'Match live'
      ? 'cd-badge-live'
      : circle.status === 'Lobby open'
      ? 'cd-badge-lobby'
      : 'cd-badge-idle';

  return (
    <div className="cd-view-wrapper">
      {/* Top Breadcrumb & Back Bar */}
      <div className="cd-top-bar">
        <button type="button" className="cd-back-btn" onClick={onBack} title="Return to circles list">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to Circles</span>
        </button>

        <div className="cd-status-wrap">
          <span className={`cd-status-pill ${statusBadgeClass}`}>
            <span className="cd-status-dot" />
            {circle.status}
          </span>
        </div>
      </div>

      {/* Main Circle Header Card */}
      <section className="cd-glass-card cd-header-card">
        <div className="cd-header-main">
          <div className="cd-title-group">
            <div className="cd-title-row">
              <h1 className="cd-circle-name">{circle.name}</h1>
              {isAdmin && (
                <button
                  type="button"
                  className="cd-rename-btn"
                  onClick={() => {
                    setRenameInput(circle.name);
                    setRenameError(null);
                    setShowRenameModal(true);
                  }}
                  title="Rename circle"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
            </div>

            <div className="cd-meta-row">
              <span className="cd-admin-tag">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#e6c4b4" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Admin: @{circle.adminUsername}
              </span>

              <span className="cd-created-tag">
                Created {new Date(circle.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>

              <span className="cd-capacity-tag">
                {memberCount} / {maxCapacity} Members
              </span>
            </div>
          </div>

          {/* Invite Code & Share Box */}
          <div className="cd-invite-box">
            <span className="cd-invite-box-label">Invite Code</span>
            <div className="cd-code-display-row">
              <span className="cd-invite-code-text">{circle.inviteCode}</span>
              <button
                type="button"
                className="cd-copy-btn"
                onClick={handleCopyInviteCode}
                title="Copy code to clipboard"
              >
                {copiedCodeToast ? 'Copied!' : 'Copy Code'}
              </button>
              <button
                type="button"
                className="cd-copy-btn"
                onClick={handleCopyInviteLink}
                title="Copy shareable link"
              >
                {copiedLinkToast ? 'Copied Link!' : 'Copy Link'}
              </button>
            </div>
          </div>
        </div>

        {/* Challenge Eligibility Readiness Banner */}
        <div className={`cd-readiness-banner ${hasMinPlayers ? 'is-ready' : 'needs-players'}`}>
          <div className="cd-readiness-icon-wrap">
            {hasMinPlayers ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#4ade80" strokeWidth="2.2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fbbf24" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>

          <div className="cd-readiness-content">
            <h4 className="cd-readiness-title">
              {hasMinPlayers
                ? `Challenge Ready (${memberCount} Accepted Players)`
                : `Need ${membersNeeded} more player${membersNeeded > 1 ? 's' : ''} to start a Challenge`}
            </h4>
            <p className="cd-readiness-desc">
              {hasMinPlayers
                ? 'Minimum 4 players reached (2 teams × 2 players). The circle admin can start a live team challenge anytime.'
                : 'Team Challenges require at least 4 accepted members (2 teams × minimum 2 players per team). Invite your friends to unlock challenges!'}
            </p>
          </div>

          <div className="cd-readiness-actions">
            {hasMinPlayers && isAdmin && (
              <button
                type="button"
                className="spherical-btn spherical-btn-primary"
                onClick={() => setIsFormingTeams(true)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Start Challenge</span>
              </button>
            )}

            <button
              type="button"
              className="spherical-btn"
              onClick={() => {
                setShowInviteModal(true);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>+ Invite Members</span>
            </button>
          </div>
        </div>

        {/* Circle Actions Row (Admin delete / Member leave) */}
        <div className="cd-actions-footer">
          <div className="cd-actions-left">
            <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)' }}>
              Capacity: <strong>{memberCount} / {maxCapacity}</strong> ({maxCapacity - memberCount} spots left)
            </span>
          </div>

          <div className="cd-actions-right">
            {isAdmin ? (
              <button
                type="button"
                className="spherical-btn spherical-btn-danger spherical-btn-sm"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete Circle
              </button>
            ) : isMember ? (
              <button
                type="button"
                className="spherical-btn spherical-btn-danger spherical-btn-sm"
                onClick={() => setShowLeaveModal(true)}
              >
                Leave Circle
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Circle Members Roster Section */}
      <section className="cd-glass-card cd-roster-section">
        <div className="cd-section-header">
          <h2 className="cd-section-title">
            <span className="cd-dot" />
            Circle Members ({memberCount})
          </h2>
          <span className="cd-section-sub">
            All players in this circle who can participate in team battles.
          </span>
        </div>

        <div className="cd-members-grid">
          {(circle.members || []).map((m) => {
            const rawUser = findUser(m.username);
            const dto = buildPublicUserDTO(rawUser || { username: m.username }, currentUser?.username);
            const memberIsAdmin = (m.role === 'admin') || (m.username || '').toLowerCase() === (circle.adminUsername || '').toLowerCase();

            return (
              <div key={m.username} className="cd-member-card">
                <div className="cd-member-avatar-wrap">
                  <img
                    src={dto?.photoUrl || '/favicon_brand.png'}
                    alt={dto?.name || m.username}
                    className="cd-member-avatar"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/favicon_brand.png';
                    }}
                  />
                  {memberIsAdmin && (
                    <span className="cd-member-admin-crown" title="Circle Admin">
                      👑
                    </span>
                  )}
                </div>

                <div className="cd-member-info">
                  <div className="cd-member-name-row">
                    <h3 className="cd-member-name">{dto?.name || m.username}</h3>
                    <span className={`cd-role-badge ${memberIsAdmin ? 'is-admin' : 'is-member'}`}>
                      {memberIsAdmin ? 'Admin' : 'Member'}
                    </span>
                  </div>
                  <span className="cd-member-handle">@{m.username}</span>

                  <div className="cd-member-stats-row">
                    <span className="cd-member-stat">
                      <strong>{dto?.totalProblemsSolved !== null ? dto?.totalProblemsSolved : '—'}</strong> solved
                    </span>
                    <span className="cd-member-stat-divider">•</span>
                    <span className="cd-member-stat">
                      <strong>{dto?.currentStreak !== null ? `${dto?.currentStreak}d` : '—'}</strong> streak
                    </span>
                  </div>
                </div>

                <div className="cd-member-actions">
                  <button
                    type="button"
                    className="spherical-btn spherical-btn-sm"
                    onClick={() => setViewingProfileUsername(m.username)}
                    title="View public profile"
                  >
                    Profile
                  </button>

                  {isAdmin && !memberIsAdmin && (
                    <button
                      type="button"
                      className="cd-member-remove-btn"
                      onClick={() => setMemberToRemove(m)}
                      title={`Remove @${m.username} from circle`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pending Outgoing Invitations Section */}
      {pendingInvites.length > 0 && (
        <section className="cd-glass-card cd-pending-invites-section">
          <div className="cd-section-header">
            <h2 className="cd-section-title">
              <span className="cd-dot" />
              Pending Invitations ({pendingInvites.length})
            </h2>
            <span className="cd-section-sub">
              Invitations awaiting acceptance by friends.
            </span>
          </div>

          <div className="cd-pending-list">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="cd-pending-item">
                <div className="cd-pending-meta">
                  <span className="cd-pending-user">@{inv.targetUsername}</span>
                  <span className="cd-pending-date">
                    Invited {new Date(inv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="cd-pending-badge">Pending</span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    className="cd-pending-revoke-btn"
                    onClick={() => handleRevokeInvite(inv.id)}
                    title="Revoke / Cancel invitation"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =====================================================================
          MODAL 1: INVITE MEMBERS (Tabs: Search Username, Email, Share Code)
          ===================================================================== */}
      {showInviteModal && (
        <div className="cd-modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="cd-modal-content cd-invite-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-header">
              <h2 className="cd-modal-title">Invite Members to {circle.name}</h2>
              <button
                type="button"
                className="cd-modal-close"
                onClick={() => setShowInviteModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="cd-tabs-nav">
              <button
                type="button"
                className={`cd-tab-btn ${inviteModalTab === 'username' ? 'active' : ''}`}
                onClick={() => setInviteModalTab('username')}
              >
                Find by Username
              </button>
              <button
                type="button"
                className={`cd-tab-btn ${inviteModalTab === 'share' ? 'active' : ''}`}
                onClick={() => setInviteModalTab('share')}
              >
                Share Code & Link
              </button>
            </div>

            {/* Tab 1: Username Search */}
            {inviteModalTab === 'username' && (
              <div className="cd-tab-content">
                <div className="cd-search-input-wrap">
                  <input
                    type="text"
                    className="cd-search-input"
                    placeholder="Search by username or full name (min 2 chars)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searchLoading && <div className="cd-search-spinner" />}
                </div>

                {searchError && <p className="cd-error-text">{searchError}</p>}

                <div className="cd-search-results-list">
                  {searchResults.map((user) => {
                    const isAlreadyMember = circle.members?.some(
                      (m) => (m.username || '').toLowerCase() === user.username.toLowerCase()
                    );
                    const isPending =
                      pendingInvites.some(
                        (inv) => (inv.targetUsername || '').toLowerCase() === user.username.toLowerCase()
                      ) || recentlyInvitedUsers.has(user.username.toLowerCase());
                    const optedOut = user.allowStrangerInvites === false;

                    return (
                      <div key={user.username} className="cd-search-user-item">
                        <div className="cd-search-user-info">
                          <img
                            src={user.photoUrl || '/favicon_brand.png'}
                            alt={user.username}
                            className="cd-search-avatar"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = '/favicon_brand.png';
                            }}
                          />
                          <div>
                            <span className="cd-search-fullname">{user.name}</span>
                            <span className="cd-search-handle">@{user.username}</span>
                          </div>
                        </div>

                        <div>
                          {isAlreadyMember ? (
                            <span className="cd-status-tag">Member</span>
                          ) : isPending ? (
                            <span className="cd-status-tag is-pending">Invite Sent</span>
                          ) : optedOut ? (
                            <span className="cd-status-tag is-opted-out" title="User opted out of invites from strangers">
                              Opted Out
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="spherical-btn spherical-btn-sm"
                              onClick={() => handleSendInviteToUser(user.username)}
                            >
                              + Invite
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {searchQuery.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
                    <p className="cd-empty-search">No users found matching &quot;{searchQuery}&quot;.</p>
                  )}

                  {searchHasMore && !searchLoading && (
                    <div style={{ textAlign: 'center', marginTop: '12px' }}>
                      <button
                        type="button"
                        className="spherical-btn spherical-btn-sm"
                        onClick={handleLoadMoreSearch}
                      >
                        Load More
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Email Invite */}
            {/* Tab 2: Share Code & Link */}
            {inviteModalTab === 'share' && (
              <div className="cd-tab-content">
                <p className="cd-tab-desc">
                  Share this 6-character code or direct invite link with your friends in group chats or Discord.
                </p>

                <div className="cd-share-code-card">
                  <span className="cd-share-label">Invite Code</span>
                  <div className="cd-share-code-display">{circle.inviteCode}</div>
                  <button
                    type="button"
                    className="spherical-btn"
                    onClick={handleCopyInviteCode}
                  >
                    {copiedCodeToast ? 'Copied Code!' : 'Copy Invite Code'}
                  </button>
                </div>

                <div className="cd-share-link-card">
                  <span className="cd-share-label">Direct Invite Link</span>
                  <input
                    type="text"
                    readOnly
                    className="cd-link-input"
                    value={typeof window !== 'undefined' ? `${window.location.origin}/#group-challenge?join=${circle.inviteCode}` : ''}
                  />
                  <button
                    type="button"
                    className="spherical-btn"
                    onClick={handleCopyInviteLink}
                  >
                    {copiedLinkToast ? 'Copied Link!' : 'Copy Direct Link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: RENAME CIRCLE (Admin only)
          ===================================================================== */}
      {showRenameModal && (
        <div className="cd-modal-overlay" onClick={() => setShowRenameModal(false)}>
          <div className="cd-modal-content cd-rename-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-header">
              <h2 className="cd-modal-title">Rename Circle</h2>
              <button type="button" className="cd-modal-close" onClick={() => setShowRenameModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleRenameCircle}>
              <div className="cd-form-group">
                <label htmlFor="circle-name-input" className="cd-label">New Circle Name</label>
                <input
                  id="circle-name-input"
                  type="text"
                  className="cd-input"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>

              {renameError && <p className="cd-error-text">{renameError}</p>}

              <div className="cd-modal-footer">
                <button
                  type="button"
                  className="spherical-btn"
                  onClick={() => setShowRenameModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="spherical-btn spherical-btn-primary">
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: REMOVE MEMBER CONFIRMATION (Admin only)
          ===================================================================== */}
      {memberToRemove && (
        <div className="cd-modal-overlay" onClick={() => setMemberToRemove(null)}>
          <div className="cd-modal-content cd-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="cd-modal-title">Remove Member</h2>
            <p className="cd-modal-body-text">
              Are you sure you want to remove <strong>@{memberToRemove.username}</strong> from <strong>{circle.name}</strong>?
            </p>
            <div className="cd-modal-footer">
              <button type="button" className="spherical-btn" onClick={() => setMemberToRemove(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="spherical-btn spherical-btn-danger"
                onClick={handleRemoveMember}
              >
                Yes, Remove Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: LEAVE CIRCLE CONFIRMATION (Member only)
          ===================================================================== */}
      {showLeaveModal && (
        <div className="cd-modal-overlay" onClick={() => setShowLeaveModal(false)}>
          <div className="cd-modal-content cd-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="cd-modal-title">Leave Circle</h2>
            <p className="cd-modal-body-text">
              Are you sure you want to leave <strong>{circle.name}</strong>? You will need an invite or invite code to rejoin.
            </p>
            <div className="cd-modal-footer">
              <button type="button" className="spherical-btn" onClick={() => setShowLeaveModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="spherical-btn spherical-btn-danger"
                onClick={handleLeaveCircle}
              >
                Yes, Leave Circle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: DELETE CIRCLE CONFIRMATION (Admin only)
          ===================================================================== */}
      {showDeleteModal && (
        <div className="cd-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="cd-modal-content cd-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="cd-modal-title">Delete Circle</h2>
            <p className="cd-modal-body-text">
              Are you sure you want to delete <strong>{circle.name}</strong>? This action cannot be undone and will remove all members and pending invites.
            </p>
            <div className="cd-modal-footer">
              <button type="button" className="spherical-btn" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="spherical-btn spherical-btn-danger"
                onClick={handleDeleteCircle}
              >
                Permanently Delete Circle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Public Profile Modal */}
      {viewingProfileUsername && (
        <PublicProfileModal
          username={viewingProfileUsername}
          currentUser={currentUser}
          onClose={() => setViewingProfileUsername(null)}
          onInviteSent={() => reloadCircle()}
        />
      )}
    </div>
  );
}
