import React, { useState, useEffect, useCallback } from 'react';
import {
  getUserCircles,
  getPendingCircleInvites,
  respondCircleInviteAsync,
  createCircleAsync,
  joinCircleByCodeAsync,
  syncCirclesAndInvitesAsync,
  deleteCircleAsync,
  getCircleMatchHistory,
} from '../services/groupChallengeService';
import {
  getBattleRequestsForUserCircles,
  respondBattleRequest,
} from '../services/battleZoneService';
import CircleDetailsView from './CircleDetailsView';
import { getActiveUser } from '../services/dashboardService';
import './GroupChallengePage.css';

export default function GroupChallengePage({
  currentUser,
  onNavigate,
  onSignOut,
}) {
  // If user is deleted or session invalidated, immediately log out and redirect
  useEffect(() => {
    const verified = getActiveUser();
    if (!verified) {
      if (onSignOut) onSignOut();
    }
  }, [onSignOut]);

  // Circles & Invites
  const [circles, setCircles] = useState(() => (currentUser?.username ? getUserCircles(currentUser.username) : []));
  const [pendingInvites, setPendingInvites] = useState(() => (currentUser?.username ? getPendingCircleInvites(currentUser.username) : []));
  const [battleRequests, setBattleRequests] = useState(() => {
    const userCircles = currentUser?.username ? getUserCircles(currentUser.username) : [];
    return getBattleRequestsForUserCircles(userCircles, currentUser?.username);
  });
  const [matchHistory, setMatchHistory] = useState(() => getCircleMatchHistory());
  const [selectedCircleId, setSelectedCircleId] = useState(null);

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [customInviteCodeInput, setCustomInviteCodeInput] = useState('');
  const [createCircleError, setCreateCircleError] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [joinModalError, setJoinModalError] = useState(null);
  const [joinLoading, setJoinLoading] = useState(false);

  // Toasts
  const [copiedCodeId, setCopiedCodeId] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  const handleCopyCode = (code) => {
    if (!code) return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(code);
      }
    } catch {
      // Ignore clipboard write restrictions
    }
    setCopiedCodeId(code);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCustomInviteCodeInput(code);
  };

  const handleDeleteCircleDirect = async (circleId, circleName) => {
    if (!window.confirm(`Are you sure you want to delete "${circleName}"? This action cannot be undone.`)) {
      return;
    }
    await deleteCircleAsync(currentUser.username, circleId);
    setCircles(getUserCircles(currentUser.username));
    setSuccessToast(`Circle "${circleName}" deleted.`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // URL query or hash detection on initial mount (e.g. #group-challenge?join=CODE or #group-challenge/circle/:id)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const fullUrl = window.location.href;
      const match = fullUrl.match(/[?&]join=([a-zA-Z0-9]+)/i);
      if (match && match[1]) {
        Promise.resolve().then(() => {
          setJoinInviteCode(match[1].toUpperCase());
          setShowJoinModal(true);
        });
      }
      const circleMatch = window.location.hash.match(/group-challenge\/circle\/([a-zA-Z0-9_]+)/i);
      if (circleMatch && circleMatch[1]) {
        Promise.resolve().then(() => {
          setSelectedCircleId(circleMatch[1]);
        });
      }
    }
  }, []);

  const reloadData = useCallback(async () => {
    if (!currentUser?.username) return;
    await syncCirclesAndInvitesAsync(currentUser.username);
    const updatedCircles = getUserCircles(currentUser.username);
    setCircles(updatedCircles);
    setPendingInvites(getPendingCircleInvites(currentUser.username));
    setBattleRequests(getBattleRequestsForUserCircles(updatedCircles, currentUser.username));
    setMatchHistory(getCircleMatchHistory());
  }, [currentUser]);

  // Handle responding to Battle Requests
  const handleRespondBattleRequest = (requestId, accept) => {
    if (!currentUser?.username) return;
    const res = respondBattleRequest(requestId, currentUser.username, accept);
    const updatedCircles = getUserCircles(currentUser.username);
    setBattleRequests(getBattleRequestsForUserCircles(updatedCircles, currentUser.username));
    if (accept && res.battle) {
      onNavigate?.(`battle-zone/${res.battle.id}`);
    }
  };

  // Load updated circle data and sync from server on mount and window focus
  useEffect(() => {
    const timer = setTimeout(() => {
      reloadData();
    }, 0);
    window.addEventListener('focus', reloadData);
    const interval = setInterval(reloadData, 4000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', reloadData);
      clearInterval(interval);
    };
  }, [reloadData]);

  // Accept or decline invitation
  const handleRespondInvite = async (inviteId, accept) => {
    if (!currentUser?.username) return;
    const res = await respondCircleInviteAsync(currentUser.username, inviteId, accept);
    setPendingInvites(getPendingCircleInvites(currentUser.username));
    setCircles(getUserCircles(currentUser.username));
    if (accept && res?.circle?.id) {
      setSelectedCircleId(res.circle.id);
    }
  };

  // Create custom circle handler
  const handleCreateCircleSubmit = async (e) => {
    e.preventDefault();
    if (!newCircleName.trim() || !currentUser?.username) return;

    setCreateLoading(true);
    setCreateCircleError(null);

    try {
      const created = await createCircleAsync(
        currentUser.username,
        newCircleName.trim(),
        50,
        customInviteCodeInput.trim() || null
      );

      if (created) {
        setCircles(getUserCircles(currentUser.username));
        setNewCircleName('');
        setCustomInviteCodeInput('');
        setShowCreateModal(false);
        setSelectedCircleId(created.id);
        setSuccessToast(`Circle "${created.name}" created! Invite code: ${created.inviteCode}`);
        setTimeout(() => setSuccessToast(null), 4000);
      } else {
        setCreateCircleError('Could not create circle. Please check the circle name and invite code.');
      }
    } catch (err) {
      setCreateCircleError(err.message || 'Error creating circle.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Join circle by code handler (checks local & backend server)
  const handleJoinByCodeSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = joinInviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleanCode || !currentUser?.username) return;

    setJoinLoading(true);
    setJoinModalError(null);

    try {
      const res = await joinCircleByCodeAsync(currentUser.username, cleanCode);
      if (res.success && res.circle) {
        setCircles(getUserCircles(currentUser.username));
        setPendingInvites(getPendingCircleInvites(currentUser.username));
        setShowJoinModal(false);
        setJoinInviteCode('');
        setJoinModalError(null);
        setSelectedCircleId(res.circle.id);
        setSuccessToast(`Joined "${res.circle.name}" successfully!`);
        setTimeout(() => setSuccessToast(null), 4000);
      } else if (res.circle) {
        // Already a member
        setCircles(getUserCircles(currentUser.username));
        setShowJoinModal(false);
        setSelectedCircleId(res.circle.id);
      } else {
        setJoinModalError(res.error || 'Circle not found. Please verify the circle code.');
      }
    } catch (err) {
      setJoinModalError(err.message || 'Error joining circle.');
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div className="gc-wrapper">
      {/* =====================================================================
          1. TOP NAVIGATION BAR
          ===================================================================== */}
      <header className="gc-navbar">
        <div
          className="gc-brand-wrap"
          onClick={() => (onNavigate ? onNavigate('dashboard') : null)}
          title="Return to Dashboard"
          style={{ cursor: 'pointer' }}
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

        <button
          type="button"
          className="gc-back-btn"
          onClick={() => (onNavigate ? onNavigate('dashboard') : null)}
          title="Return to Dashboard"
          style={{
            background: 'rgba(225, 151, 121, 0.15)',
            border: '1px solid rgba(225, 175, 155, 0.35)',
            borderRadius: '8px',
            color: '#f5e6e1',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          ← Back to Dashboard
        </button>
      </header>

      {/* =====================================================================
          2. MAIN CONTENT
          ===================================================================== */}
      <main className="gc-container">
        {selectedCircleId ? (
          <CircleDetailsView
            circleId={selectedCircleId}
            currentUser={currentUser}
            onBack={() => {
              setSelectedCircleId(null);
              if (currentUser?.username) {
                setCircles(getUserCircles(currentUser.username));
              }
            }}
            onCircleDeleted={() => {
              setSelectedCircleId(null);
              if (currentUser?.username) {
                setCircles(getUserCircles(currentUser.username));
              }
            }}
            onNavigate={onNavigate}
          />
        ) : (
          <>
            {/* Hero Banner */}
        <section className="gc-glass-card gc-hero-banner">
          <div className="gc-hero-text-col">
            <span className="gc-hero-tag">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Friend Circle Team Battle
            </span>
            <h1 className="gc-hero-title">Friend Circle</h1>
            <p className="gc-hero-subtitle">
              Assemble your private circle of friends. Form two teams (Team A vs Team B), pick your team captains, and compete in real-time to solve problems.
            </p>
          </div>

          <div className="gc-hero-actions-row">
            <button
              type="button"
              className="spherical-btn spherical-btn-primary"
              onClick={() => {
                setCreateCircleError(null);
                setShowCreateModal(true);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Build Custom Circle</span>
            </button>

            <button
              type="button"
              className="spherical-btn"
              onClick={() => {
                setJoinModalError(null);
                setShowJoinModal(true);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>Join with Circle Code</span>
            </button>
          </div>
        </section>

        {/* Success Feedback Toast */}
        {successToast && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(46, 125, 50, 0.9), rgba(27, 94, 32, 0.9))',
              border: '1px solid rgba(129, 199, 132, 0.5)',
              borderRadius: '12px',
              padding: '12px 18px',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)',
            }}
          >
            <span style={{ fontSize: '18px' }}>✓</span>
            <span>{successToast}</span>
          </div>
        )}

        {/* Real-time Incoming Battle Request Alert */}
        {battleRequests.length > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(80, 25, 20, 0.95), rgba(45, 15, 12, 0.95))',
              border: '1px solid rgba(255, 180, 150, 0.45)',
              borderRadius: '12px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '18px',
              gap: '14px',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>⚔️</span>
              <div>
                <span style={{ fontSize: '15px', fontWeight: '800', color: '#ffffff', display: 'block' }}>
                  Battle Challenge from {battleRequests[0].fromCircleName}!
                </span>
                <span style={{ fontSize: '13px', color: '#ffcfbe' }}>
                  Admin @{battleRequests[0].fromAdminUsername} has challenged {battleRequests[0].toCircleName} to a live code battle!
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="spherical-btn spherical-btn-primary spherical-btn-sm"
                onClick={() => handleRespondBattleRequest(battleRequests[0].id, true)}
              >
                Accept Battle ⚔️
              </button>
              <button
                type="button"
                className="spherical-btn spherical-btn-sm"
                onClick={() => handleRespondBattleRequest(battleRequests[0].id, false)}
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Real-time Incoming Invite Notification Alert */}
        {pendingInvites.length > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(74, 38, 28, 0.95), rgba(48, 24, 18, 0.95))',
              border: '1px solid rgba(230, 196, 180, 0.4)',
              borderRadius: '12px',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '18px',
              gap: '12px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🔔</span>
              <div>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>
                  @{pendingInvites[0].inviterUsername} invited you in {pendingInvites[0].circleName}
                </span>
                <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)' }}>
                  Accept to join the circle and participate in team challenges together!
                </span>
              </div>
            </div>
            <button
              type="button"
              className="spherical-btn spherical-btn-primary spherical-btn-sm"
              onClick={() => handleRespondInvite(pendingInvites[0].id, true)}
            >
              Accept Invite →
            </button>
          </div>
        )}

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
                    <span className="gc-invite-circle-name" style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff' }}>
                      @{inv.inviterUsername} invited you in {inv.circleName}
                    </span>
                    <span className="gc-invite-inviter" style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', marginTop: '2px' }}>
                      Circle Invitation • {new Date(inv.createdAt).toLocaleDateString()}
                    </span>
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
              <p style={{ fontSize: '15px', margin: 0 }}>
                You have not joined or created any friend circles yet.
              </p>
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

                const isCurrentAdmin =
                  (c.adminUsername || '').toLowerCase().replace(/^@/, '') ===
                  (currentUser?.username || '').toLowerCase().replace(/^@/, '');

                return (
                  <div
                    key={c.id}
                    className="gc-circle-card"
                    onClick={() => setSelectedCircleId(c.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="gc-circle-card-top">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h3 className="gc-circle-name">{c.name}</h3>
                          {c.category && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                background: 'rgba(230, 196, 180, 0.15)',
                                border: '1px solid rgba(230, 196, 180, 0.3)',
                                color: '#e6c4b4',
                                fontWeight: 600,
                              }}
                            >
                              {c.category}
                            </span>
                          )}
                        </div>
                        <span className="gc-circle-meta-text">
                          {c.members?.length || 1} members • Admin @{c.adminUsername}
                        </span>
                        {c.description && (
                          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)' }}>
                            {c.description}
                          </p>
                        )}
                      </div>
                      <span className={`gc-status-badge ${badgeClass}`}>{c.status}</span>
                    </div>

                    <div className="gc-circle-footer">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                          Code: <strong style={{ color: '#fff', letterSpacing: '1px' }}>{c.inviteCode || 'CODE'}</strong>
                        </span>
                        <button
                          type="button"
                          className="spherical-btn spherical-btn-sm"
                          title="Copy Circle Code"
                          style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCode(c.inviteCode);
                          }}
                        >
                          {copiedCodeId === c.inviteCode ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isCurrentAdmin && (
                          <button
                            type="button"
                            className="spherical-btn spherical-btn-sm spherical-btn-danger"
                            title="Delete Circle"
                            style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCircleDirect(c.id, c.name);
                            }}
                          >
                            🗑️
                          </button>
                        )}
                        <button
                          type="button"
                          className="spherical-btn spherical-btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCircleId(c.id);
                          }}
                        >
                          Enter Circle
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
        </>
      )}
      </main>

      {/* =====================================================================
          3. MODALS
          ===================================================================== */}
      {/* Build Custom Circle Modal */}
      {showCreateModal && (
        <div className="dash-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="dash-modal-window" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div>
                <h3 className="modal-title" style={{ margin: 0 }}>Build a Custom Circle</h3>
                <span style={{ fontSize: '12px', color: '#e6c4b4', marginTop: '2px', display: 'block' }}>
                  Create your custom friend circle with custom invite code, category & capacity
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCircleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              {/* Circle Name */}
              <div className="modal-form-group">
                <label className="modal-label">Circle Name *</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Elite Coders, Algorithm Squad"
                  value={newCircleName}
                  onChange={(e) => setNewCircleName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {/* Custom Invite Code with Auto-Gen */}
              <div className="modal-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="modal-label" style={{ marginBottom: 0 }}>
                    Custom Circle Code <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <button
                    type="button"
                    className="spherical-btn spherical-btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                    onClick={generateRandomCode}
                  >
                    🎲 Auto-Gen Code
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="e.g. ELITE1 (3–10 chars) or leave blank"
                    value={customInviteCodeInput}
                    onChange={(e) => setCustomInviteCodeInput(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                    maxLength={10}
                    style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}
                  />
                </div>
                <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px', display: 'block' }}>
                  Other users can join using this code. If left blank, a random 6-character code will be generated.
                </span>
              </div>

              {createCircleError && (
                <div style={{ color: '#ff8a80', fontSize: '13px', fontWeight: 600, background: 'rgba(244, 67, 54, 0.15)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
                  {createCircleError}
                </div>
              )}

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="spherical-btn"
                  onClick={() => setShowCreateModal(false)}
                  disabled={createLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="spherical-btn spherical-btn-primary"
                  disabled={!newCircleName.trim() || createLoading}
                >
                  {createLoading ? 'Building Circle...' : 'Build Circle'}
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
              <div>
                <h3 className="modal-title" style={{ margin: 0 }}>Join a Friend Circle</h3>
                <span style={{ fontSize: '12px', color: '#e6c4b4', marginTop: '2px', display: 'block' }}>
                  Enter the circle code shared by your friend to join their circle
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowJoinModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleJoinByCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              <div className="modal-form-group">
                <label className="modal-label">Circle Code</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. ELITE1, 4A4NPU"
                  value={joinInviteCode}
                  onChange={(e) => {
                    setJoinInviteCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
                    setJoinModalError(null);
                  }}
                  maxLength={12}
                  required
                  autoFocus
                  style={{ textTransform: 'uppercase', letterSpacing: '3px', fontWeight: 700, fontSize: '16px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', marginTop: '6px', textAlign: 'center', display: 'block' }}>
                  Codes are not case-sensitive (e.g. ELITE1 or elite1)
                </span>
              </div>

              {joinModalError && (
                <div style={{ color: '#ff8a80', fontSize: '13px', fontWeight: 600, background: 'rgba(244, 67, 54, 0.15)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
                  {joinModalError}
                </div>
              )}

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="spherical-btn"
                  onClick={() => setShowJoinModal(false)}
                  disabled={joinLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="spherical-btn spherical-btn-primary"
                  disabled={!joinInviteCode.trim() || joinLoading}
                >
                  {joinLoading ? 'Joining Circle...' : 'Join Circle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
