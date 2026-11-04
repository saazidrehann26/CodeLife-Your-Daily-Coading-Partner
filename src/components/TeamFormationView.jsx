import React, { useState, useMemo, useEffect } from 'react';
import {
  MIN_PLAYERS_PER_CIRCLE,
  TEAM_SIZE_MODES,
  FORMATION_MODES,
  CHALLENGE_MODES,
  PROBLEM_SOURCES,
  TIME_LIMIT_PRESETS,
  DEFAULT_TIME_LIMIT_MINUTES,
  deriveDefaultProblemCount,
  getAvailableChallengeProblems,
  autoSelectChallengeProblems,
  distributeProblemsRoundRobin,
  validateTeamFormation,
  randomSplitTeams,
  autoPromoteCaptain,
  createChallengeDraft,
  buildPublicUserDTO,
} from '../services/groupChallengeService';
import { findUser } from '../services/dbService';
import './TeamFormationView.css';

export default function TeamFormationView({
  circle,
  currentUser,
  onBack,
  onChallengeCreated,
}) {
  // 1. Participant Selection
  const allCircleMembers = useMemo(() => {
    return (circle?.members || []).map((m) => m.username);
  }, [circle]);

  const [selectedParticipants, setSelectedParticipants] = useState(() => allCircleMembers);
  const [teamSizeMode, setTeamSizeMode] = useState(TEAM_SIZE_MODES.BALANCED);
  const [formationMode, setFormationMode] = useState(FORMATION_MODES.RANDOM);

  // Teams state
  const [teams, setTeams] = useState(() => {
    return randomSplitTeams(allCircleMembers, TEAM_SIZE_MODES.BALANCED);
  });

  // Draft mode state (for captains_pick)
  const [draftCaptainA, setDraftCaptainA] = useState(() => allCircleMembers[0] || '');
  const [draftCaptainB, setDraftCaptainB] = useState(() => allCircleMembers[1] || '');
  const [draftTurn, setDraftTurn] = useState('teamA'); // 'teamA' | 'teamB'
  const [draftHistory, setDraftHistory] = useState([]);

  // Auto-init captains when participants change
  useEffect(() => {
    if (selectedParticipants.length >= MIN_PLAYERS_PER_CIRCLE) {
      Promise.resolve().then(() => {
        if (!draftCaptainA || !selectedParticipants.includes(draftCaptainA)) {
          setDraftCaptainA(selectedParticipants[0] || '');
        }
        if (!draftCaptainB || !selectedParticipants.includes(draftCaptainB)) {
          setDraftCaptainB(selectedParticipants[1] || '');
        }
      });
    }
  }, [selectedParticipants, draftCaptainA, draftCaptainB]);

  // Validation
  const validation = useMemo(() => {
    return validateTeamFormation(teams, teamSizeMode);
  }, [teams, teamSizeMode]);

  // Handle participant checkbox toggle
  const toggleParticipant = (username) => {
    setSelectedParticipants((prev) => {
      let updated;
      if (prev.includes(username)) {
        updated = prev.filter((u) => u !== username);
      } else {
        updated = [...prev, username];
      }
      return updated;
    });
  };

  const handleSelectAll = () => setSelectedParticipants(allCircleMembers);
  const handleDeselectAll = () => setSelectedParticipants([]);

  // Action: Perform Random Split
  const handleRandomSplit = () => {
    if (selectedParticipants.length < MIN_PLAYERS_PER_CIRCLE) return;
    const split = randomSplitTeams(selectedParticipants, teamSizeMode);
    setTeams(split);
  };

  // Action: Manual Assignment Moves
  const moveMemberToTeam = (username, targetTeamKey) => {
    setTeams((prev) => {
      const otherTeamKey = targetTeamKey === 'teamA' ? 'teamB' : 'teamA';
      const targetTeam = { ...prev[targetTeamKey] };
      let otherTeam = { ...prev[otherTeamKey] };

      // Remove from other team if present
      otherTeam.members = otherTeam.members.filter((m) => m !== username);
      otherTeam = autoPromoteCaptain(otherTeam);

      // Add to target team if not already present
      if (!targetTeam.members.includes(username)) {
        targetTeam.members = [...targetTeam.members, username];
        if (!targetTeam.captainUsername) {
          targetTeam.captainUsername = username;
        }
      }

      return {
        ...prev,
        [targetTeamKey]: targetTeam,
        [otherTeamKey]: otherTeam,
      };
    });
  };

  const removeMemberFromTeams = (username) => {
    setTeams((prev) => {
      const teamA = {
        ...prev.teamA,
        members: prev.teamA.members.filter((m) => m !== username),
      };
      const teamB = {
        ...prev.teamB,
        members: prev.teamB.members.filter((m) => m !== username),
      };

      return {
        ...prev,
        teamA: autoPromoteCaptain(teamA),
        teamB: autoPromoteCaptain(teamB),
      };
    });
  };

  // Action: Set Captain
  const handleSetCaptain = (teamKey, username) => {
    setTeams((prev) => {
      const team = { ...prev[teamKey] };
      if (team.members.includes(username)) {
        team.captainUsername = username;
      }
      return {
        ...prev,
        [teamKey]: team,
      };
    });
  };

  // Action: Update Team Name
  const handleUpdateTeamName = (teamKey, newName) => {
    setTeams((prev) => ({
      ...prev,
      [teamKey]: {
        ...prev[teamKey],
        name: newName,
      },
    }));
  };

  // Action: Update Strategy Note
  const handleUpdateStrategyNote = (teamKey, note) => {
    setTeams((prev) => ({
      ...prev,
      [teamKey]: {
        ...prev[teamKey],
        strategyNote: note,
      },
    }));
  };

  // Action: Update Submit Authority
  const handleUpdateSubmitAuthority = (teamKey, authority) => {
    setTeams((prev) => ({
      ...prev,
      [teamKey]: {
        ...prev[teamKey],
        submitAuthority: authority,
      },
    }));
  };

  // Draft Mode: Reset Draft
  const handleResetDraft = () => {
    if (!draftCaptainA || !draftCaptainB || draftCaptainA === draftCaptainB) return;
    setTeams({
      teamA: {
        id: 'team_a',
        name: 'Team Alpha',
        captainUsername: draftCaptainA,
        members: [draftCaptainA],
        strategyNote: '',
        isReady: false,
        submitAuthority: 'all',
      },
      teamB: {
        id: 'team_b',
        name: 'Team Beta',
        captainUsername: draftCaptainB,
        members: [draftCaptainB],
        strategyNote: '',
        isReady: false,
        submitAuthority: 'all',
      },
    });
    setDraftTurn('teamA');
    setDraftHistory([
      `Team A designated Captain: @${draftCaptainA}`,
      `Team B designated Captain: @${draftCaptainB}`,
    ]);
  };

  // Draft Mode: Pick player for current captain
  const handleDraftPick = (username) => {
    const activeTeamKey = draftTurn;
    const nextTurn = draftTurn === 'teamA' ? 'teamB' : 'teamA';
    const activeCaptain = teams[activeTeamKey].captainUsername;

    setTeams((prev) => {
      const currentTeam = { ...prev[activeTeamKey] };
      if (!currentTeam.members.includes(username)) {
        currentTeam.members = [...currentTeam.members, username];
      }
      return {
        ...prev,
        [activeTeamKey]: currentTeam,
      };
    });

    setDraftHistory((prev) => [
      ...prev,
      `@${activeCaptain} drafted @${username} to ${teams[activeTeamKey].name}`,
    ]);
    setDraftTurn(nextTurn);
  };

  // Draft Mode: Auto-draft remaining
  const handleAutoDraftRemaining = () => {
    const assigned = new Set([...teams.teamA.members, ...teams.teamB.members]);
    const unpicked = selectedParticipants.filter((p) => !assigned.has(p));
    let cur = draftTurn;
    const newTeamA = [...teams.teamA.members];
    const newTeamB = [...teams.teamB.members];
    const newHistory = [...draftHistory];

    unpicked.forEach((p) => {
      if (cur === 'teamA') {
        newTeamA.push(p);
        newHistory.push(`Auto-picked @${p} to ${teams.teamA.name}`);
        cur = 'teamB';
      } else {
        newTeamB.push(p);
        newHistory.push(`Auto-picked @${p} to ${teams.teamB.name}`);
        cur = 'teamA';
      }
    });

    setTeams((prev) => ({
      ...prev,
      teamA: { ...prev.teamA, members: newTeamA },
      teamB: { ...prev.teamB, members: newTeamB },
    }));
    setDraftTurn(cur);
    setDraftHistory(newHistory);
  };

  // Stage 4: Challenge Configuration state
  const teamASize = teams.teamA?.members?.length || 0;
  const teamBSize = teams.teamB?.members?.length || 0;
  const isUnequalTeams = teamASize !== teamBSize;
  const recommendedCount = useMemo(() => deriveDefaultProblemCount(teamASize, teamBSize), [teamASize, teamBSize]);

  const [problemSource, setProblemSource] = useState(PROBLEM_SOURCES.AUTO);
  const [problemCount, setProblemCount] = useState(() => deriveDefaultProblemCount(2, 2));

  // Sync problem count when recommendedCount changes
  useEffect(() => {
    Promise.resolve().then(() => {
      setProblemCount(recommendedCount);
    });
  }, [recommendedCount]);

  const [difficultyMix, setDifficultyMix] = useState(() => ({
    Easy: 2,
    Medium: 1,
    Hard: 0,
  }));

  // Rebalance difficulty mix when problemCount changes
  useEffect(() => {
    Promise.resolve().then(() => {
      const easy = Math.max(1, Math.floor(problemCount / 2));
      const med = Math.max(1, Math.floor(problemCount / 3));
      const hard = Math.max(0, problemCount - easy - med);
      setDifficultyMix({ Easy: easy, Medium: med, Hard: hard });
    });
  }, [problemCount]);

  const [excludeSolved, setExcludeSolved] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(DEFAULT_TIME_LIMIT_MINUTES);
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('45');
  const [challengeMode, setChallengeMode] = useState(CHALLENGE_MODES.SHARED_POOL);

  // Scoring settings
  const [enableTimeBonus, setEnableTimeBonus] = useState(true);
  const [enableWrongPenalty, setEnableWrongPenalty] = useState(true);
  const [fairnessNormalization, setFairnessNormalization] = useState(() => isUnequalTeams);

  // Auto-activate fairness normalization whenever team sizes differ
  useEffect(() => {
    if (isUnequalTeams) {
      Promise.resolve().then(() => {
        setFairnessNormalization(true);
      });
    }
  }, [isUnequalTeams]);

  // Catalog problems for manual selection
  const catalogProblems = useMemo(() => {
    return getAvailableChallengeProblems({
      participants: selectedParticipants,
      excludeSolved,
      adminUsername: currentUser?.username,
    });
  }, [selectedParticipants, excludeSolved, currentUser]);

  const [manualSelectedProblemIds, setManualSelectedProblemIds] = useState(() => [1, 2, 3]);

  const toggleManualProblem = (probId) => {
    setManualSelectedProblemIds((prev) => {
      if (prev.includes(probId)) {
        return prev.filter((id) => id !== probId);
      } else {
        return [...prev, probId];
      }
    });
  };

  // Assigned mode round-robin preview
  const assignedPreview = useMemo(() => {
    if (challengeMode !== CHALLENGE_MODES.ASSIGNED) return null;
    let probs = [];
    if (problemSource === PROBLEM_SOURCES.MANUAL) {
      probs = catalogProblems.filter((p) => manualSelectedProblemIds.includes(p.id));
    } else {
      probs = autoSelectChallengeProblems({
        count: problemCount,
        difficultyMix,
        participants: selectedParticipants,
        excludeSolved,
        adminUsername: currentUser?.username,
      });
    }
    return {
      teamA: distributeProblemsRoundRobin(probs, teams.teamA.members),
      teamB: distributeProblemsRoundRobin(probs, teams.teamB.members),
    };
  }, [challengeMode, problemSource, catalogProblems, manualSelectedProblemIds, problemCount, difficultyMix, selectedParticipants, excludeSolved, currentUser, teams]);

  // Final Action: Launch Lobby / Start Challenge
  const handleCreateChallenge = () => {
    if (!validation.isValid || !currentUser) return;

    let finalProblems = [];
    if (problemSource === PROBLEM_SOURCES.MANUAL) {
      finalProblems = catalogProblems.filter((p) => manualSelectedProblemIds.includes(p.id));
      if (finalProblems.length === 0) {
        alert('Please select at least 1 problem for manual mode.');
        return;
      }
    } else {
      finalProblems = autoSelectChallengeProblems({
        count: problemCount,
        difficultyMix,
        participants: selectedParticipants,
        excludeSolved,
        adminUsername: currentUser.username,
      });
    }

    const finalTimeLimit = isCustomTime
      ? Math.max(5, Math.min(300, parseInt(customTimeInput, 10) || 30))
      : timeLimitMinutes;

    const res = createChallengeDraft(circle.id, currentUser.username, selectedParticipants, {
      teamSizeMode,
      formationMode,
      teams,
      problemSource,
      problemCount: finalProblems.length,
      difficultyMix,
      excludeSolved,
      timeLimitMinutes: finalTimeLimit,
      mode: challengeMode,
      scoringConfig: {
        pointsPerDifficulty: { Easy: 100, Medium: 200, Hard: 300 },
        timeBonusMaxPoints: 50,
        wrongSubmissionPenalty: 10,
        enableTimeBonus,
        enableWrongPenalty,
        normalizeBySize: fairnessNormalization,
      },
      problems: finalProblems,
    });

    if (res.success && res.challenge) {
      onChallengeCreated?.(res.challenge);
    } else {
      alert(res.error || 'Failed to initialize challenge lobby.');
    }
  };

  // Helper to determine unassigned participants in manual or draft mode
  const unassignedParticipants = useMemo(() => {
    const assigned = new Set([...teams.teamA.members, ...teams.teamB.members]);
    return selectedParticipants.filter((p) => !assigned.has(p));
  }, [selectedParticipants, teams]);

  return (
    <div className="tf-view-container">
      {/* Top Header & Breadcrumb */}
      <div className="tf-top-bar">
        <button type="button" className="cd-back-btn" onClick={onBack} title="Return to circle details">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to Circle</span>
        </button>

        <span className="tf-step-tag">Stage 3 & 4: Team Formation & Challenge Setup</span>
      </div>

      {/* Main Configuration Card */}
      <section className="cd-glass-card tf-hero-card">
        <div className="tf-hero-header">
          <div>
            <h1 className="tf-title">Configure Team Challenge</h1>
            <p className="tf-subtitle">
              Form <strong>Team A</strong> vs <strong>Team B</strong> from {circle.name}&apos;s roster. Designate team captains, set team size rules, and prepare the match lobby.
            </p>
          </div>
        </div>

        {/* STEP 1: PARTICIPANT SELECTION */}
        <div className="tf-section-block">
          <div className="tf-block-header">
            <h2 className="tf-block-title">
              <span className="tf-step-num">1</span>
              Select Match Participants ({selectedParticipants.length}/{allCircleMembers.length})
            </h2>
            <div className="tf-block-actions">
              <button type="button" className="tf-text-btn" onClick={handleSelectAll}>
                Select All
              </button>
              <span className="tf-btn-divider">•</span>
              <button type="button" className="tf-text-btn" onClick={handleDeselectAll}>
                Deselect All
              </button>
            </div>
          </div>

          <div className="tf-participants-grid">
            {allCircleMembers.map((uname) => {
              const rawUser = findUser(uname);
              const dto = buildPublicUserDTO(rawUser || { username: uname }, currentUser?.username);
              const isSelected = selectedParticipants.includes(uname);

              return (
                <div
                  key={uname}
                  className={`tf-participant-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleParticipant(uname)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // handled by card click
                    className="tf-checkbox"
                  />
                  <img
                    src={dto?.photoUrl || '/favicon_brand.png'}
                    alt={uname}
                    className="tf-participant-avatar"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/favicon_brand.png';
                    }}
                  />
                  <div className="tf-participant-info">
                    <span className="tf-participant-name">{dto?.name || uname}</span>
                    <span className="tf-participant-uname">@{uname}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedParticipants.length < MIN_PLAYERS_PER_CIRCLE && (
            <p className="tf-warning-text">
              ⚠️ Minimum {MIN_PLAYERS_PER_CIRCLE} participants required (2 teams × 2 players). Please select at least {MIN_PLAYERS_PER_CIRCLE - selectedParticipants.length} more member(s).
            </p>
          )}
        </div>

        {/* STEP 2: TEAM SIZE MODE */}
        <div className="tf-section-block">
          <div className="tf-block-header">
            <h2 className="tf-block-title">
              <span className="tf-step-num">2</span>
              Team Size Mode
            </h2>
          </div>

          <div className="tf-modes-grid">
            <div
              className={`tf-mode-card ${teamSizeMode === TEAM_SIZE_MODES.BALANCED ? 'active' : ''}`}
              onClick={() => setTeamSizeMode(TEAM_SIZE_MODES.BALANCED)}
            >
              <div className="tf-mode-card-header">
                <span className="tf-mode-icon">⚖️</span>
                <span className="tf-mode-title">Balanced (Default)</span>
              </div>
              <p className="tf-mode-desc">
                Both teams have identical player counts (N vs N). Recommended for competitive matches.
              </p>
              {teamSizeMode === TEAM_SIZE_MODES.BALANCED && selectedParticipants.length % 2 !== 0 && (
                <span className="tf-mode-badge-warn">Odd player count selected</span>
              )}
            </div>

            <div
              className={`tf-mode-card ${teamSizeMode === TEAM_SIZE_MODES.FLEXIBLE ? 'active' : ''}`}
              onClick={() => setTeamSizeMode(TEAM_SIZE_MODES.FLEXIBLE)}
            >
              <div className="tf-mode-card-header">
                <span className="tf-mode-icon">🤼</span>
                <span className="tf-mode-title">Flexible (Unequal Teams)</span>
              </div>
              <p className="tf-mode-desc">
                Teams may differ in size (e.g. 2 vs 3, 3 vs 5). Automatically applies fairness score normalization (average per player).
              </p>
            </div>
          </div>
        </div>

        {/* STEP 3: FORMATION MECHANISM */}
        <div className="tf-section-block">
          <div className="tf-block-header">
            <h2 className="tf-block-title">
              <span className="tf-step-num">3</span>
              Team Formation Mechanism
            </h2>
          </div>

          <div className="tf-subnav-row">
            <button
              type="button"
              className={`tf-subnav-btn ${formationMode === FORMATION_MODES.RANDOM ? 'active' : ''}`}
              onClick={() => {
                setFormationMode(FORMATION_MODES.RANDOM);
                handleRandomSplit();
              }}
            >
              (a) Random Split
            </button>
            <button
              type="button"
              className={`tf-subnav-btn ${formationMode === FORMATION_MODES.MANUAL ? 'active' : ''}`}
              onClick={() => setFormationMode(FORMATION_MODES.MANUAL)}
            >
              (b) Manual Assignment
            </button>
            <button
              type="button"
              className={`tf-subnav-btn ${formationMode === FORMATION_MODES.CAPTAINS_PICK ? 'active' : ''}`}
              onClick={() => setFormationMode(FORMATION_MODES.CAPTAINS_PICK)}
            >
              (c) Captains Pick Alternately
            </button>
          </div>

          {/* MODE A: RANDOM SPLIT ACTION */}
          {formationMode === FORMATION_MODES.RANDOM && (
            <div className="tf-action-bar">
              <button
                type="button"
                className="spherical-btn"
                onClick={handleRandomSplit}
                disabled={selectedParticipants.length < MIN_PLAYERS_PER_CIRCLE}
              >
                🎲 Shuffle & Re-Split Teams
              </button>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                Automatically distributes {selectedParticipants.length} participants and designates initial captains.
              </span>
            </div>
          )}

          {/* MODE C: CAPTAINS PICK INTERACTIVE BOARD */}
          {formationMode === FORMATION_MODES.CAPTAINS_PICK && (
            <div className="tf-draft-board">
              <div className="tf-draft-setup-row">
                <div className="tf-draft-cap-pick">
                  <label className="cd-label">Team A Captain</label>
                  <select
                    className="cd-input"
                    value={draftCaptainA}
                    onChange={(e) => setDraftCaptainA(e.target.value)}
                  >
                    <option value="">Select Captain A...</option>
                    {selectedParticipants.map((u) => (
                      <option key={u} value={u} disabled={u === draftCaptainB}>
                        @{u}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="tf-draft-cap-pick">
                  <label className="cd-label">Team B Captain</label>
                  <select
                    className="cd-input"
                    value={draftCaptainB}
                    onChange={(e) => setDraftCaptainB(e.target.value)}
                  >
                    <option value="">Select Captain B...</option>
                    {selectedParticipants.map((u) => (
                      <option key={u} value={u} disabled={u === draftCaptainA}>
                        @{u}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="spherical-btn spherical-btn-primary"
                  onClick={handleResetDraft}
                  disabled={!draftCaptainA || !draftCaptainB || draftCaptainA === draftCaptainB}
                >
                  Start Live Draft
                </button>
              </div>

              {/* Turn indicator & auto draft */}
              {teams.teamA.captainUsername && teams.teamB.captainUsername && (
                <div className="tf-draft-active-banner">
                  <span className="tf-turn-tag">
                    Current Turn: <strong>{teams[draftTurn].name}</strong> (Captain @{teams[draftTurn].captainUsername})
                  </span>
                  {unassignedParticipants.length > 0 && (
                    <button
                      type="button"
                      className="spherical-btn spherical-btn-sm"
                      onClick={handleAutoDraftRemaining}
                    >
                      ⚡ Auto-Draft Remaining ({unassignedParticipants.length})
                    </button>
                  )}
                </div>
              )}

              {/* Draft pool */}
              {unassignedParticipants.length > 0 ? (
                <div className="tf-draft-pool">
                  <span className="tf-pool-label">Available Players to Draft:</span>
                  <div className="tf-pool-list">
                    {unassignedParticipants.map((u) => (
                      <button
                        key={u}
                        type="button"
                        className="tf-draft-pick-btn"
                        onClick={() => handleDraftPick(u)}
                        title={`Draft @${u} to ${teams[draftTurn].name}`}
                      >
                        + Draft @{u}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="tf-draft-complete-note">
                  ✅ All selected participants have been drafted into teams!
                </p>
              )}

              {/* Draft Log */}
              {draftHistory.length > 0 && (
                <div className="tf-draft-log">
                  <span className="tf-pool-label">Draft History:</span>
                  <ul>
                    {draftHistory.map((entry, idx) => (
                      <li key={idx}>{entry}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* STEP 4: TEAMS DISPLAY & CAPTAIN DESIGNATION */}
        <div className="tf-section-block">
          <div className="tf-block-header">
            <h2 className="tf-block-title">
              <span className="tf-step-num">4</span>
              Team Rosters & Captain Settings
            </h2>
          </div>

          {/* Unassigned Pool for Manual Mode */}
          {formationMode === FORMATION_MODES.MANUAL && unassignedParticipants.length > 0 && (
            <div className="tf-unassigned-panel">
              <span className="tf-pool-label">Unassigned Players Pool ({unassignedParticipants.length}):</span>
              <div className="tf-pool-list">
                {unassignedParticipants.map((u) => (
                  <div key={u} className="tf-pool-player-pill">
                    <span>@{u}</span>
                    <button
                      type="button"
                      className="tf-pill-action"
                      onClick={() => moveMemberToTeam(u, 'teamA')}
                      title="Add to Team A"
                    >
                      + Team A
                    </button>
                    <button
                      type="button"
                      className="tf-pill-action"
                      onClick={() => moveMemberToTeam(u, 'teamB')}
                      title="Add to Team B"
                    >
                      + Team B
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="tf-teams-comparison-grid">
            {/* TEAM A CARD */}
            <div className="tf-team-card tf-team-a">
              <div className="tf-team-card-header">
                <input
                  type="text"
                  className="tf-team-name-input"
                  value={teams.teamA.name}
                  onChange={(e) => handleUpdateTeamName('teamA', e.target.value)}
                  placeholder="Team A Name"
                />
                <span className="tf-team-count-badge">
                  {teams.teamA.members.length} players
                </span>
              </div>

              {/* Captain Badge */}
              <div className="tf-captain-highlight">
                <span className="tf-crown-icon">👑</span>
                <span>Captain: <strong>@{teams.teamA.captainUsername || 'Unassigned'}</strong></span>
              </div>

              {/* Strategy Note */}
              <div className="tf-strategy-box">
                <label className="cd-label" style={{ fontSize: '11.5px' }}>Captain&apos;s Pinned Strategy Note</label>
                <textarea
                  className="cd-input tf-strategy-textarea"
                  placeholder="e.g. Focus on easy problems first, then tackle dynamic programming together!"
                  value={teams.teamA.strategyNote}
                  onChange={(e) => handleUpdateStrategyNote('teamA', e.target.value)}
                  rows={2}
                />
              </div>

              {/* Submit Authority Setting */}
              <div className="tf-submit-auth-row">
                <label className="cd-label" style={{ fontSize: '11.5px' }}>Submission Authority:</label>
                <select
                  className="cd-input tf-auth-select"
                  value={teams.teamA.submitAuthority}
                  onChange={(e) => handleUpdateSubmitAuthority('teamA', e.target.value)}
                >
                  <option value="all">Any teammate can submit</option>
                  <option value="captain_only">Only Captain can finalize submit</option>
                </select>
              </div>

              {/* Members List */}
              <div className="tf-team-members-list">
                {teams.teamA.members.map((u) => {
                  const isCap = (u || '').toLowerCase() === (teams.teamA.captainUsername || '').toLowerCase();
                  return (
                    <div key={u} className="tf-team-member-row">
                      <div className="tf-member-meta">
                        <span className="tf-member-handle">@{u}</span>
                        {isCap && <span className="tf-cap-badge">Captain</span>}
                      </div>

                      <div className="tf-member-row-actions">
                        {!isCap && (
                          <button
                            type="button"
                            className="tf-cap-set-btn"
                            onClick={() => handleSetCaptain('teamA', u)}
                            title="Designate as Captain"
                          >
                            Set Captain
                          </button>
                        )}
                        {formationMode === FORMATION_MODES.MANUAL && (
                          <button
                            type="button"
                            className="tf-remove-btn"
                            onClick={() => removeMemberFromTeams(u)}
                            title="Remove from Team A"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {teams.teamA.members.length === 0 && (
                  <p className="tf-empty-team">No members assigned to Team A yet.</p>
                )}
              </div>
            </div>

            {/* TEAM B CARD */}
            <div className="tf-team-card tf-team-b">
              <div className="tf-team-card-header">
                <input
                  type="text"
                  className="tf-team-name-input"
                  value={teams.teamB.name}
                  onChange={(e) => handleUpdateTeamName('teamB', e.target.value)}
                  placeholder="Team B Name"
                />
                <span className="tf-team-count-badge">
                  {teams.teamB.members.length} players
                </span>
              </div>

              {/* Captain Badge */}
              <div className="tf-captain-highlight">
                <span className="tf-crown-icon">👑</span>
                <span>Captain: <strong>@{teams.teamB.captainUsername || 'Unassigned'}</strong></span>
              </div>

              {/* Strategy Note */}
              <div className="tf-strategy-box">
                <label className="cd-label" style={{ fontSize: '11.5px' }}>Captain&apos;s Pinned Strategy Note</label>
                <textarea
                  className="cd-input tf-strategy-textarea"
                  placeholder="e.g. Split questions: member A takes arrays, member B takes strings."
                  value={teams.teamB.strategyNote}
                  onChange={(e) => handleUpdateStrategyNote('teamB', e.target.value)}
                  rows={2}
                />
              </div>

              {/* Submit Authority Setting */}
              <div className="tf-submit-auth-row">
                <label className="cd-label" style={{ fontSize: '11.5px' }}>Submission Authority:</label>
                <select
                  className="cd-input tf-auth-select"
                  value={teams.teamB.submitAuthority}
                  onChange={(e) => handleUpdateSubmitAuthority('teamB', e.target.value)}
                >
                  <option value="all">Any teammate can submit</option>
                  <option value="captain_only">Only Captain can finalize submit</option>
                </select>
              </div>

              {/* Members List */}
              <div className="tf-team-members-list">
                {teams.teamB.members.map((u) => {
                  const isCap = (u || '').toLowerCase() === (teams.teamB.captainUsername || '').toLowerCase();
                  return (
                    <div key={u} className="tf-team-member-row">
                      <div className="tf-member-meta">
                        <span className="tf-member-handle">@{u}</span>
                        {isCap && <span className="tf-cap-badge">Captain</span>}
                      </div>

                      <div className="tf-member-row-actions">
                        {!isCap && (
                          <button
                            type="button"
                            className="tf-cap-set-btn"
                            onClick={() => handleSetCaptain('teamB', u)}
                            title="Designate as Captain"
                          >
                            Set Captain
                          </button>
                        )}
                        {formationMode === FORMATION_MODES.MANUAL && (
                          <button
                            type="button"
                            className="tf-remove-btn"
                            onClick={() => removeMemberFromTeams(u)}
                            title="Remove from Team B"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {teams.teamB.members.length === 0 && (
                  <p className="tf-empty-team">No members assigned to Team B yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* STEP 5: CHALLENGE & PROBLEM CONFIGURATION */}
        <div className="tf-section-block">
          <div className="tf-block-header">
            <h2 className="tf-block-title">
              <span className="tf-step-num">5</span>
              Challenge &amp; Problem Configuration
            </h2>
          </div>

          {/* Problem Source Selection */}
          <div className="tf-config-card">
            <label className="cd-label">Problem Selection Source</label>
            <div className="tf-source-tabs">
              <button
                type="button"
                className={`tf-source-tab ${problemSource === PROBLEM_SOURCES.AUTO ? 'active' : ''}`}
                onClick={() => setProblemSource(PROBLEM_SOURCES.AUTO)}
              >
                ⚡ Auto-Select (Smart Solved Exclusion)
              </button>
              <button
                type="button"
                className={`tf-source-tab ${problemSource === PROBLEM_SOURCES.MANUAL ? 'active' : ''}`}
                onClick={() => setProblemSource(PROBLEM_SOURCES.MANUAL)}
              >
                📋 Manual Selection ({manualSelectedProblemIds.length} chosen)
              </button>
            </div>

            {/* AUTO-SELECT CONTROLS */}
            {problemSource === PROBLEM_SOURCES.AUTO ? (
              <div className="tf-auto-select-panel">
                <div className="tf-cfg-row">
                  <div className="tf-cfg-field">
                    <label className="cd-label">
                      Number of Problems: <strong>{problemCount}</strong>
                    </label>
                    <div className="tf-counter-wrap">
                      <button
                        type="button"
                        className="tf-counter-btn"
                        onClick={() => setProblemCount((prev) => Math.max(1, prev - 1))}
                        disabled={problemCount <= 1}
                      >
                        -
                      </button>
                      <span className="tf-counter-val">{problemCount}</span>
                      <button
                        type="button"
                        className="tf-counter-btn"
                        onClick={() => setProblemCount((prev) => Math.min(10, prev + 1))}
                        disabled={problemCount >= 10}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="tf-recommend-chip"
                        onClick={() => setProblemCount(recommendedCount)}
                        title="Reset to recommended count based on team sizes"
                      >
                        Recommended: {recommendedCount}
                      </button>
                    </div>
                  </div>

                  <div className="tf-cfg-field">
                    <label className="cd-label">Difficulty Distribution Mix</label>
                    <div className="tf-diff-mix-row">
                      <div className="tf-diff-badge-pill easy">
                        <span>Easy:</span>
                        <input
                          type="number"
                          min="0"
                          max={problemCount}
                          className="tf-diff-num-input"
                          value={difficultyMix.Easy}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setDifficultyMix((prev) => ({ ...prev, Easy: val }));
                          }}
                        />
                      </div>
                      <div className="tf-diff-badge-pill medium">
                        <span>Medium:</span>
                        <input
                          type="number"
                          min="0"
                          max={problemCount}
                          className="tf-diff-num-input"
                          value={difficultyMix.Medium}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setDifficultyMix((prev) => ({ ...prev, Medium: val }));
                          }}
                        />
                      </div>
                      <div className="tf-diff-badge-pill hard">
                        <span>Hard:</span>
                        <input
                          type="number"
                          min="0"
                          max={problemCount}
                          className="tf-diff-num-input"
                          value={difficultyMix.Hard}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setDifficultyMix((prev) => ({ ...prev, Hard: val }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exclude Solved Checkbox */}
                <div className="tf-exclude-box">
                  <label className="tf-checkbox-label">
                    <input
                      type="checkbox"
                      checked={excludeSolved}
                      onChange={(e) => setExcludeSolved(e.target.checked)}
                      className="tf-checkbox"
                    />
                    <div>
                      <strong>Exclude problems solved by any participant</strong>
                      <span className="tf-hint-text">
                        Scans solved history of all {selectedParticipants.length} players to guarantee unbiased, fresh challenges.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              /* MANUAL PICK CONTROLS */
              <div className="tf-manual-select-panel">
                <div className="tf-manual-header">
                  <span className="tf-manual-count">
                    Selected <strong>{manualSelectedProblemIds.length}</strong> problem(s) from catalog:
                  </span>
                  <label className="tf-checkbox-label" style={{ fontSize: '12px' }}>
                    <input
                      type="checkbox"
                      checked={excludeSolved}
                      onChange={(e) => setExcludeSolved(e.target.checked)}
                      className="tf-checkbox"
                    />
                    <span>Hide problems solved by participants</span>
                  </label>
                </div>

                <div className="tf-catalog-list">
                  {catalogProblems.map((prob) => {
                    const isPicked = manualSelectedProblemIds.includes(prob.id);
                    const diffClass = (prob.difficulty || 'Easy').toLowerCase();
                    return (
                      <div
                        key={prob.id}
                        className={`tf-catalog-item ${isPicked ? 'picked' : ''}`}
                        onClick={() => toggleManualProblem(prob.id)}
                      >
                        <input
                          type="checkbox"
                          checked={isPicked}
                          onChange={() => {}}
                          className="tf-checkbox"
                        />
                        <div className="tf-cat-info">
                          <div className="tf-cat-title-row">
                            <span className="tf-cat-title">{prob.title}</span>
                            <span className={`tf-diff-tag ${diffClass}`}>{prob.difficulty}</span>
                            <span className="tf-cat-category">{prob.category}</span>
                          </div>
                          <p className="tf-cat-desc">{prob.description?.substring(0, 110)}...</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Time Limit & Mode Grid */}
          <div className="tf-time-mode-grid">
            {/* TIME LIMIT */}
            <div className="tf-config-card">
              <label className="cd-label">Match Time Limit</label>
              <div className="tf-preset-chips">
                {TIME_LIMIT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`tf-preset-chip ${!isCustomTime && timeLimitMinutes === preset ? 'active' : ''}`}
                    onClick={() => {
                      setIsCustomTime(false);
                      setTimeLimitMinutes(preset);
                    }}
                  >
                    {preset}m {preset === 30 && <span className="tf-def-pill">Default</span>}
                  </button>
                ))}
                <button
                  type="button"
                  className={`tf-preset-chip ${isCustomTime ? 'active' : ''}`}
                  onClick={() => setIsCustomTime(true)}
                >
                  Custom
                </button>
              </div>

              {isCustomTime && (
                <div className="tf-custom-time-row">
                  <input
                    type="number"
                    min="5"
                    max="300"
                    className="cd-input tf-custom-time-input"
                    value={customTimeInput}
                    onChange={(e) => setCustomTimeInput(e.target.value)}
                    placeholder="Minutes"
                  />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>minutes (5 - 300)</span>
                </div>
              )}
            </div>

            {/* COMPETITION MODE */}
            <div className="tf-config-card">
              <label className="cd-label">Challenge Competition Mode</label>
              <div className="tf-mode-toggle-row">
                <div
                  className={`tf-mode-toggle-card ${challengeMode === CHALLENGE_MODES.SHARED_POOL ? 'active' : ''}`}
                  onClick={() => setChallengeMode(CHALLENGE_MODES.SHARED_POOL)}
                >
                  <div className="tf-mode-toggle-hdr">
                    <span>🌐 Shared Problem Pool (Default)</span>
                  </div>
                  <p className="tf-mode-toggle-desc">
                    All problems are open to all players. First team to submit an accepted solution claims the points.
                  </p>
                </div>

                <div
                  className={`tf-mode-toggle-card ${challengeMode === CHALLENGE_MODES.ASSIGNED ? 'active' : ''}`}
                  onClick={() => setChallengeMode(CHALLENGE_MODES.ASSIGNED)}
                >
                  <div className="tf-mode-toggle-hdr">
                    <span>🎯 Assigned Mode</span>
                  </div>
                  <p className="tf-mode-toggle-desc">
                    Problems are distributed across teammates via round-robin distribution to test team coordination.
                  </p>
                </div>
              </div>

              {/* Assigned mode preview */}
              {challengeMode === CHALLENGE_MODES.ASSIGNED && assignedPreview && (
                <div className="tf-assigned-preview-box">
                  <span className="tf-pool-label">Round-Robin Assignment Preview:</span>
                  <div className="tf-assigned-grid">
                    <div className="tf-assigned-team-col">
                      <strong style={{ color: '#f87171' }}>{teams.teamA.name}</strong>
                      {Object.entries(assignedPreview.teamA).map(([uname, pList]) => (
                        <div key={uname} className="tf-assigned-player-row">
                          <span>@{uname}:</span>
                          <em>{pList.map((p) => p.title).join(', ') || 'No problems'}</em>
                        </div>
                      ))}
                    </div>
                    <div className="tf-assigned-team-col">
                      <strong style={{ color: '#60a5fa' }}>{teams.teamB.name}</strong>
                      {Object.entries(assignedPreview.teamB).map(([uname, pList]) => (
                        <div key={uname} className="tf-assigned-player-row">
                          <span>@{uname}:</span>
                          <em>{pList.map((p) => p.title).join(', ') || 'No problems'}</em>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scoring & Fairness Rules */}
          <div className="tf-config-card">
            <div className="tf-scoring-header">
              <label className="cd-label">Scoring Formula &amp; Fairness Settings</label>
              <div className="tf-scoring-chips">
                <span className="tf-score-chip easy">Easy: 100 pts</span>
                <span className="tf-score-chip medium">Medium: 200 pts</span>
                <span className="tf-score-chip hard">Hard: 300 pts</span>
              </div>
            </div>

            <div className="tf-scoring-toggles-grid">
              <label className="tf-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableTimeBonus}
                  onChange={(e) => setEnableTimeBonus(e.target.checked)}
                  className="tf-checkbox"
                />
                <div>
                  <strong>Speed Time Bonus</strong>
                  <span className="tf-hint-text">
                    Awards up to +50 bonus points proportional to remaining match time when solved.
                  </span>
                </div>
              </label>

              <label className="tf-checkbox-label">
                <input
                  type="checkbox"
                  checked={enableWrongPenalty}
                  onChange={(e) => setEnableWrongPenalty(e.target.checked)}
                  className="tf-checkbox"
                />
                <div>
                  <strong>Wrong Submission Penalty</strong>
                  <span className="tf-hint-text">
                    Deducts 10 pts per failed test submission (minimum score guaranteed).
                  </span>
                </div>
              </label>
            </div>

            {/* Fairness Normalization Section */}
            <div className={`tf-fairness-box ${isUnequalTeams ? 'auto-active' : ''}`}>
              <label className="tf-checkbox-label">
                <input
                  type="checkbox"
                  checked={fairnessNormalization}
                  onChange={(e) => setFairnessNormalization(e.target.checked)}
                  className="tf-checkbox"
                />
                <div>
                  <strong>Fairness Score Normalization (Average Score per Player)</strong>
                  <span className="tf-hint-text">
                    Calculates final team score as <code>total points ÷ player count</code> so teams with unequal sizes compete fairly.
                  </span>
                </div>
              </label>

              {isUnequalTeams && (
                <div className="tf-fairness-banner">
                  <span className="tf-fairness-icon">⚖️</span>
                  <span>
                    <strong>Fairness Normalization Active:</strong> Team Alpha has {teamASize} players and Team Beta has {teamBSize} players. To ensure balanced competition, the final match winner will be determined by average score per player.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* VALIDATION & FINAL ACTION FOOTER */}
        <div className="tf-footer-panel">
          <div className="tf-validation-box">
            {validation.isValid ? (
              <div className="tf-valid-badge">
                <span className="tf-valid-icon">✓</span>
                <span>Team formation is valid and complies with all challenge rules!</span>
              </div>
            ) : (
              <div className="tf-invalid-box">
                <span className="tf-invalid-title">Validation requirements:</span>
                <ul>
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="tf-footer-actions">
            <button type="button" className="spherical-btn" onClick={onBack}>
              Cancel
            </button>
            <button
              type="button"
              className="spherical-btn spherical-btn-primary tf-launch-btn"
              disabled={!validation.isValid}
              onClick={handleCreateChallenge}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Launch Match Lobby</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
