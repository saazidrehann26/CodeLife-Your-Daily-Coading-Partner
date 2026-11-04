import React, { useState, useEffect } from 'react';
import {
  getPublicProfile,
  getUserCircles,
  sendCircleInvite,
  toggleBlockUser,
  saveUserPrivacySettings,
} from '../services/groupChallengeService';
import './PublicProfileModal.css';

export default function PublicProfileModal({
  username,
  currentUser,
  onClose,
  onInviteSent,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite state
  const [userCircles, setUserCircles] = useState(() => (currentUser?.username ? getUserCircles(currentUser.username) : []));
  const [selectedCircleId, setSelectedCircleId] = useState(() => {
    const list = currentUser?.username ? getUserCircles(currentUser.username) : [];
    return list[0]?.id || '';
  });
  const [inviteStatus, setInviteStatus] = useState(null); // { type: 'success'|'error', message }
  const [isBlocked, setIsBlocked] = useState(false);

  // Own privacy settings state
  const isSelf = currentUser && profile && currentUser.username?.toLowerCase() === profile.username?.toLowerCase();
  const [selfPrivacy, setSelfPrivacy] = useState(null);
  const [privacyToast, setPrivacyToast] = useState(null);

  useEffect(() => {
    let active = true;
    if (!username) return;

    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setError(null);

      try {
        const data = await getPublicProfile(username, currentUser?.username);
        if (!active) return;
        if (!data) {
          setError(`User "@${username}" not found or account is unavailable.`);
        } else {
          setProfile(data);
          setIsBlocked(Boolean(data.isBlocked));
          if (currentUser?.username?.toLowerCase() === data.username?.toLowerCase()) {
            setSelfPrivacy({
              showInstitution: data.showInstitution !== false,
              showStats: data.showStats !== false,
              allowStrangerInvites: data.allowStrangerInvites !== false,
            });
          }
        }
      } catch (err) {
        if (active) setError(err.message || 'Error loading profile');
      } finally {
        if (active) setLoading(false);
      }
    });

    if (currentUser?.username) {
      Promise.resolve().then(() => {
        if (!active) return;
        const circles = getUserCircles(currentUser.username);
        setUserCircles(circles);
        if (circles.length > 0) {
          setSelectedCircleId(circles[0].id);
        }
      });
    }

    return () => {
      active = false;
    };
  }, [username, currentUser]);

  const handleSendInvite = () => {
    if (!currentUser) {
      setInviteStatus({ type: 'error', message: 'Please sign in to invite users.' });
      return;
    }
    if (!selectedCircleId) {
      setInviteStatus({ type: 'error', message: 'Please select a circle.' });
      return;
    }

    const circle = userCircles.find((c) => c.id === selectedCircleId);
    const circleName = circle ? circle.name : 'Friend Circle';

    const res = sendCircleInvite(currentUser.username, profile.username, selectedCircleId, circleName);
    if (res.success) {
      setInviteStatus({ type: 'success', message: `Invitation sent to @${profile.username}!` });
      if (onInviteSent) onInviteSent(res.invite);
    } else {
      setInviteStatus({ type: 'error', message: res.error || 'Failed to send invite.' });
    }
  };

  const handleToggleBlock = () => {
    if (!currentUser || !profile) return;
    const nowBlocked = toggleBlockUser(currentUser.username, profile.username);
    setIsBlocked(nowBlocked);
  };

  const handleTogglePrivacySetting = (key) => {
    if (!selfPrivacy || !currentUser) return;
    const updated = {
      ...selfPrivacy,
      [key]: !selfPrivacy[key],
    };
    setSelfPrivacy(updated);
    saveUserPrivacySettings(currentUser.username, updated);
    setPrivacyToast('Privacy settings updated');
    setTimeout(() => setPrivacyToast(null), 2500);
  };

  return (
    <div className="public-profile-backdrop" onClick={onClose}>
      <div className="public-profile-window" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="public-profile-header">
          <h3 className="public-profile-title">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" className="public-profile-badge-icon">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{isSelf ? 'My Public Profile' : 'Member Profile'}</span>
          </h3>
          <button
            type="button"
            className="public-profile-close-btn"
            onClick={onClose}
            aria-label="Close Profile"
          >
            ✕
          </button>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '36px 0', color: 'rgba(255, 255, 255, 0.7)' }}>
            Loading member profile...
          </div>
        )}

        {error && !loading && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#ff8a80' }}>
            <p>{error}</p>
            <button
              type="button"
              className="public-profile-ghost-btn"
              onClick={onClose}
              style={{ marginTop: '10px' }}
            >
              Return
            </button>
          </div>
        )}

        {/* Profile Content */}
        {profile && !loading && !error && (
          <>
            {/* Top Hero Section */}
            <div className="public-profile-hero">
              <div className="public-profile-avatar-frame">
                <img
                  src={profile.photoUrl}
                  alt={`${profile.name}'s Avatar`}
                  className="public-profile-avatar-img"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/codelife_logo_white_bg.png';
                  }}
                />
              </div>

              <div className="public-profile-main-meta">
                <h4 className="public-profile-name">{profile.name}</h4>
                <span className="public-profile-handle">@{profile.username}</span>
                <span className="public-profile-institution-badge">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                  <span>{profile.institution}</span>
                </span>
              </div>
            </div>

            {profile.bio && (
              <p className="public-profile-bio">{profile.bio}</p>
            )}

            {/* Coding & Group Challenge Stats Matrix */}
            <div className="public-profile-stats-grid">
              <div className="public-stat-card">
                <span className="public-stat-label">Solved</span>
                <span className="public-stat-val">
                  {profile.totalProblemsSolved !== null ? profile.totalProblemsSolved : '—'}
                </span>
              </div>

              <div className="public-stat-card">
                <span className="public-stat-label">Streak</span>
                <span className="public-stat-val flame">
                  {profile.currentStreak !== null ? `${profile.currentStreak}d` : '—'}
                </span>
              </div>

              <div className="public-stat-card">
                <span className="public-stat-label">Team Battles</span>
                <span className="public-stat-val">
                  {profile.matchesPlayed !== null ? profile.matchesPlayed : '0'}
                </span>
              </div>

              <div className="public-stat-card">
                <span className="public-stat-label">Wins</span>
                <span className="public-stat-val gold">
                  {profile.matchesWon !== null ? profile.matchesWon : '0'}
                </span>
              </div>
            </div>

            {/* Invite to Circle Section (Shown if user is not self and logged in) */}
            {!isSelf && currentUser && (
              <div className="public-profile-invite-section">
                <div className="public-profile-invite-header">
                  <span>Invite to Circle Challenge</span>
                  {profile.allowStrangerInvites === false && (
                    <span style={{ fontSize: '11px', color: '#ffb74d' }}>Only accepts friend invites</span>
                  )}
                </div>

                {userCircles.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
                    You have not created any circles yet. Create a circle to invite teammates!
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <select
                      className="public-circle-select"
                      value={selectedCircleId}
                      onChange={(e) => setSelectedCircleId(e.target.value)}
                    >
                      {userCircles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.members?.length || 1} members)
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="spherical-btn spherical-btn-primary"
                      onClick={handleSendInvite}
                      disabled={profile.allowStrangerInvites === false || isBlocked}
                      title={
                        profile.allowStrangerInvites === false
                          ? 'This user has disabled invitations'
                          : isBlocked
                          ? 'Cannot invite blocked user'
                          : 'Send circle invitation'
                      }
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Invite
                    </button>
                  </div>
                )}

                {inviteStatus && (
                  <div
                    style={{
                      fontSize: '12.5px',
                      color: inviteStatus.type === 'success' ? '#a5d6a7' : '#ef9a9a',
                      fontWeight: 600,
                    }}
                  >
                    {inviteStatus.message}
                  </div>
                )}
              </div>
            )}

            {/* Self Privacy Configuration Box */}
            {isSelf && selfPrivacy && (
              <div className="public-profile-privacy-box">
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: '#e6c4b4', fontWeight: 700 }}>
                  Profile Privacy Settings
                </span>

                <div className="public-privacy-row">
                  <span>Display institution & class publicly</span>
                  <input
                    type="checkbox"
                    checked={selfPrivacy.showInstitution}
                    onChange={() => handleTogglePrivacySetting('showInstitution')}
                    className="public-privacy-toggle"
                  />
                </div>

                <div className="public-privacy-row">
                  <span>Display problem stats & streak publicly</span>
                  <input
                    type="checkbox"
                    checked={selfPrivacy.showStats}
                    onChange={() => handleTogglePrivacySetting('showStats')}
                    className="public-privacy-toggle"
                  />
                </div>

                <div className="public-privacy-row">
                  <span>Allow circle invitations from other members</span>
                  <input
                    type="checkbox"
                    checked={selfPrivacy.allowStrangerInvites}
                    onChange={() => handleTogglePrivacySetting('allowStrangerInvites')}
                    className="public-privacy-toggle"
                  />
                </div>

                {privacyToast && (
                  <span style={{ fontSize: '12px', color: '#a5d6a7', fontWeight: 600 }}>
                    ✓ {privacyToast}
                  </span>
                )}
              </div>
            )}

            {/* Footer / Safety Controls */}
            <div className="public-profile-actions">
              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                Member since {profile.memberSince}
              </span>

              {!isSelf && currentUser && (
                <div className="public-profile-secondary-actions">
                  <button
                    type="button"
                    className={`public-profile-ghost-btn ${isBlocked ? '' : 'danger'}`}
                    onClick={handleToggleBlock}
                  >
                    {isBlocked ? 'Unblock User' : 'Block User'}
                  </button>

                  <button
                    type="button"
                    className="public-profile-ghost-btn"
                    onClick={() => alert(`Report received for @${profile.username}. Our moderators will review it.`)}
                  >
                    Report
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
