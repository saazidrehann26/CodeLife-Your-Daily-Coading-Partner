import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  getAllBattles,
  getBattleById,
  saveBattle,
  updateBattleSettings,
  setCaptainReady,
  startBattle,
  validateChallengeAuthoring,
  publishTeamChallenge,
  syncBattleCode,
  runSolutionTest,
  submitSolution,
  advanceToNextRoundOrFinish,
  getSanitizedBattleForUser,
  BATTLE_PHASES,
  CHALLENGE_TYPES,
  FLOW_MODES,
  SUPPORTED_BATTLE_LANGUAGES,
  getDefaultStarterCode,
} from '../services/battleZoneService';
import './BattleZonePage.css';

/**
 * BattleZonePage
 * Split-screen live code battle between two teams (Circle vs Circle or In-Circle).
 */
export default function BattleZonePage({ battleId, currentUser, onNavigate }) {
  const [battle, setBattle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('teamA'); // For mobile responsive <=900px
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);

  // Problem Window State
  const [problemWindowCollapsedA, setProblemWindowCollapsedA] = useState(false);
  const [problemWindowCollapsedB, setProblemWindowCollapsedB] = useState(false);
  const problemWindowHeight = 240; // px

  // Stdin & Output state
  const [customStdinA, setCustomStdinA] = useState('');
  const [customStdinB, setCustomStdinB] = useState('');
  const [terminalOutputA, setTerminalOutputA] = useState('');
  const [terminalOutputB, setTerminalOutputB] = useState('');
  const [activeIoTabA, setActiveIoTabA] = useState('output'); // 'output' | 'stdin'
  const [activeIoTabB, setActiveIoTabB] = useState('output');

  // Action states
  const [isRunningA, setIsRunningA] = useState(false);
  const [isRunningB, setIsRunningB] = useState(false);
  const [isSubmittingA, setIsSubmittingA] = useState(false);
  const [isSubmittingB, setIsSubmittingB] = useState(false);

  // Authoring form state (for viewer's team)
  const [authoringTitle, setAuthoringTitle] = useState('Maximum Subarray Sum');
  const [authoringDesc, setAuthoringDesc] = useState('Find the contiguous subarray which has the largest sum and return its sum.');
  const [authoringConstraints, setAuthoringConstraints] = useState('1 <= nums.length <= 10^5, -10^4 <= nums[i] <= 10^4');
  const [authoringType, setAuthoringType] = useState(CHALLENGE_TYPES.FROM_SCRATCH);
  const [authoringStarterCode, setAuthoringStarterCode] = useState('');
  const [authoringRefSolution, setAuthoringRefSolution] = useState('');
  const [authoringTestCases, setAuthoringTestCases] = useState([
    { id: 'tc_1', input: '-2 1 -3 4 -1 2 1 -5 4', expectedOutput: '6', isSample: true, isHidden: false },
    { id: 'tc_2', input: '1', expectedOutput: '1', isSample: false, isHidden: true },
    { id: 'tc_3', input: '5 4 -1 7 8', expectedOutput: '23', isSample: false, isHidden: true },
  ]);
  const [authoringError, setAuthoringError] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Post-battle solution reveal toggle
  const [showRevealedSolutions, setShowRevealedSolutions] = useState(false);

  // Real-time EventSource connection reference
  const sseRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  const cleanUsername = useMemo(() => {
    return (currentUser?.username || '').trim().toLowerCase().replace(/^@/, '');
  }, [currentUser]);

  // Determine user role and team membership
  const viewerInfo = useMemo(() => {
    if (!battle) return { isTeamA: false, isTeamB: false, isCaptainA: false, isCaptainB: false, isCreator: false, isSpectator: true, userTeamKey: null };
    const isTeamA = battle.teams.teamA.members.some((m) => m.username?.toLowerCase() === cleanUsername);
    const isTeamB = battle.teams.teamB.members.some((m) => m.username?.toLowerCase() === cleanUsername);
    const isCaptainA = battle.teams.teamA.captainUsername?.toLowerCase() === cleanUsername;
    const isCaptainB = battle.teams.teamB.captainUsername?.toLowerCase() === cleanUsername;
    const isCreator = battle.createdBy?.toLowerCase() === cleanUsername;
    const isSpectator = !isTeamA && !isTeamB;
    const userTeamKey = isTeamA ? 'teamA' : isTeamB ? 'teamB' : null;

    return { isTeamA, isTeamB, isCaptainA, isCaptainB, isCreator, isSpectator, userTeamKey };
  }, [battle, cleanUsername]);

  // Initial Data Fetch
  const fetchBattleState = useCallback(async () => {
    if (!battleId) {
      try {
        const allBattles = getAllBattles();
        const activeMatch = allBattles.find((b) => {
          if (b.status === 'finished') return false;
          const inA = b.teams?.teamA?.members?.some((m) => (m.username || '').toLowerCase() === cleanUsername);
          const inB = b.teams?.teamB?.members?.some((m) => (m.username || '').toLowerCase() === cleanUsername);
          return inA || inB;
        });
        if (activeMatch) {
          setBattle(getSanitizedBattleForUser(activeMatch, cleanUsername));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      // 1. Try local service first
      let localBattle = getBattleById(battleId);
      if (localBattle) {
        setBattle(getSanitizedBattleForUser(localBattle, cleanUsername));
        setLoading(false);
      }

      // 2. Fetch from backend API
      const res = await fetch(`/api/battles/${encodeURIComponent(battleId)}?username=${encodeURIComponent(cleanUsername)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.battle) {
          setBattle(data.battle);
          setError(null);
          if (data.battle.language) {
            setAuthoringStarterCode((prev) => prev || getDefaultStarterCode(data.battle.language));
            setAuthoringRefSolution((prev) => prev || getDefaultStarterCode(data.battle.language));
          }
        }
      }
    } catch (err) {
      void err;
      // Offline fallback
      let localBattle = getBattleById(battleId);
      if (localBattle) {
        setBattle(getSanitizedBattleForUser(localBattle, cleanUsername));
        if (localBattle.language) {
          setAuthoringStarterCode((prev) => prev || getDefaultStarterCode(localBattle.language));
          setAuthoringRefSolution((prev) => prev || getDefaultStarterCode(localBattle.language));
        }
      } else {
        setError('Unable to load battle. Check your network or circle match.');
      }
    } finally {
      setLoading(false);
    }
  }, [battleId, cleanUsername]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBattleState();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchBattleState]);

  // Setup Server-Sent Events (SSE) stream for real-time updates
  useEffect(() => {
    if (!battleId) return;

    let evtSource = null;
    try {
      evtSource = new EventSource(`/api/battles/${encodeURIComponent(battleId)}/events`);
      sseRef.current = evtSource;

      evtSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.battle) {
            setBattle(getSanitizedBattleForUser(data.battle, cleanUsername));
          } else if (data.type === 'code_sync') {
            setBattle((prev) => {
              if (!prev) return prev;
              const updated = { ...prev };
              if (data.teamKey && updated.teams?.[data.teamKey]) {
                const isMyTeam = viewerInfo.userTeamKey === data.teamKey;
                if (isMyTeam || updated.phase === BATTLE_PHASES.FINISHED || viewerInfo.isSpectator) {
                  updated.teams[data.teamKey].code = data.code;
                }
              }
              return updated;
            });
          } else if (data.type === 'phase_change' || data.type === 'captain_ready' || data.type === 'challenge_published') {
            void fetchBattleState();
          }
        } catch {
          // ignore parse errors
        }
      };

      evtSource.onerror = () => {
        // SSE error, will reconnect automatically
      };
    } catch {
      // SSE not supported
    }

    // Interval polling fallback (every 2.5s) to ensure clock sync & timeouts
    const pollInterval = setInterval(() => {
      void fetchBattleState();
    }, 2500);

    return () => {
      if (evtSource) evtSource.close();
      clearInterval(pollInterval);
    };
  }, [battleId, cleanUsername, fetchBattleState, viewerInfo.userTeamKey, viewerInfo.isSpectator]);

  // Countdown timer synced from server phaseEndTime
  useEffect(() => {
    if (!battle?.phaseEndTime) {
      return;
    }

    const calcRemaining = () => {
      const now = Date.now();
      const end = new Date(battle.phaseEndTime).getTime();
      return Math.max(0, Math.round((end - now) / 1000));
    };

    const interval = setInterval(() => {
      setTimeRemainingSeconds(calcRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, [battle?.phaseEndTime]);

  // Format seconds into MM:SS
  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Real-time code change handler with debounced team sync
  const handleCodeChange = (teamKey, newCode) => {
    if (!battle) return;
    const updated = { ...battle };
    updated.teams[teamKey].code = newCode;
    setBattle(updated);

    // Save locally
    saveBattle(updated);

    // Debounce server broadcast
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/battles/${encodeURIComponent(battle.id)}/sync-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            battleId: battle.id,
            teamKey,
            username: cleanUsername,
            code: newCode,
          }),
        });
      } catch {
        syncBattleCode(battle.id, teamKey, cleanUsername, newCode);
      }
    }, 350);
  };

  // Ready Toggle Handler
  const handleToggleReady = async (teamKey) => {
    if (!battle) return;
    const currentReady = battle.teams[teamKey].captainReady;
    const newReady = !currentReady;

    try {
      const res = await fetch(`/api/battles/${encodeURIComponent(battle.id)}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId: battle.id,
          teamKey,
          username: cleanUsername,
          isReady: newReady,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.battle) setBattle(data.battle);
      } else {
        setCaptainReady(battle.id, teamKey, cleanUsername, newReady);
        fetchBattleState();
      }
    } catch {
      setCaptainReady(battle.id, teamKey, cleanUsername, newReady);
      fetchBattleState();
    }
  };

  // Start Battle Handler
  const handleStartBattle = async (adminOverride = false) => {
    if (!battle) return;
    try {
      const res = await fetch(`/api/battles/${encodeURIComponent(battle.id)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId: battle.id,
          username: cleanUsername,
          adminOverride,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.battle) setBattle(data.battle);
      } else {
        startBattle(battle.id, cleanUsername, adminOverride);
        fetchBattleState();
      }
    } catch {
      startBattle(battle.id, cleanUsername, adminOverride);
      fetchBattleState();
    }
  };

  // Settings Change Handler
  const handleUpdateSettings = async (updates) => {
    if (!battle) return;
    try {
      const res = await fetch(`/api/battles/${encodeURIComponent(battle.id)}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId: battle.id,
          username: cleanUsername,
          updates,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.battle) setBattle(data.battle);
      } else {
        updateBattleSettings(battle.id, cleanUsername, updates);
        fetchBattleState();
      }
    } catch {
      updateBattleSettings(battle.id, cleanUsername, updates);
      fetchBattleState();
    }
  };

  // Publish Challenge Handler
  const handlePublishChallenge = async () => {
    if (!battle || !viewerInfo.userTeamKey) return;
    setAuthoringError(null);
    setIsPublishing(true);

    const challengePayload = {
      title: authoringTitle,
      description: authoringDesc,
      constraints: authoringConstraints,
      type: authoringType,
      starterCode: authoringStarterCode,
      referenceSolution: authoringRefSolution,
      testCases: authoringTestCases,
    };

    // Client-side quick structural validation first
    const validation = await validateChallengeAuthoring(challengePayload, battle.language, battle.languageId);
    if (!validation.isValid) {
      setAuthoringError(validation.error);
      setIsPublishing(false);
      return;
    }

    try {
      const res = await fetch(`/api/battles/${encodeURIComponent(battle.id)}/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battleId: battle.id,
          teamKey: viewerInfo.userTeamKey,
          username: cleanUsername,
          challenge: {
            ...challengePayload,
            id: `chal_${Date.now()}_${viewerInfo.userTeamKey}`,
            authorTeam: viewerInfo.userTeamKey,
            authorUsername: cleanUsername,
            published: true,
            publishedAt: new Date().toISOString(),
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.battle) setBattle(data.battle);
      } else {
        const localRes = await publishTeamChallenge(battle.id, viewerInfo.userTeamKey, cleanUsername, challengePayload);
        if (!localRes.success) {
          setAuthoringError(localRes.error);
        } else {
          fetchBattleState();
        }
      }
    } catch {
      const localRes = await publishTeamChallenge(battle.id, viewerInfo.userTeamKey, cleanUsername, challengePayload);
      if (!localRes.success) {
        setAuthoringError(localRes.error);
      } else {
        fetchBattleState();
      }
    } finally {
      setIsPublishing(false);
    }
  };

  // Run Code against Sample Test or Custom Stdin
  const handleRunCode = async (teamKey) => {
    if (!battle) return;
    const team = battle.teams[teamKey];
    const stdinToUse = teamKey === 'teamA' ? customStdinA : customStdinB;
    if (teamKey === 'teamA') setIsRunningA(true);
    else setIsRunningB(true);

    try {
      const res = await runSolutionTest(battle.id, teamKey, cleanUsername, team.code, stdinToUse);
      const out = res.compileOutput || res.stderr || res.stdout || 'Program executed with no output.';
      if (teamKey === 'teamA') {
        setTerminalOutputA(out);
        setActiveIoTabA('output');
      } else {
        setTerminalOutputB(out);
        setActiveIoTabB('output');
      }
    } catch (err) {
      const msg = `Error running code: ${err.message}`;
      if (teamKey === 'teamA') setTerminalOutputA(msg);
      else setTerminalOutputB(msg);
    } finally {
      if (teamKey === 'teamA') setIsRunningA(false);
      else setIsRunningB(false);
    }
  };

  // Submit Final Solution
  const handleSubmitSolution = async (teamKey) => {
    if (!battle) return;
    const team = battle.teams[teamKey];
    if (teamKey === 'teamA') setIsSubmittingA(true);
    else setIsSubmittingB(true);

    try {
      const res = await submitSolution(battle.id, teamKey, cleanUsername, team.code);
      if (!res.success) {
        alert(res.error || 'Submission failed.');
      } else {
        const summary = res.allPassed
          ? `🎉 VICTORY! All test cases passed in ${res.submission.solveTimeSeconds}s! Point earned!`
          : `❌ Submission did not pass all tests: ${res.failureReason || 'Wrong answer'}. Try again!`;
        if (teamKey === 'teamA') {
          setTerminalOutputA(summary);
          setActiveIoTabA('output');
        } else {
          setTerminalOutputB(summary);
          setActiveIoTabB('output');
        }

        // Notify server
        try {
          await fetch(`/api/battles/${encodeURIComponent(battle.id)}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              battleId: battle.id,
              teamKey,
              username: cleanUsername,
              submission: res.submission,
            }),
          });
        } catch {
          // ignore
        }

        fetchBattleState();
      }
    } catch (err) {
      alert(`Submission error: ${err.message}`);
    } finally {
      if (teamKey === 'teamA') setIsSubmittingA(false);
      else setIsSubmittingB(false);
    }
  };

  // Test Case Management during authoring
  const handleAddTestCase = () => {
    setAuthoringTestCases((prev) => [
      ...prev,
      {
        id: `tc_${Date.now()}`,
        input: '',
        expectedOutput: '',
        isSample: false,
        isHidden: true,
      },
    ]);
  };

  const handleRemoveTestCase = (index) => {
    if (authoringTestCases.length <= 1) return;
    setAuthoringTestCases((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTestCase = (index, field, value) => {
    setAuthoringTestCases((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === 'isSample' && value === true) {
        copy[index].isHidden = false;
      }
      return copy;
    });
  };

  // Current active challenge solving target
  const currentRound = battle?.rounds?.[battle.currentRound - 1] || null;
  const teamAChallengeToSolve = currentRound?.teamBChallenge || null;
  const teamBChallengeToSolve = currentRound?.teamAChallenge || null;

  if (loading) {
    return (
      <div className="bz-loading-screen">
        <div className="bz-spinner"></div>
        <p className="bz-loading-text">Loading Battle Zone arena...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bz-error-screen">
        <h2 className="bz-error-title">Battle Arena Error</h2>
        <p className="bz-error-desc">{error}</p>
        <button type="button" className="bz-action-btn" onClick={() => onNavigate('group-challenge')}>
          ← Return to Friend Circles
        </button>
      </div>
    );
  }

  if (!battle) {
    const allMatches = getAllBattles();
    const userMatches = allMatches.filter((b) => {
      const inA = b.teams?.teamA?.members?.some((m) => (m.username || '').toLowerCase() === cleanUsername);
      const inB = b.teams?.teamB?.members?.some((m) => (m.username || '').toLowerCase() === cleanUsername);
      return inA || inB;
    });

    return (
      <div className="bz-hub-screen">
        <div className="bz-hub-card">
          <div className="bz-hub-badge">⚔️ LIVE COMPETITIVE ARENA</div>
          <h1 className="bz-hub-title">Battle Field</h1>
          <p className="bz-hub-subtitle">
            Live split-screen code battles between circles and teams. Author custom challenges,
            swap problem sets with your opponent, and race the clock to compile passing solutions!
          </p>

          <div className="bz-hub-features-grid">
            <div className="bz-hub-feat">
              <span className="bz-feat-icon">⚔️</span>
              <h4>Circle vs Circle</h4>
              <p>Challenge any rival circle to a head-to-head live programming duel.</p>
            </div>
            <div className="bz-hub-feat">
              <span className="bz-feat-icon">👥</span>
              <h4>In-Circle Teams</h4>
              <p>Divide circle members into Team A and Team B with designated captains.</p>
            </div>
            <div className="bz-hub-feat">
              <span className="bz-feat-icon">⚡</span>
              <h4>50/50 Split Screen</h4>
              <p>Real-time collaboration, live Monaco compiler, and synchronized timer.</p>
            </div>
            <div className="bz-hub-feat">
              <span className="bz-feat-icon">🛡️</span>
              <h4>Fair-Play Sandboxed Judge</h4>
              <p>Opponent code stays hidden; automatic server verification of test cases.</p>
            </div>
          </div>

          <div className="bz-hub-actions-row">
            <button
              type="button"
              className="bz-action-btn bz-btn-primary"
              onClick={() => onNavigate('group-challenge')}
            >
              ⚔️ Open Friend Circle to Challenge
            </button>
            <button
              type="button"
              className="bz-action-btn"
              onClick={() => onNavigate('dashboard')}
            >
              ← Back to Dashboard
            </button>
          </div>

          {userMatches.length > 0 && (
            <div className="bz-hub-recent-section">
              <h3 className="bz-hub-recent-title">Your Recent Battles</h3>
              <div className="bz-hub-recent-list">
                {userMatches.slice(0, 5).map((m) => (
                  <div key={m.id} className="bz-hub-recent-item">
                    <div className="bz-recent-info">
                      <span className="bz-recent-names">
                        {m.teams?.teamA?.name || 'Team A'} vs {m.teams?.teamB?.name || 'Team B'}
                      </span>
                      <span className="bz-recent-meta">
                        {m.language} • {m.format === 'circle_vs_circle' ? 'Circle Duel' : 'In-Circle'} • Status: {m.status.toUpperCase()}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="bz-action-btn bz-action-sm"
                      onClick={() => onNavigate(`battle-zone/${m.id}`)}
                    >
                      {m.status === 'finished' ? 'View Results' : 'Re-enter Arena'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const { teamA, teamB } = battle.teams;
  const isLobby = battle.phase === BATTLE_PHASES.LOBBY;
  const isAuthoring = battle.phase === BATTLE_PHASES.AUTHORING;
  const isSwap = battle.phase === BATTLE_PHASES.SWAP;
  const isSolving = battle.phase === BATTLE_PHASES.SOLVING;
  const isRoundResult = battle.phase === BATTLE_PHASES.ROUND_RESULT;
  const isFinished = battle.phase === BATTLE_PHASES.FINISHED;

  return (
    <div className="bz-container">
      {/* ---------------------------------------------------------------------
          1. GLOBAL TOP BAR
          --------------------------------------------------------------------- */}
      <header className="bz-topbar">
        <div className="bz-topbar-left">
          <button
            type="button"
            className="bz-nav-back-btn"
            onClick={() => {
              if (window.confirm('Leave Battle Zone? Your match progress will be preserved.')) {
                onNavigate('group-challenge');
              }
            }}
            title="Return to Circles"
          >
            ← Exit Arena
          </button>
          <div className="bz-title-box">
            <span className="bz-brand-pill">⚔️ BATTLE ZONE</span>
            <h1 className="bz-match-title">
              {battle.format === 'circle_vs_circle'
                ? `${battle.circleAName} vs ${battle.circleBName}`
                : `${teamA.name} vs ${teamB.name}`}
            </h1>
          </div>
        </div>

        {/* Center: Phase, Timer, Round, Global Score */}
        <div className="bz-topbar-center">
          <div className="bz-meta-group">
            <div className={`bz-phase-badge bz-phase-${battle.phase.toLowerCase()}`}>
              {battle.phase.replace('_', ' ')}
            </div>
            <span className="bz-round-indicator">
              Round {battle.currentRound} / {battle.totalRounds}
            </span>
          </div>

          <div className="bz-score-banner">
            <span className="bz-team-score-name bz-name-a">{teamA.name}</span>
            <div className="bz-score-boxes">
              <span className="bz-score-num bz-score-a">{teamA.score}</span>
              <span className="bz-score-colon">:</span>
              <span className="bz-score-num bz-score-b">{teamB.score}</span>
            </div>
            <span className="bz-team-score-name bz-name-b">{teamB.name}</span>
          </div>

          {/* Server-Synced Countdown Clock */}
          {!isLobby && !isFinished && (
            <div className={`bz-countdown-box ${timeRemainingSeconds < 30 ? 'bz-timer-urgent' : timeRemainingSeconds < 120 ? 'bz-timer-warning' : ''}`}>
              <span className="bz-timer-icon">⏳</span>
              <span className="bz-timer-val">{formatTimer(timeRemainingSeconds)}</span>
            </div>
          )}
        </div>

        <div className="bz-topbar-right">
          <div className="bz-fixed-lang-pill">
            <span className="bz-lang-icon">⚡</span>
            <span className="bz-lang-text">{battle.language}</span>
          </div>
          {viewerInfo.isSpectator && (
            <div className="bz-spectator-pill">👁️ Spectating</div>
          )}
        </div>
      </header>

      {/* Mobile Tab Switcher (<=900px) */}
      <div className="bz-mobile-tabs">
        <button
          type="button"
          className={`bz-mobile-tab ${activeTab === 'teamA' ? 'active' : ''}`}
          onClick={() => setActiveTab('teamA')}
        >
          {teamA.name} (Score: {teamA.score})
        </button>
        <button
          type="button"
          className={`bz-mobile-tab ${activeTab === 'teamB' ? 'active' : ''}`}
          onClick={() => setActiveTab('teamB')}
        >
          {teamB.name} (Score: {teamB.score})
        </button>
      </div>

      {/* ---------------------------------------------------------------------
          2. SWAP PHASE GET READY OVERLAY
          --------------------------------------------------------------------- */}
      {isSwap && (
        <div className="bz-swap-overlay">
          <div className="bz-swap-card">
            <div className="bz-swap-badge">🔄 CHALLENGES SWAPPED!</div>
            <h2 className="bz-swap-title">Get Ready to Solve!</h2>
            <p className="bz-swap-sub">
              Opponent challenges have been verified and loaded into your compiler.
            </p>
            <div className="bz-swap-counter">{timeRemainingSeconds}</div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          3. MAIN SPLIT SCREEN ARENA (50/50)
          --------------------------------------------------------------------- */}
      <main className="bz-arena">
        {/* ===================================================================
            LEFT HALF: TEAM A
            =================================================================== */}
        <section className={`bz-half bz-half-left ${activeTab !== 'teamA' ? 'bz-mobile-hidden' : ''}`}>
          {/* Team Side Header */}
          <div className="bz-half-header">
            <div className="bz-side-info">
              <div className="bz-circle-name-wrap">
                <span className="bz-side-tag">Team A</span>
                <h2 className="bz-team-display-name">{teamA.name}</h2>
              </div>
              <div className="bz-captain-badge">
                <span className="bz-crown-icon">👑</span>
                <span className="bz-captain-name">@{teamA.captainUsername}</span>
                <span className="bz-captain-label">(Captain)</span>
              </div>
            </div>

            <div className="bz-side-meta">
              <div className="bz-members-list">
                {teamA.members.map((m) => (
                  <span key={m.username} className="bz-member-chip" title={m.role}>
                    <span className="bz-status-dot green"></span>
                    @{m.username}
                  </span>
                ))}
              </div>
              <div className={`bz-live-status bz-status-${teamA.status}`}>
                {teamA.status === 'writing' && '✍️ Writing code'}
                {teamA.status === 'running' && '⚙️ Running test...'}
                {teamA.status === 'submitted' && '📬 Submitted'}
                {teamA.status === 'passed' && '✅ PASSED (1 Pt)'}
                {teamA.status === 'failed' && '❌ FAILED'}
                {teamA.status === 'idle' && '💤 Waiting'}
              </div>
            </div>
          </div>

          {/* Half Content based on Phase */}
          <div className="bz-half-body">
            {isLobby ? (
              <LobbySideView
                team={teamA}
                teamKey="teamA"
                battle={battle}
                viewerInfo={viewerInfo}
                onToggleReady={handleToggleReady}
                onUpdateSettings={handleUpdateSettings}
                onStartBattle={handleStartBattle}
              />
            ) : isAuthoring ? (
              viewerInfo.userTeamKey === 'teamA' ? (
                <AuthoringStudioView
                  battle={battle}
                  teamKey="teamA"
                  title={authoringTitle}
                  setTitle={setAuthoringTitle}
                  desc={authoringDesc}
                  setDesc={setAuthoringDesc}
                  constraints={authoringConstraints}
                  setConstraints={setAuthoringConstraints}
                  type={authoringType}
                  setType={setAuthoringType}
                  starterCode={authoringStarterCode}
                  setStarterCode={setAuthoringStarterCode}
                  refSolution={authoringRefSolution}
                  setRefSolution={setAuthoringRefSolution}
                  testCases={authoringTestCases}
                  onAddTestCase={handleAddTestCase}
                  onRemoveTestCase={handleRemoveTestCase}
                  onUpdateTestCase={handleUpdateTestCase}
                  onPublish={handlePublishChallenge}
                  isPublishing={isPublishing}
                  error={authoringError}
                  isPublished={currentRound?.teamAChallenge?.published}
                />
              ) : (
                <AuthoringProtectedOpponentView team={teamA} isPublished={currentRound?.teamAChallenge?.published} />
              )
            ) : (
              /* SOLVING & RESULT PHASES */
              <div className="bz-solving-container">
                {/* Collapsible Problem Window */}
                <div
                  className={`bz-problem-window ${problemWindowCollapsedA ? 'collapsed' : ''}`}
                  style={{ height: problemWindowCollapsedA ? '44px' : `${problemWindowHeight}px` }}
                >
                  <div className="bz-problem-header">
                    <div className="bz-problem-title-wrap">
                      <span className="bz-problem-pill">TASK</span>
                      <h3 className="bz-problem-title">
                        {teamAChallengeToSolve?.title || 'Waiting for Opponent Challenge...'}
                      </h3>
                      {teamAChallengeToSolve?.isFallback && (
                        <span className="bz-fallback-tag" title="Auto-selected because time expired">
                          Auto-Pick
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="bz-collapse-btn"
                      onClick={() => setProblemWindowCollapsedA(!problemWindowCollapsedA)}
                      title={problemWindowCollapsedA ? 'Expand Problem' : 'Collapse Problem'}
                    >
                      {problemWindowCollapsedA ? '▾ Show Problem' : '▴ Hide'}
                    </button>
                  </div>

                  {!problemWindowCollapsedA && (
                    <div className="bz-problem-content">
                      <p className="bz-problem-desc">{teamAChallengeToSolve?.description}</p>
                      {teamAChallengeToSolve?.constraints && (
                        <div className="bz-problem-constraints">
                          <strong>Constraints:</strong> {teamAChallengeToSolve.constraints}
                        </div>
                      )}

                      {/* Sample Test Cases */}
                      <div className="bz-sample-tests-section">
                        <span className="bz-samples-title">Sample Test Cases:</span>
                        {(teamAChallengeToSolve?.testCases || [])
                          .filter((tc) => tc.isSample)
                          .map((tc, idx) => (
                            <div key={tc.id || idx} className="bz-sample-card">
                              <div className="bz-sample-row">
                                <span className="bz-sample-lbl">Input:</span>
                                <pre className="bz-sample-code">{tc.input}</pre>
                              </div>
                              <div className="bz-sample-row">
                                <span className="bz-sample-lbl">Expected:</span>
                                <pre className="bz-sample-code">{tc.expectedOutput}</pre>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Monaco Compiler / Editor Window */}
                <div className="bz-editor-wrapper">
                  <div className="bz-editor-header">
                    <span className="bz-editor-lang-tag">Editor: {battle.language}</span>
                    {viewerInfo.userTeamKey === 'teamA' ? (
                      <span className="bz-collab-tag">Teammate live edits active</span>
                    ) : (
                      <span className="bz-collab-tag locked">Read-Only View</span>
                    )}
                  </div>

                  <div className="bz-monaco-frame">
                    <Editor
                      height="100%"
                      language={battle.language === 'Python' ? 'python' : battle.language === 'C' ? 'c' : 'cpp'}
                      value={teamA.code}
                      onChange={(newVal) => handleCodeChange('teamA', newVal || '')}
                      theme="vs-dark"
                      options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        readOnly: viewerInfo.userTeamKey !== 'teamA' || isFinished,
                      }}
                    />
                  </div>

                  {/* Stdin / Output Terminal Drawer */}
                  <div className="bz-terminal-drawer">
                    <div className="bz-terminal-tabs">
                      <button
                        type="button"
                        className={`bz-term-tab ${activeIoTabA === 'output' ? 'active' : ''}`}
                        onClick={() => setActiveIoTabA('output')}
                      >
                        Terminal Output
                      </button>
                      <button
                        type="button"
                        className={`bz-term-tab ${activeIoTabA === 'stdin' ? 'active' : ''}`}
                        onClick={() => setActiveIoTabA('stdin')}
                      >
                        Custom Stdin
                      </button>
                    </div>

                    <div className="bz-terminal-body">
                      {activeIoTabA === 'output' ? (
                        <pre className="bz-output-text">{terminalOutputA || 'Console ready. Press "Run Code" or "Submit Solution".'}</pre>
                      ) : (
                        <textarea
                          className="bz-stdin-input"
                          placeholder="Enter custom input for Run Code..."
                          value={customStdinA}
                          onChange={(e) => setCustomStdinA(e.target.value)}
                        />
                      )}
                    </div>

                    {/* Bottom Action Controls */}
                    {viewerInfo.userTeamKey === 'teamA' && isSolving && (
                      <div className="bz-editor-actions">
                        <button
                          type="button"
                          className="bz-run-btn"
                          disabled={isRunningA || isSubmittingA}
                          onClick={() => handleRunCode('teamA')}
                        >
                          {isRunningA ? 'Running...' : '▶ Run Code'}
                        </button>
                        <button
                          type="button"
                          className="bz-submit-btn"
                          disabled={isRunningA || isSubmittingA}
                          onClick={() => handleSubmitSolution('teamA')}
                        >
                          {isSubmittingA ? 'Evaluating...' : '🚀 Submit Solution'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===================================================================
            CENTER DIVIDER
            =================================================================== */}
        <div className="bz-center-divider">
          <div className="bz-divider-glow"></div>
          <div className="bz-divider-handle" title="Split Screen Divider">
            VS
          </div>
        </div>

        {/* ===================================================================
            RIGHT HALF: TEAM B
            =================================================================== */}
        <section className={`bz-half bz-half-right ${activeTab !== 'teamB' ? 'bz-mobile-hidden' : ''}`}>
          {/* Team Side Header */}
          <div className="bz-half-header">
            <div className="bz-side-info">
              <div className="bz-circle-name-wrap">
                <span className="bz-side-tag">Team B</span>
                <h2 className="bz-team-display-name">{teamB.name}</h2>
              </div>
              <div className="bz-captain-badge">
                <span className="bz-crown-icon">👑</span>
                <span className="bz-captain-name">@{teamB.captainUsername}</span>
                <span className="bz-captain-label">(Captain)</span>
              </div>
            </div>

            <div className="bz-side-meta">
              <div className="bz-members-list">
                {teamB.members.map((m) => (
                  <span key={m.username} className="bz-member-chip" title={m.role}>
                    <span className="bz-status-dot green"></span>
                    @{m.username}
                  </span>
                ))}
              </div>
              <div className={`bz-live-status bz-status-${teamB.status}`}>
                {teamB.status === 'writing' && '✍️ Writing code'}
                {teamB.status === 'running' && '⚙️ Running test...'}
                {teamB.status === 'submitted' && '📬 Submitted'}
                {teamB.status === 'passed' && '✅ PASSED (1 Pt)'}
                {teamB.status === 'failed' && '❌ FAILED'}
                {teamB.status === 'idle' && '💤 Waiting'}
              </div>
            </div>
          </div>

          {/* Half Content based on Phase */}
          <div className="bz-half-body">
            {isLobby ? (
              <LobbySideView
                team={teamB}
                teamKey="teamB"
                battle={battle}
                viewerInfo={viewerInfo}
                onToggleReady={handleToggleReady}
                onUpdateSettings={handleUpdateSettings}
                onStartBattle={handleStartBattle}
              />
            ) : isAuthoring ? (
              viewerInfo.userTeamKey === 'teamB' ? (
                <AuthoringStudioView
                  battle={battle}
                  teamKey="teamB"
                  title={authoringTitle}
                  setTitle={setAuthoringTitle}
                  desc={authoringDesc}
                  setDesc={setAuthoringDesc}
                  constraints={authoringConstraints}
                  setConstraints={setAuthoringConstraints}
                  type={authoringType}
                  setType={setAuthoringType}
                  starterCode={authoringStarterCode}
                  setStarterCode={setAuthoringStarterCode}
                  refSolution={authoringRefSolution}
                  setRefSolution={setAuthoringRefSolution}
                  testCases={authoringTestCases}
                  onAddTestCase={handleAddTestCase}
                  onRemoveTestCase={handleRemoveTestCase}
                  onUpdateTestCase={handleUpdateTestCase}
                  onPublish={handlePublishChallenge}
                  isPublishing={isPublishing}
                  error={authoringError}
                  isPublished={currentRound?.teamBChallenge?.published}
                />
              ) : (
                <AuthoringProtectedOpponentView team={teamB} isPublished={currentRound?.teamBChallenge?.published} />
              )
            ) : (
              /* SOLVING & RESULT PHASES */
              <div className="bz-solving-container">
                {/* Collapsible Problem Window */}
                <div
                  className={`bz-problem-window ${problemWindowCollapsedB ? 'collapsed' : ''}`}
                  style={{ height: problemWindowCollapsedB ? '44px' : `${problemWindowHeight}px` }}
                >
                  <div className="bz-problem-header">
                    <div className="bz-problem-title-wrap">
                      <span className="bz-problem-pill">TASK</span>
                      <h3 className="bz-problem-title">
                        {teamBChallengeToSolve?.title || 'Waiting for Opponent Challenge...'}
                      </h3>
                      {teamBChallengeToSolve?.isFallback && (
                        <span className="bz-fallback-tag" title="Auto-selected because time expired">
                          Auto-Pick
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="bz-collapse-btn"
                      onClick={() => setProblemWindowCollapsedB(!problemWindowCollapsedB)}
                      title={problemWindowCollapsedB ? 'Expand Problem' : 'Collapse Problem'}
                    >
                      {problemWindowCollapsedB ? '▾ Show Problem' : '▴ Hide'}
                    </button>
                  </div>

                  {!problemWindowCollapsedB && (
                    <div className="bz-problem-content">
                      <p className="bz-problem-desc">{teamBChallengeToSolve?.description}</p>
                      {teamBChallengeToSolve?.constraints && (
                        <div className="bz-problem-constraints">
                          <strong>Constraints:</strong> {teamBChallengeToSolve.constraints}
                        </div>
                      )}

                      {/* Sample Test Cases */}
                      <div className="bz-sample-tests-section">
                        <span className="bz-samples-title">Sample Test Cases:</span>
                        {(teamBChallengeToSolve?.testCases || [])
                          .filter((tc) => tc.isSample)
                          .map((tc, idx) => (
                            <div key={tc.id || idx} className="bz-sample-card">
                              <div className="bz-sample-row">
                                <span className="bz-sample-lbl">Input:</span>
                                <pre className="bz-sample-code">{tc.input}</pre>
                              </div>
                              <div className="bz-sample-row">
                                <span className="bz-sample-lbl">Expected:</span>
                                <pre className="bz-sample-code">{tc.expectedOutput}</pre>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Monaco Compiler / Editor Window */}
                <div className="bz-editor-wrapper">
                  <div className="bz-editor-header">
                    <span className="bz-editor-lang-tag">Editor: {battle.language}</span>
                    {viewerInfo.userTeamKey === 'teamB' ? (
                      <span className="bz-collab-tag">Teammate live edits active</span>
                    ) : (
                      <span className="bz-collab-tag locked">Read-Only View</span>
                    )}
                  </div>

                  <div className="bz-monaco-frame">
                    <Editor
                      height="100%"
                      language={battle.language === 'Python' ? 'python' : battle.language === 'C' ? 'c' : 'cpp'}
                      value={teamB.code}
                      onChange={(newVal) => handleCodeChange('teamB', newVal || '')}
                      theme="vs-dark"
                      options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        readOnly: viewerInfo.userTeamKey !== 'teamB' || isFinished,
                      }}
                    />
                  </div>

                  {/* Stdin / Output Terminal Drawer */}
                  <div className="bz-terminal-drawer">
                    <div className="bz-terminal-tabs">
                      <button
                        type="button"
                        className={`bz-term-tab ${activeIoTabB === 'output' ? 'active' : ''}`}
                        onClick={() => setActiveIoTabB('output')}
                      >
                        Terminal Output
                      </button>
                      <button
                        type="button"
                        className={`bz-term-tab ${activeIoTabB === 'stdin' ? 'active' : ''}`}
                        onClick={() => setActiveIoTabB('stdin')}
                      >
                        Custom Stdin
                      </button>
                    </div>

                    <div className="bz-terminal-body">
                      {activeIoTabB === 'output' ? (
                        <pre className="bz-output-text">{terminalOutputB || 'Console ready. Press "Run Code" or "Submit Solution".'}</pre>
                      ) : (
                        <textarea
                          className="bz-stdin-input"
                          placeholder="Enter custom input for Run Code..."
                          value={customStdinB}
                          onChange={(e) => setCustomStdinB(e.target.value)}
                        />
                      )}
                    </div>

                    {/* Bottom Action Controls */}
                    {viewerInfo.userTeamKey === 'teamB' && isSolving && (
                      <div className="bz-editor-actions">
                        <button
                          type="button"
                          className="bz-run-btn"
                          disabled={isRunningB || isSubmittingB}
                          onClick={() => handleRunCode('teamB')}
                        >
                          {isRunningB ? 'Running...' : '▶ Run Code'}
                        </button>
                        <button
                          type="button"
                          className="bz-submit-btn"
                          disabled={isRunningB || isSubmittingB}
                          onClick={() => handleSubmitSolution('teamB')}
                        >
                          {isSubmittingB ? 'Evaluating...' : '🚀 Submit Solution'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ---------------------------------------------------------------------
          4. ROUND RESULT MODAL
          --------------------------------------------------------------------- */}
      {isRoundResult && (
        <div className="bz-modal-overlay">
          <div className="bz-result-modal">
            <h2 className="bz-modal-title">Round {battle.currentRound} Completed!</h2>
            <div className="bz-round-winner-banner">
              {currentRound?.result?.winner === 'tie' ? (
                <span>Round Ended in a Tie! 🤝</span>
              ) : currentRound?.result?.winner === 'teamA' ? (
                <span>🏆 {teamA.name} Won Round {battle.currentRound}!</span>
              ) : (
                <span>🏆 {teamB.name} Won Round {battle.currentRound}!</span>
              )}
            </div>

            <div className="bz-result-stats-grid">
              <div className="bz-result-stat-box">
                <h4>{teamA.name}</h4>
                <p>Status: {currentRound?.teamASubmission?.allPassed ? '✅ Solved' : '❌ Incomplete'}</p>
                <p>Solve Time: {currentRound?.teamASubmission?.solveTimeSeconds || 'N/A'}s</p>
                <p>Total Points: {teamA.score}</p>
              </div>

              <div className="bz-result-stat-box">
                <h4>{teamB.name}</h4>
                <p>Status: {currentRound?.teamBSubmission?.allPassed ? '✅ Solved' : '❌ Incomplete'}</p>
                <p>Solve Time: {currentRound?.teamBSubmission?.solveTimeSeconds || 'N/A'}s</p>
                <p>Total Points: {teamB.score}</p>
              </div>
            </div>

            {(viewerInfo.isCreator || viewerInfo.isCaptainA || viewerInfo.isCaptainB) && (
              <button
                type="button"
                className="bz-action-btn primary"
                onClick={() => {
                  advanceToNextRoundOrFinish(battle.id);
                  fetchBattleState();
                }}
              >
                {battle.currentRound < battle.totalRounds ? 'Next Round →' : 'View Final Scoreboard 🏁'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          5. MATCH FINISHED / VICTORY SUMMARY MODAL
          --------------------------------------------------------------------- */}
      {isFinished && (
        <div className="bz-modal-overlay">
          <div className="bz-finished-modal">
            <div className="bz-trophy-badge">🏆 BATTLE CONCLUDED</div>
            <h2 className="bz-finished-title">
              {battle.winner === 'tie'
                ? 'Honorable Tie!'
                : `${battle.winner === 'teamA' ? teamA.name : teamB.name} is Victorious!`}
            </h2>

            <div className="bz-final-score-row">
              <div className="bz-final-team-col">
                <span className="bz-final-team-name">{teamA.name}</span>
                <span className="bz-final-score-big">{teamA.score}</span>
              </div>
              <span className="bz-final-vs">VS</span>
              <div className="bz-final-team-col">
                <span className="bz-final-team-name">{teamB.name}</span>
                <span className="bz-final-score-big">{teamB.score}</span>
              </div>
            </div>

            {battle.mvp && (
              <div className="bz-mvp-card">
                <span className="bz-mvp-badge">🌟 MATCH MVP</span>
                <span className="bz-mvp-user">@{battle.mvp.username}</span>
                <span className="bz-mvp-team">({battle.mvp.teamName})</span>
              </div>
            )}

            <div className="bz-reveal-section">
              <button
                type="button"
                className="bz-secondary-btn"
                onClick={() => setShowRevealedSolutions(!showRevealedSolutions)}
              >
                {showRevealedSolutions ? 'Hide Reference Solutions' : '👁️ Reveal Reference Solutions & Hidden Tests'}
              </button>

              {showRevealedSolutions && (
                <div className="bz-revealed-solutions-grid">
                  <div className="bz-revealed-card">
                    <h4>{teamA.name}'s Reference Solution</h4>
                    <pre className="bz-code-block">{currentRound?.teamAChallenge?.referenceSolution}</pre>
                  </div>
                  <div className="bz-revealed-card">
                    <h4>{teamB.name}'s Reference Solution</h4>
                    <pre className="bz-code-block">{currentRound?.teamBChallenge?.referenceSolution}</pre>
                  </div>
                </div>
              )}
            </div>

            <div className="bz-modal-footer">
              <button
                type="button"
                className="bz-action-btn primary"
                onClick={() => onNavigate('group-challenge')}
              >
                Return to Friend Circles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUB-COMPONENT: LobbySideView (Settings & Captain Ready)
// ---------------------------------------------------------------------------
function LobbySideView({
  team,
  teamKey,
  battle,
  viewerInfo,
  onToggleReady,
  onUpdateSettings,
  onStartBattle,
}) {
  const isCaptain = (team.captainUsername || '').toLowerCase() === viewerInfo.userTeamKey;
  const canModifySettings = viewerInfo.isCreator || viewerInfo.isCaptainA || viewerInfo.isCaptainB;
  const bothReady = battle.teams.teamA.captainReady && battle.teams.teamB.captainReady;

  return (
    <div className="bz-lobby-view">
      <div className="bz-lobby-card">
        <h3 className="bz-card-title">Match Setup & Ready Status</h3>
        <p className="bz-card-desc">
          Both team captains must mark ready to unlock the battlefield.
        </p>

        {/* Readiness Badge */}
        <div className={`bz-ready-status-box ${team.captainReady ? 'ready' : 'waiting'}`}>
          <span className="bz-ready-icon">{team.captainReady ? '✓' : '⏳'}</span>
          <span className="bz-ready-text">
            {team.captainReady ? `${team.name} Captain is READY!` : `Waiting for @${team.captainUsername} to mark ready...`}
          </span>
        </div>

        {/* Ready Action Button */}
        {(isCaptain || viewerInfo.isCreator) && (
          <button
            type="button"
            className={`bz-ready-btn ${team.captainReady ? 'cancel' : 'confirm'}`}
            onClick={() => onToggleReady(teamKey)}
          >
            {team.captainReady ? '✕ Cancel Ready' : '✓ Mark as Ready'}
          </button>
        )}

        {/* Lobby Config Parameters (Visible to everyone, editable by captains/creator) */}
        <div className="bz-lobby-settings">
          <h4 className="bz-settings-subhead">Match Parameters:</h4>
          <div className="bz-settings-grid">
            <div className="bz-setting-item">
              <label>Language:</label>
              <select
                disabled={!canModifySettings}
                value={battle.settings.language}
                onChange={(e) => onUpdateSettings({ language: e.target.value })}
              >
                {SUPPORTED_BATTLE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="bz-setting-item">
              <label>Rounds:</label>
              <select
                disabled={!canModifySettings}
                value={battle.settings.totalRounds}
                onChange={(e) => onUpdateSettings({ totalRounds: Number(e.target.value) })}
              >
                <option value={1}>1 Round (Default)</option>
                <option value={2}>2 Rounds</option>
                <option value={3}>3 Rounds</option>
              </select>
            </div>

            <div className="bz-setting-item">
              <label>Authoring Time:</label>
              <select
                disabled={!canModifySettings}
                value={battle.settings.authoringTimeMinutes}
                onChange={(e) => onUpdateSettings({ authoringTimeMinutes: Number(e.target.value) })}
              >
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes (Default)</option>
                <option value={15}>15 Minutes</option>
              </select>
            </div>

            <div className="bz-setting-item">
              <label>Solving Time:</label>
              <select
                disabled={!canModifySettings}
                value={battle.settings.solvingTimeMinutes}
                onChange={(e) => onUpdateSettings({ solvingTimeMinutes: Number(e.target.value) })}
              >
                <option value={10}>10 Minutes</option>
                <option value={15}>15 Minutes (Default)</option>
                <option value={20}>20 Minutes</option>
              </select>
            </div>

            <div className="bz-setting-item">
              <label>Challenge Type:</label>
              <select
                disabled={!canModifySettings}
                value={battle.settings.challengeType}
                onChange={(e) => onUpdateSettings({ challengeType: e.target.value })}
              >
                <option value={CHALLENGE_TYPES.FROM_SCRATCH}>Write from Scratch</option>
                <option value={CHALLENGE_TYPES.FIX_BUG}>Fix the Bug</option>
                <option value={CHALLENGE_TYPES.COMPLETE_CODE}>Complete the Code</option>
              </select>
            </div>

            <div className="bz-setting-item">
              <label>Flow Mode:</label>
              <select
                disabled={!canModifySettings}
                value={battle.settings.flowMode}
                onChange={(e) => onUpdateSettings({ flowMode: e.target.value })}
              >
                <option value={FLOW_MODES.SIMULTANEOUS}>Simultaneous (Default)</option>
                <option value={FLOW_MODES.SEQUENTIAL}>Sequential</option>
              </select>
            </div>
          </div>
        </div>

        {/* Start Battle Button */}
        {viewerInfo.isCreator && (
          <div className="bz-lobby-start-box">
            <button
              type="button"
              className={`bz-action-btn primary large ${!bothReady ? 'disabled' : ''}`}
              disabled={!bothReady}
              onClick={() => onStartBattle(false)}
            >
              ⚔️ Start Code Battle!
            </button>
            {!bothReady && (
              <button
                type="button"
                className="bz-admin-override-btn"
                onClick={() => onStartBattle(true)}
                title="Force start match without waiting for captains"
              >
                ⚡ Admin Force Start
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUB-COMPONENT: AuthoringStudioView (Drafting Challenge for Opponent)
// ---------------------------------------------------------------------------
function AuthoringStudioView({
  battle,
  _teamKey,
  title,
  setTitle,
  desc,
  setDesc,
  constraints,
  setConstraints,
  type,
  setType,
  starterCode,
  setStarterCode,
  refSolution,
  setRefSolution,
  testCases,
  onAddTestCase,
  onRemoveTestCase,
  onUpdateTestCase,
  onPublish,
  isPublishing,
  error,
  isPublished,
}) {
  const [activeCodeTab, setActiveCodeTab] = useState('refSolution'); // 'refSolution' | 'starterCode'

  if (isPublished) {
    return (
      <div className="bz-published-success-card">
        <div className="bz-published-icon">✅</div>
        <h3>Challenge Published!</h3>
        <p>Your team's challenge has been verified and safely queued for swap.</p>
        <span className="bz-waiting-tag">Waiting for opponent team to publish...</span>
      </div>
    );
  }

  return (
    <div className="bz-authoring-studio">
      <div className="bz-studio-header">
        <span className="bz-studio-tag">CHALLENGE AUTHORING</span>
        <h3 className="bz-studio-title">Draft a Challenge for Opponent</h3>
        <p className="bz-studio-desc">
          Write a problem with test cases and a working reference solution. Your reference solution must compile and pass all tests!
        </p>
      </div>

      {error && (
        <div className="bz-validation-error-box">
          <span className="bz-err-icon">⚠️</span>
          <span className="bz-err-text">{error}</span>
        </div>
      )}

      <div className="bz-authoring-fields">
        <div className="bz-form-row">
          <label>Problem Title:</label>
          <input
            type="text"
            className="bz-text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Reverse Linked List, Two Sum"
          />
        </div>

        <div className="bz-form-row">
          <label>Challenge Type:</label>
          <select className="bz-select-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value={CHALLENGE_TYPES.FROM_SCRATCH}>Write from Scratch</option>
            <option value={CHALLENGE_TYPES.FIX_BUG}>Fix the Bug (Broken code provided)</option>
            <option value={CHALLENGE_TYPES.COMPLETE_CODE}>Complete the Code (Missing parts)</option>
          </select>
        </div>

        <div className="bz-form-row">
          <label>Problem Description Statement:</label>
          <textarea
            className="bz-textarea-input"
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Explain what the algorithm should do and standard input/output format..."
          />
        </div>

        <div className="bz-form-row">
          <label>Constraints:</label>
          <input
            type="text"
            className="bz-text-input"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="e.g. 1 <= N <= 10^5, Time Limit: 2s"
          />
        </div>

        {/* Test Cases Builder */}
        <div className="bz-tc-builder">
          <div className="bz-tc-header">
            <h4>Test Cases (Inputs & Expected Outputs):</h4>
            <button type="button" className="bz-add-tc-btn" onClick={onAddTestCase}>
              + Add Test Case
            </button>
          </div>

          <div className="bz-tc-list">
            {testCases.map((tc, idx) => (
              <div key={tc.id || idx} className="bz-tc-card">
                <div className="bz-tc-top">
                  <span className="bz-tc-idx">Test #{idx + 1}</span>
                  <div className="bz-tc-toggles">
                    <label className="bz-checkbox-label">
                      <input
                        type="checkbox"
                        checked={tc.isSample}
                        onChange={(e) => onUpdateTestCase(idx, 'isSample', e.target.checked)}
                      />
                      Sample (Visible)
                    </label>
                    <label className="bz-checkbox-label">
                      <input
                        type="checkbox"
                        checked={tc.isHidden}
                        onChange={(e) => onUpdateTestCase(idx, 'isHidden', e.target.checked)}
                      />
                      Hidden
                    </label>
                  </div>
                  {testCases.length > 1 && (
                    <button
                      type="button"
                      className="bz-del-tc-btn"
                      onClick={() => onRemoveTestCase(idx)}
                      title="Remove test case"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="bz-tc-inputs">
                  <div className="bz-tc-col">
                    <label>Input (stdin):</label>
                    <textarea
                      rows={2}
                      value={tc.input}
                      onChange={(e) => onUpdateTestCase(idx, 'input', e.target.value)}
                      placeholder="e.g. 2 7 11 15\n9"
                    />
                  </div>
                  <div className="bz-tc-col">
                    <label>Expected Output (stdout):</label>
                    <textarea
                      rows={2}
                      value={tc.expectedOutput}
                      onChange={(e) => onUpdateTestCase(idx, 'expectedOutput', e.target.value)}
                      placeholder="e.g. 0 1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Code Editors Tabs (Reference Solution & Starter Code) */}
        <div className="bz-authoring-code-tabs">
          <button
            type="button"
            className={`bz-code-tab ${activeCodeTab === 'refSolution' ? 'active' : ''}`}
            onClick={() => setActiveCodeTab('refSolution')}
          >
            ★ Reference Solution (Must Pass Tests)
          </button>
          <button
            type="button"
            className={`bz-code-tab ${activeCodeTab === 'starterCode' ? 'active' : ''}`}
            onClick={() => setActiveCodeTab('starterCode')}
          >
            Starter Code (Given to Solver)
          </button>
        </div>

        <div className="bz-authoring-monaco">
          <Editor
            height="220px"
            language={battle.language === 'Python' ? 'python' : battle.language === 'C' ? 'c' : 'cpp'}
            value={activeCodeTab === 'refSolution' ? refSolution : starterCode}
            onChange={(newVal) => {
              if (activeCodeTab === 'refSolution') setRefSolution(newVal || '');
              else setStarterCode(newVal || '');
            }}
            theme="vs-dark"
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        {/* Publish Action */}
        <div className="bz-authoring-footer">
          <button
            type="button"
            className="bz-action-btn primary large"
            disabled={isPublishing}
            onClick={onPublish}
          >
            {isPublishing ? 'Verifying Reference Solution...' : '🚀 Validate & Publish Challenge'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUB-COMPONENT: AuthoringProtectedOpponentView
// ---------------------------------------------------------------------------
function AuthoringProtectedOpponentView({ team, isPublished }) {
  return (
    <div className="bz-authoring-protected">
      <div className="bz-protected-card">
        <div className="bz-protected-icon">🛡️</div>
        <h3 className="bz-protected-title">{team.name} is Drafting</h3>
        <p className="bz-protected-desc">
          Opponent challenge details and code are strictly shielded to maintain competitive fairness.
        </p>
        <div className="bz-protected-status">
          {isPublished ? (
            <span className="bz-status-pill green">✓ Challenge Published & Ready</span>
          ) : (
            <span className="bz-status-pill amber">✍️ Drafting Problem & Test Cases...</span>
          )}
        </div>
      </div>
    </div>
  );
}
