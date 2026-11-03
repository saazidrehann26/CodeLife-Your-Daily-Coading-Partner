import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getTodaysChallenge,
  generateBarGraphData,
  getUserStreakData,
  recordProblemSolved,
  getCodeStoreProblems,
  addCodeStoreProblem,
  updateCodeStoreProblem,
  deleteCodeStoreProblem,
  getRecentProblems,
  getUserProfile,
  saveUserProfile,
  getActiveUser,
  getFileExtension,
} from '../services/dashboardService';
import './DashboardPage.css';
import OnlineCompiler from './OnlineCompiler';

/**
 * Three selectable language options for the Practice Area with official white logos
 */
const PRACTICE_LANGUAGES = [
  {
    id: 'C',
    name: 'C',
    logo: '/c_logo_white.png',
  },
  {
    id: 'C++',
    name: 'C++',
    logo: '/cpp_logo_white.png',
  },
  {
    id: 'Python',
    name: 'Python',
    logo: '/python_logo_white.png',
  },
];

/**
 * Main Platform Dashboard Component
 * Implements the user's 3-column / glass layout with:
 * - Circular CodeLife Logo + Bell MT Brand Text
 * - Welcome note with User's 2nd name in Bell MT font
 * - Recent Problems (latest 2 from Code Store)
 * - Today's Challenge (Stateless Date-Math Algorithm)
 * - Daily Coding Streak Counter & Rules Engine
 * - Audio-Spectrum Activity Bar Graph (proportional heights algorithm)
 * - Code Store with (+) Add Modal, language, problem name, file path, date/time
 * - Settings (Reset Password & Personal Details Window)
 * - User Profile Modal
 * - Practice Area with 3 Language Options (C, C++, Python) and Interactive Arena
 * - Tactile separated spherical buttons & glass styling
 */
export default function DashboardPage({ currentUser, onNavigate, onSignOut }) {
  // Current active user session (from props or storage)
  const activeUserSession = useMemo(
    () => currentUser || getActiveUser() || { name: 'Coder', username: 'coder' },
    [currentUser]
  );

  const [profileOverride, setProfileOverride] = useState(null);
  const profile = useMemo(() => {
    if (profileOverride && profileOverride.username === activeUserSession.username) {
      return profileOverride;
    }
    return getUserProfile(activeUserSession);
  }, [profileOverride, activeUserSession]);

  // Reactive triggers for Code Store and Streak updates
  const [streakTrigger, setStreakTrigger] = useState(0);
  const [codeStoreTrigger, setCodeStoreTrigger] = useState(0);

  const streakData = useMemo(() => {
    return getUserStreakData(profile.username, streakTrigger);
  }, [profile.username, streakTrigger]);

  const recentProblems = useMemo(() => {
    return getRecentProblems(profile.username, codeStoreTrigger);
  }, [profile.username, codeStoreTrigger]);

  const allStoredCodes = useMemo(() => {
    return getCodeStoreProblems(profile.username, codeStoreTrigger);
  }, [profile.username, codeStoreTrigger]);

  // Today's Challenge calculated via Stateless Date-Math Algorithm from Code Store
  const todaysChallenge = useMemo(() => {
    return getTodaysChallenge(profile.username, streakTrigger + codeStoreTrigger);
  }, [profile.username, streakTrigger, codeStoreTrigger]);
  const [todaySolvedSuccess, setTodaySolvedSuccess] = useState(false);

  // Active Modals: null | 'code_store' | 'add_code' | 'settings' | 'personal_details' | 'profile' | 'practice_area' | 'view_code'
  const [activeModal, setActiveModal] = useState(null);
  const [viewingCodeProblem, setViewingCodeProblem] = useState(null);

  // Practice Area State (3 Languages: C, C++, Python)
  const [practiceLanguage, setPracticeLanguage] = useState(null);
  const [practiceView, setPracticeView] = useState('picker'); // 'picker' | 'c_compiler'

  // Add Code Form State
  const [newProblemName, setNewProblemName] = useState('');
  const [newLanguage, setNewLanguage] = useState('Python');
  const [newCodeContent, setNewCodeContent] = useState('');
  const [codeStoreToast, setCodeStoreToast] = useState(null);
  const [settingsToast, setSettingsToast] = useState(null);
  const [personalDetailsToast, setPersonalDetailsToast] = useState(null);
  const [isPersonalDetailsSaved, setIsPersonalDetailsSaved] = useState(false);
  const [personalDetailsSource, setPersonalDetailsSource] = useState('settings');

  // Code Store Navigation & Search (3 Files: C File, C++ File, Python File + In-File Search Button)
  const [activeFileTab, setActiveFileTab] = useState('all'); // 'all' | 'C' | 'C++' | 'Python'
  const [codeStoreSearchInput, setCodeStoreSearchInput] = useState('');
  const [codeStoreSearchQuery, setCodeStoreSearchQuery] = useState('');

  const handleExecuteCodeStoreSearch = () => {
    setCodeStoreSearchQuery(codeStoreSearchInput.trim());
  };

  const handleClearCodeStoreSearch = () => {
    setCodeStoreSearchInput('');
    setCodeStoreSearchQuery('');
  };

  // Open modal with browser history push/replace so Back button returns cleanly without loops
  const openModal = useCallback((modalName, extraState = {}, replaceHistory = false) => {
    setActiveModal(modalName);
    if (extraState.practiceView !== undefined) setPracticeView(extraState.practiceView);
    if (extraState.practiceLanguage !== undefined) {
      setPracticeLanguage(extraState.practiceLanguage);
    } else if (modalName === 'practice_area' && (extraState.practiceView === 'picker' || !extraState.practiceView)) {
      // Never pre-select any language when opening the Practice Area picker
      setPracticeLanguage(null);
    }
    if (extraState.viewingProblem !== undefined) setViewingCodeProblem(extraState.viewingProblem);

    if (typeof window !== 'undefined') {
      let hashTag = '#dashboard';
      if (modalName === 'practice_area') {
        const lang = extraState.practiceLanguage || practiceLanguage || 'cpp';
        hashTag = extraState.practiceView === 'compiler'
          ? `#compiler-${lang.toLowerCase().replace(/\+/g, 'p')}`
          : '#practice-area';
      } else if (modalName === 'code_store') {
        hashTag = '#code-store';
      } else if (modalName === 'view_code') {
        hashTag = '#compiler-view';
      } else if (modalName === 'add_code') {
        hashTag = '#add-code';
      } else if (modalName === 'settings') {
        hashTag = '#settings';
      } else if (modalName === 'personal_details') {
        hashTag = '#personal-details';
      } else if (modalName === 'profile') {
        hashTag = '#profile';
      }

      const historyPayload = {
        page: 'dashboard',
        modal: modalName,
        practiceView: extraState.practiceView || (modalName === 'practice_area' ? 'picker' : undefined),
        practiceLanguage: extraState.practiceLanguage !== undefined ? extraState.practiceLanguage : practiceLanguage,
        problemId: extraState.viewingProblem?.id,
      };

      if (replaceHistory) {
        window.history.replaceState(historyPayload, '', hashTag);
      } else {
        window.history.pushState(historyPayload, '', hashTag);
      }
    }
  }, [practiceLanguage]);

  // Close modal or return to previous modal/dashboard without getting stuck in a history loop
  const closeModal = useCallback((fallbackTarget = null) => {
    if (fallbackTarget) {
      // Transition back cleanly using replaceState so we don't accumulate ping-pong history
      openModal(fallbackTarget, {}, true);
    } else {
      setActiveModal(null);
      setPracticeView('picker');
      setPracticeLanguage(null);
      setViewingCodeProblem(null);
      if (typeof window !== 'undefined') {
        window.history.replaceState({ page: 'dashboard', modal: null }, '', '#dashboard');
      }
    }
  }, [openModal]);

  // Helper to open Add Code modal with optional prefilled data (reserved for direct open)
  const _handleOpenAddCodeModal = (initialData = {}) => {
    setNewProblemName(initialData.problemName || '');
    setNewLanguage(initialData.language || 'Python');
    setNewCodeContent(initialData.code || '');
    setCodeStoreToast(null);
    openModal('add_code');
  };

  // Personal Details Edit Form State
  const [editFullName, setEditFullName] = useState(profile.fullName || '');
  const [editAge, setEditAge] = useState(profile.age || '');
  const [editInterest, setEditInterest] = useState(profile.interest || '');
  const [editInstitution, setEditInstitution] = useState(profile.institution || profile.classGrade || '');
  const [editBio, setEditBio] = useState(profile.bio || '');

  // Open Personal Details edit modal with current profile values
  const handleOpenPersonalDetails = (source = 'settings') => {
    setPersonalDetailsSource(source);
    setPersonalDetailsToast(null);
    setIsPersonalDetailsSaved(false);
    setEditFullName(profile.fullName || '');
    setEditAge(profile.age || '');
    setEditInterest(profile.interest || '');
    setEditInstitution(profile.institution || profile.classGrade || '');
    setEditBio(profile.bio || '');
    openModal('personal_details');
  };

  // Audio-Spectrum Bar Graph Data (Last 30 Days)
  const barGraphData = useMemo(() => {
    return generateBarGraphData(streakData.submissionDates || [], 30);
  }, [streakData.submissionDates]);

  // Derive 2nd name from user's full name (e.g., "John Doe" -> "Doe")
  const secondName = useMemo(() => {
    if (!profile.fullName) return 'Coder';
    const parts = profile.fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  }, [profile.fullName]);

  // Filtered Stored Codes (inside active file tab, filtered by problem name search)
  const filteredStoredCodes = useMemo(() => {
    let list = allStoredCodes;
    if (activeFileTab !== 'all') {
      list = list.filter(
        (c) => (c.language || '').toLowerCase() === activeFileTab.toLowerCase()
      );
    }
    const q = codeStoreSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        (c.problemName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allStoredCodes, activeFileTab, codeStoreSearchQuery]);

  const cFileCount = useMemo(
    () => allStoredCodes.filter((c) => (c.language || '').toLowerCase() === 'c').length,
    [allStoredCodes]
  );
  const cppFileCount = useMemo(
    () => allStoredCodes.filter((c) => (c.language || '').toLowerCase() === 'c++').length,
    [allStoredCodes]
  );
  const pythonFileCount = useMemo(
    () => allStoredCodes.filter((c) => (c.language || '').toLowerCase() === 'python').length,
    [allStoredCodes]
  );

  // Handle Mark Today's Challenge as Solved (increases day & problem count)
  const handleSolveChallenge = useCallback(() => {
    if (!todaysChallenge) return;
    recordProblemSolved(profile.username, todaysChallenge.id);
    setStreakTrigger((t) => t + 1);
    setTodaySolvedSuccess(true);
    setTimeout(() => setTodaySolvedSuccess(false), 4000);
  }, [profile.username, todaysChallenge]);

  // Handle Add New Code to Store (only problem name and language, no location)
  const handleSaveNewCode = (e) => {
    e.preventDefault();
    if (!newProblemName.trim()) {
      setCodeStoreToast('Please provide a problem name.');
      return;
    }

    const saved = addCodeStoreProblem(profile.username, {
      problemName: newProblemName.trim(),
      language: newLanguage,
      code: newCodeContent || `// ${newProblemName} solution in ${newLanguage}\n`,
    });

    // Refresh triggers to immediately update recent problems, stored codes & streak
    setCodeStoreTrigger((t) => t + 1);
    setStreakTrigger((t) => t + 1);

    // Reset form
    setNewProblemName('');
    setNewCodeContent('');
    setCodeStoreToast(`Problem "${saved.problemName}" successfully saved to Code Store!`);
    setTimeout(() => {
      setCodeStoreToast(null);
      openModal('code_store');
    }, 1000);
  };

  // Handle Personal Details Save (User remains on Personal Details page)
  const handleSavePersonalDetails = (e) => {
    e.preventDefault();
    const updatedProfile = saveUserProfile(profile.username, {
      ...profile,
      fullName: editFullName.trim() || profile.fullName,
      age: editAge ? Number(editAge) : '',
      age_customized: Boolean(editAge),
      interest: editInterest.trim(),
      institution: editInstitution.trim(),
      classGrade: editInstitution.trim(),
      bio: editBio.trim(),
    });

    setProfileOverride(updatedProfile);
    setIsPersonalDetailsSaved(true);
    setPersonalDetailsToast('✓ Personal details saved successfully!');
    setSettingsToast('✓ Personal details saved successfully!');
    setTimeout(() => {
      setIsPersonalDetailsSaved(false);
      setPersonalDetailsToast(null);
      setSettingsToast(null);
    }, 3500);
    // User remains on the personal details page - does not redirect or close
  };

  // Handle Practice Area Language Selection (launches compiler for C, C++, or Python)
  const handleSelectPracticeLanguage = (langId) => {
    setPracticeLanguage(langId);
    setPracticeView('compiler');

    if (typeof window !== 'undefined') {
      const langSlug = langId.toLowerCase().replace(/\+/g, 'p');
      window.history.pushState(
        {
          page: 'dashboard',
          modal: 'practice_area',
          practiceView: 'compiler',
          practiceLanguage: langId,
        },
        '',
        `#compiler-${langSlug}`
      );
    }
  };

  // Handle Save Code from Online Compiler -> Directly saves to Code Store and keeps user on compiler window
  const handleSaveCompilerCode = (payload) => {
    let problemName = 'Practice Problem';
    let location = 'Practice Area';
    let language = practiceLanguage || 'C++';
    let code = '';

    if (payload && typeof payload === 'object') {
      problemName = payload.problemName || problemName;
      location = payload.location || location;
      language = payload.language || language;
      code = payload.code || '';
    } else if (typeof payload === 'string') {
      code = payload;
    }

    const saved = addCodeStoreProblem(profile.username, {
      problemName,
      location,
      filePath: location,
      language,
      code,
    });

    // Refresh live counters, streak, and stored problems in background
    setCodeStoreTrigger((t) => t + 1);
    setStreakTrigger((t) => t + 1);

    // NOTE: User remains on the compiler window without interruption
    return saved;
  };

  // Handle Delete Problem from Code Store
  const handleDeleteCode = (problemId, problemName) => {
    if (!window.confirm(`Are you sure you want to delete "${problemName}" from your Code Store?`)) {
      return;
    }
    deleteCodeStoreProblem(profile.username, problemId);
    setCodeStoreTrigger((t) => t + 1);
    if (viewingCodeProblem?.id === problemId) {
      setViewingCodeProblem(null);
      closeModal('code_store');
    }
  };

  // Handle Save Updates to an Existing Problem in Code Store (keeps user on compiler)
  const handleUpdateStoredCode = (problemIdOrCode, maybeCode) => {
    let problemId = null;
    let updatedCode = '';

    if (typeof maybeCode === 'string') {
      problemId = problemIdOrCode;
      updatedCode = maybeCode;
    } else if (typeof problemIdOrCode === 'string' && maybeCode) {
      updatedCode = problemIdOrCode;
      problemId = maybeCode;
    } else {
      updatedCode = problemIdOrCode;
      problemId = viewingCodeProblem?.id;
    }

    if (!problemId) return null;

    const updated = updateCodeStoreProblem(profile.username, problemId, {
      code: updatedCode,
    });
    if (updated) {
      if (viewingCodeProblem?.id === problemId) {
        setViewingCodeProblem(updated);
      }
    }
    setCodeStoreTrigger((t) => t + 1);
    return updated;
  };

  // Synchronize browser backward and forward navigation with Dashboard modals
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!window.history.state || window.history.state.page !== 'dashboard') {
        window.history.replaceState(
          { page: 'dashboard', modal: null },
          '',
          '#dashboard'
        );
      }
    }

    const handleDashboardPopState = (e) => {
      const state = e.state;
      if (!state || state.page === 'dashboard') {
        const targetModal = state?.modal || null;
        const targetPracticeView = state?.practiceView || 'picker';
        const targetLang = state?.practiceLanguage;
        const targetProblemId = state?.problemId;

        setActiveModal(targetModal);
        setPracticeView(targetPracticeView);
        if (targetLang) {
          setPracticeLanguage(targetLang);
        }

        if (targetProblemId) {
          const found = allStoredCodes.find((p) => p.id === targetProblemId);
          if (found) setViewingCodeProblem(found);
        } else if (targetModal !== 'view_code') {
          setViewingCodeProblem(null);
        }
      }
    };

    window.addEventListener('popstate', handleDashboardPopState);
    return () => {
      window.removeEventListener('popstate', handleDashboardPopState);
    };
  }, [allStoredCodes]);

  return (
    <div className="dashboard-wrapper">
      {/* =====================================================================
          1. TOP HORIZONTAL NAVIGATION BAR
          ===================================================================== */}
      <header className="dash-navbar">
        {/* Brand: Circular CodeLife Logo + Bell MT Text */}
        <div className="dash-brand-wrap" onClick={() => closeModal()}>
          <div className="dash-brand-logo-frame">
            <img
              src="/codelife_logo_white_bg.png"
              alt="CodeLife Circular Logo"
              className="dash-brand-logo-img"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/company_logo_clean.png';
              }}
            />
          </div>
          <span className="dash-brand-title">CodeLife</span>
        </div>

        {/* Top Navbar Right Controls: User Profile Pill */}
        <div className="dash-nav-links">
          {/* Authenticated User Profile Pill */}
          <div
            className="dash-user-pill"
            onClick={() => openModal('profile')}
            style={{ cursor: 'pointer' }}
            title="View User Profile"
          >
            <span className="dash-user-name">{profile.fullName}</span>
          </div>
        </div>
      </header>

      {/* =====================================================================
          2. DASHBOARD MAIN 3-COLUMN LAYOUT
          ===================================================================== */}
      <main className="dash-container">
        <div className="dash-3col-grid">
          
          {/* =================================================================
              COLUMN 1 (LEFT): NAVIGATION SIDEBAR & PROFILE CARD
              ================================================================= */}
          <aside className="dash-sidebar">
            {/* User Profile Card (Kept above navigation bar) */}
            <div
              className="dash-glass-card sidebar-user-card"
              onClick={() => openModal('profile')}
              title="Click to view full user profile"
            >
              <h3 className="sidebar-user-fullname">{profile.fullName}</h3>
              <span className="sidebar-user-handle">@{profile.username}</span>
              {profile.institution || profile.classGrade ? (
                <span className="sidebar-user-badge">{profile.institution || profile.classGrade}</span>
              ) : null}

              <button
                type="button"
                className="spherical-btn spherical-btn-sm sidebar-user-profile-btn"
                style={{ marginTop: '8px', width: '100%' }}
                onClick={(e) => {
                  e.stopPropagation();
                  openModal('profile');
                }}
              >
                View Profile
              </button>
            </div>

            {/* Quick Navigation Menu Card */}
            <div className="dash-glass-card sidebar-menu-card">
              <button
                type="button"
                className="sidebar-nav-btn"
                onClick={() => openModal('practice_area', { practiceView: 'picker', practiceLanguage: null })}
              >
                <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                <span>Practice Area</span>
              </button>

              <button
                type="button"
                className="sidebar-nav-btn"
                onClick={() => openModal('code_store')}
              >
                <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>Code Store</span>
              </button>

              <button
                type="button"
                className="sidebar-nav-btn"
                onClick={() => openModal('settings')}
              >
                <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Settings</span>
              </button>
            </div>
          </aside>

          {/* =================================================================
              COLUMN 2 (CENTER): WELCOME NOTE, RECENT PROBLEMS, TODAY'S CHALLENGE
              ================================================================= */}
          <section className="dash-center-col">
            
            {/* Welcome Note in Bell MT font */}
            <div className="dash-glass-card welcome-banner">
              <h1 className="welcome-title">Welcome, {secondName}</h1>
            </div>

            {/* Recent Problems Section (Latest 2 problems added in Code Store) */}
            <div className="dash-glass-card">
              <div className="section-header-row">
                <h2 className="section-heading">
                  <span className="section-heading-dot" />
                  Recent Problems
                </h2>
              </div>

              {recentProblems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#ffffff' }}>
                  No stored problems in Code Store yet. Store your first code using "+ Add New Code" above to unlock Recent Problems
                </div>
              ) : (
                <div className="recent-problems-grid">
                  {recentProblems.map((prob) => (
                    <div key={prob.id} className="recent-problem-card">
                      <div className="problem-card-top">
                        <div>
                          <h3 className="problem-title">{prob.problemName}</h3>
                        </div>
                        <span className="problem-lang-badge">{prob.language}</span>
                      </div>

                      <div className="problem-footer-row">
                        <span className="problem-date-text">{prob.formattedDateTime}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="spherical-btn spherical-btn-sm"
                            onClick={() => openModal('view_code', { viewingProblem: prob })}
                          >
                            View Code
                          </button>
                          <button
                            type="button"
                            className="spherical-btn spherical-btn-sm delete-code-btn"
                            onClick={() => handleDeleteCode(prob.id, prob.problemName)}
                            title={`Delete "${prob.problemName}"`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Today's Challenge Section */}
            <div className="dash-glass-card challenge-card">
              <div className="section-header-row">
                <h2 className="section-heading">
                  <span className="section-heading-dot" />
                  Today's Challenge
                </h2>
                {allStoredCodes.length > 0 && todaysChallenge && (
                  <div className="date-math-badge" title="Stateless Date-Math Algorithm index">
                    {todaysChallenge.isPracticeStarted
                      ? `Day ${todaysChallenge.dayNumber} • ${todaysChallenge.dateString || 'Today'}`
                      : `Day 0 • Practice Not Started`}
                  </div>
                )}
              </div>

              {allStoredCodes.length === 0 || !todaysChallenge ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#ffffff' }}>
                  No stored problems in Code Store yet. Store your first code using "+ Add New Code" above to unlock Today's Challenge!
                </div>
              ) : (
                <>
                  <div className="challenge-top-meta">
                    <div className="challenge-badges">
                      <span
                        className={`difficulty-pill ${
                          todaysChallenge.difficulty === 'Easy'
                            ? 'diff-easy'
                            : todaysChallenge.difficulty === 'Medium'
                            ? 'diff-medium'
                            : 'diff-hard'
                        }`}
                      >
                        {todaysChallenge.difficulty}
                      </span>
                      {todaysChallenge.language && (
                        <span className="problem-lang-badge" style={{ fontSize: '11.5px', padding: '4px 12px' }}>
                          {todaysChallenge.language}
                        </span>
                      )}
                      <span className="category-tag">{todaysChallenge.category}</span>
                      {(todaysChallenge.tags || []).map((t) => (
                        <span key={t} className="category-tag">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <h3 className="challenge-title-large">{todaysChallenge.title}</h3>
                  <p className="challenge-desc">{todaysChallenge.description}</p>

                  {/* Examples */}
                  {todaysChallenge.examples && (
                    <div className="example-box">
                      {todaysChallenge.examples.map((ex, idx) => (
                        <div key={idx} className="example-line">
                          <span className="example-label">Example {idx + 1}:</span>
                          <span className="example-val">Input: {ex.input} → Output: {ex.output}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="challenge-actions-row">
                    {todaySolvedSuccess && (
                      <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}>
                        🔥 Streak updated! Solved for today.
                      </span>
                    )}
                    <button
                      type="button"
                      className="spherical-btn"
                      onClick={() => {
                        openModal('practice_area', {
                          practiceView: 'compiler',
                          practiceLanguage: todaysChallenge.language || 'C',
                        });
                      }}
                      title="Open Practice Area compiler to code and test your solution"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                      <span>Solve in Arena</span>
                    </button>
                    <button
                      type="button"
                      className="spherical-btn spherical-btn-primary"
                      onClick={handleSolveChallenge}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>
                        {todaysChallenge.isPracticeStarted
                          ? 'Mark Challenge as Completed'
                          : 'Start Practice & Complete Challenge'}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

          </section>

          {/* =================================================================
              COLUMN 3 (RIGHT): STREAK COUNTER & AUDIO-SPECTRUM BAR GRAPH
              ================================================================= */}
          <aside className="dash-right-col">
            
            {/* Streak Counter Card */}
            <div className="dash-glass-card streak-card">
              <div className="section-header-row" style={{ marginBottom: 0 }}>
                <h2 className="section-heading">
                  <span className="section-heading-dot" />
                  Streak
                </h2>
              </div>

              <div className="streak-header">
                <div className="streak-flame-frame">
                  <img
                    src="/streak.png"
                    alt="Daily Streak Flame"
                    className="streak-flame-img"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/company_logo_clean.png';
                    }}
                  />
                </div>
                <div className="streak-info-col">
                  <div className="streak-count-title">
                    {streakData.current_streak || 0}
                    <span className="streak-unit">Days</span>
                  </div>
                  <span className="streak-status-text">
                    {streakData.last_active_date
                      ? `Last active: ${streakData.last_active_date}`
                      : 'No active streak yet. Complete challenge to start!'}
                  </span>
                </div>
              </div>

              <div className="streak-stats-row">
                <div className="streak-stat-box">
                  <span className="streak-stat-label">Longest Streak</span>
                  <span className="streak-stat-val">{streakData.longest_streak || 0} Days</span>
                </div>
                <div className="streak-stat-box">
                  <span className="streak-stat-label">Total Solved</span>
                  <span className="streak-stat-val">
                    {streakData.total_problems_solved || 0} Problems
                  </span>
                </div>
              </div>
            </div>

            {/* Audio-Spectrum Activity Bar Graph */}
            <div className="dash-glass-card graph-card">
              <div className="graph-top-info">
                <div>
                  <h2 className="section-heading" style={{ fontSize: '18px' }}>
                    <span className="section-heading-dot" />
                    Activity Graph
                  </h2>
                  <span className="graph-caption">
                    {(streakData.submissionDates || []).length} total problems solved in last 30 days
                  </span>
                </div>
              </div>

              {/* Vertical flex items-end Bar Container as specified by algorithm */}
              <div className="graph-container-wrap">
                {barGraphData.map((day, idx) => {
                  const isEdgeLeft = idx < 4;
                  const isEdgeRight = idx > barGraphData.length - 5;
                  const edgeClass = isEdgeLeft ? 'edge-left' : isEdgeRight ? 'edge-right' : '';

                  return (
                    <div
                      key={idx}
                      className={`spectrum-bar-col ${edgeClass}`}
                    >
                      <div
                        className={`spectrum-bar-fill ${day.count > 0 ? 'active-day' : ''}`}
                        style={{ height: `${day.heightPercentage}%` }}
                      />
                      <div className="spectrum-tooltip">
                        <span className="tooltip-date">{day.date}</span>
                        <span className="tooltip-count">
                          {day.count} {day.count === 1 ? 'problem' : 'problems'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="graph-timeline-axis">
                <span>30 days ago</span>
                <span>15 days</span>
                <span>Today</span>
              </div>
            </div>

          </aside>

        </div>
      </main>

      {/* =====================================================================
          MODAL 1: ADD CODE TO CODE STORE (+)
          ===================================================================== */}
      {activeModal === 'add_code' && (
        <div className="dash-modal-backdrop" onClick={() => closeModal()}>
          <div className="dash-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h2 className="modal-title">Store New Code</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => closeModal()}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewCode} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="modal-form-group">
                <label className="modal-label">Problem Name</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Merge K Sorted Lists, Binary Search"
                  value={newProblemName}
                  onChange={(e) => setNewProblemName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Upon which language the code is</label>
                <select
                  className="modal-select"
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                >
                  <option value="C">C</option>
                  <option value="C++">C++</option>
                  <option value="Python">Python</option>
                  <option value="JavaScript">JavaScript</option>
                  <option value="Java">Java</option>
                  <option value="Go">Go</option>
                  <option value="Rust">Rust</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Code Snippet (Standard Compiler Editor)</label>
                <div className="compiler-frame" style={{ border: '1px solid rgba(225, 175, 155, 0.3)' }}>
                  <div className="compiler-titlebar">
                    <div className="compiler-titlebar-left">
                      <div className="compiler-dots-group" aria-hidden="true">
                        <span className="compiler-dot dot-close" />
                        <span className="compiler-dot dot-minimize" />
                        <span className="compiler-dot dot-expand" />
                      </div>
                      <div className="compiler-file-tab">
                        <span className="compiler-file-label">
                          {(newProblemName || 'solution').toLowerCase().replace(/\s+/g, '_')}.{getFileExtension(newLanguage)}
                        </span>
                      </div>
                    </div>
                    <div className="compiler-titlebar-right">
                      <span className="compiler-meta-badge">
                        {Math.max((newCodeContent || '').split('\n').length, 1)} lines • {newLanguage}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', background: '#0d0706', minHeight: '180px' }}>
                    <div className="compiler-gutter-col" style={{ paddingTop: '12px', paddingBottom: '12px', userSelect: 'none' }}>
                      {Array.from({ length: Math.max((newCodeContent || '').split('\n').length, 6) }, (_, i) => (
                        <span key={i} className="compiler-line-num" style={{ lineHeight: '1.5', fontSize: '13px' }}>
                          {i + 1}
                        </span>
                      ))}
                    </div>
                    <textarea
                      className="modal-textarea"
                      placeholder="// Write or paste your source code here..."
                      value={newCodeContent}
                      onChange={(e) => setNewCodeContent(e.target.value)}
                      rows={Math.max((newCodeContent || '').split('\n').length, 8)}
                      style={{
                        border: 'none',
                        borderRadius: 0,
                        background: 'transparent',
                        padding: '12px 14px',
                        lineHeight: '1.5',
                        fontSize: '13px',
                        flex: 1,
                        fontFamily: "'JetBrains Mono', Consolas, monospace",
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  <div className="compiler-statusbar">
                    <div className="compiler-status-left">
                      <span className="compiler-status-beacon" />
                      <span className="compiler-status-text">Compiler: Standard {newLanguage} Mode</span>
                    </div>
                    <div className="compiler-status-right">
                      <span>Ln {Math.max((newCodeContent || '').split('\n').length, 1)}, Col 1</span>
                      <span className="status-sep">|</span>
                      <span>UTF-8</span>
                    </div>
                  </div>
                </div>
              </div>

              {codeStoreToast && (
                <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}>
                  {codeStoreToast}
                </div>
              )}

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="spherical-btn"
                  onClick={() => closeModal()}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="spherical-btn spherical-btn-primary"
                >
                  Save Code to Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: CODE STORE BROWSER (3 FILES NAVIGATION & IN-FILE SEARCH)
          ===================================================================== */}
      {activeModal === 'code_store' && (
        <div className="dash-modal-backdrop" onClick={() => closeModal()}>
          <div className="dash-modal-window" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h2 className="modal-title">Code Store</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => closeModal()}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#ffffff' }}>
                Total Stored Problems: <strong>{allStoredCodes.length}</strong>
              </span>
              <button
                type="button"
                className="spherical-btn spherical-btn-primary store-new-code-btn"
                onClick={() => {
                  openModal('practice_area', {
                    practiceView: 'picker',
                    practiceLanguage: null,
                  });
                }}
                title="Redirect to Practice Area to write, run, and store code"
              >
                + Store Code
              </button>
            </div>

            {/* 3 Different Files Navigation (C File, C++ File, Python File + All Codes) */}
            <div className="code-store-file-tabs">
              {[
                { id: 'all', label: 'All Codes', icon: '📁', count: allStoredCodes.length },
                { id: 'C', label: 'C File (.c)', icon: '📄', count: cFileCount },
                { id: 'C++', label: 'C++ File (.cpp)', icon: '📄', count: cppFileCount },
                { id: 'Python', label: 'Python File (.py)', icon: '📄', count: pythonFileCount },
              ].map((fileTab) => (
                <button
                  key={fileTab.id}
                  type="button"
                  className={`code-store-file-tab ${activeFileTab === fileTab.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFileTab(fileTab.id);
                  }}
                  title={`Navigate to ${fileTab.label}`}
                >
                  <span className="file-tab-icon">{fileTab.icon}</span>
                  <span>{fileTab.label}</span>
                  <span className="file-tab-badge">{fileTab.count}</span>
                </button>
              ))}
            </div>

            {/* In-File Search Bar with Search Button */}
            <div className="code-store-search-container">
              <div className="code-store-search-box">
                <svg className="code-store-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="code-store-search-input"
                  placeholder={`Search ${activeFileTab === 'all' ? 'all' : `${activeFileTab} file`} codes by problem name...`}
                  value={codeStoreSearchInput}
                  onChange={(e) => {
                    setCodeStoreSearchInput(e.target.value);
                    setCodeStoreSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteCodeStoreSearch();
                    }
                  }}
                />
                {codeStoreSearchInput && (
                  <button
                    type="button"
                    className="code-store-clear-search"
                    onClick={handleClearCodeStoreSearch}
                    title="Clear search input"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                className="spherical-btn spherical-btn-primary code-store-search-btn"
                onClick={handleExecuteCodeStoreSearch}
                title="Search stored codes by name"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span>Search</span>
              </button>
            </div>

            {/* Active search filter label */}
            {codeStoreSearchQuery && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', fontSize: '12.5px', color: '#ffffff', marginBottom: '8px' }}>
                <span>
                  Showing results for &ldquo;<strong>{codeStoreSearchQuery}</strong>&rdquo; in <strong>{activeFileTab === 'all' ? 'All Files' : `${activeFileTab} File`}</strong> ({filteredStoredCodes.length})
                </span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#e1af9b', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
                  onClick={handleClearCodeStoreSearch}
                >
                  Reset search
                </button>
              </div>
            )}

            {/* Stored Codes List in Active File */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '380px', overflowY: 'auto' }}>
              {filteredStoredCodes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#ffffff', opacity: 0.85, fontSize: '14px' }}>
                  {codeStoreSearchQuery ? (
                    <div>
                      <p style={{ margin: '0 0 8px 0' }}>No codes found matching &ldquo;{codeStoreSearchQuery}&rdquo; in {activeFileTab === 'all' ? 'Code Store' : `${activeFileTab} File`}.</p>
                      <button
                        type="button"
                        className="spherical-btn spherical-btn-sm"
                        onClick={handleClearCodeStoreSearch}
                      >
                        Clear Search
                      </button>
                    </div>
                  ) : activeFileTab !== 'all' ? (
                    <div>
                      <p style={{ margin: 0 }}>No {activeFileTab} codes saved yet in {activeFileTab} File.</p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ margin: 0 }}>No code saved in your Code Store yet.</p>
                    </div>
                  )}
                </div>
              ) : (
                filteredStoredCodes.map((item) => (
                  <div key={item.id} className="recent-problem-card">
                    <div className="problem-card-top">
                      <div>
                        <h3 className="problem-title">{item.problemName}</h3>
                      </div>
                      <span className="problem-lang-badge">{item.language}</span>
                    </div>

                    <div className="problem-footer-row">
                      <span className="problem-date-text">{item.formattedDateTime}</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="spherical-btn spherical-btn-sm"
                          onClick={() => openModal('view_code', { viewingProblem: item })}
                        >
                          View Code
                        </button>
                        <button
                          type="button"
                          className="spherical-btn spherical-btn-sm delete-code-btn"
                          onClick={() => handleDeleteCode(item.id, item.problemName)}
                          title={`Delete "${item.problemName}"`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: VIEW / EDIT / RUN CODE (ONLINE COMPILER)
          ===================================================================== */}
      {activeModal === 'view_code' && viewingCodeProblem && (
        <div className="dash-modal-backdrop compiler-modal-backdrop" onClick={() => closeModal('code_store')}>
          <div className="dash-modal-window c-compiler-modal-window" onClick={(e) => e.stopPropagation()}>
            <OnlineCompiler
              key={viewingCodeProblem.id}
              _problemId={viewingCodeProblem.id}
              problemName={viewingCodeProblem.problemName}
              language={viewingCodeProblem.language}
              initialCode={viewingCodeProblem.code}
              fileName={`${(viewingCodeProblem.problemName || 'solution').toLowerCase().replace(/\s+/g, '_')}.${getFileExtension(viewingCodeProblem.language)}`}
              onSaveUpdate={(updatedCode, id) => handleUpdateStoredCode(id || viewingCodeProblem.id, updatedCode)}
              onSaveCode={handleSaveCompilerCode}
              onDeleteCode={() => handleDeleteCode(viewingCodeProblem.id, viewingCodeProblem.problemName)}
              onClose={() => closeModal('code_store')}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: SETTINGS WINDOW (Reset Password & Personal Details)
          ===================================================================== */}
      {activeModal === 'settings' && (
        <div className="dash-modal-backdrop" onClick={() => closeModal()}>
          <div className="dash-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h2 className="modal-title">Settings</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => closeModal()}
              >
                ✕
              </button>
            </div>

            {settingsToast && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 70, 32, 0.95), rgba(20, 50, 22, 0.95))',
                  color: '#ffffff',
                  border: '1px solid rgba(129, 199, 132, 0.6)',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginBottom: '14px',
                  textAlign: 'center',
                }}
              >
                {settingsToast}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Option 1: Reset Password */}
              <div className="recent-problem-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('forgot-password')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="problem-title" style={{ fontSize: '17px', color: '#ffffff' }}>Reset Password</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#ffffff' }}>
                      Redirects to the password recovery and update page.
                    </p>
                  </div>
                  <button type="button" className="spherical-btn spherical-btn-sm">
                    Go →
                  </button>
                </div>
              </div>

              {/* Option 2: Personal Details */}
              <div className="recent-problem-card" style={{ cursor: 'pointer' }} onClick={() => handleOpenPersonalDetails('settings')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="problem-title" style={{ fontSize: '17px', color: '#ffffff' }}>Personal Details</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#ffffff' }}>
                      Configure your age, interests, class / education, and bio.
                    </p>
                  </div>
                  <button type="button" className="spherical-btn spherical-btn-sm">
                    Edit →
                  </button>
                </div>
              </div>

              {/* Option 3: Return to Home / Landing Page */}
              <div className="recent-problem-card" style={{ cursor: 'pointer' }} onClick={() => onNavigate('landing')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="problem-title" style={{ fontSize: '17px', color: '#ffffff' }}>Return to Landing Page</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#ffffff' }}>
                      View the platform introduction and showcase page.
                    </p>
                  </div>
                  <button type="button" className="spherical-btn spherical-btn-sm">
                    Home →
                  </button>
                </div>
              </div>

              {/* Option 4: Sign Out */}
              <div
                className="recent-problem-card"
                style={{ cursor: 'pointer', borderColor: 'rgba(239, 83, 80, 0.3)' }}
                onClick={() => {
                  setActiveModal(null);
                  if (onSignOut) onSignOut();
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="problem-title" style={{ fontSize: '17px', color: '#ffffff' }}>Sign Out</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#ffffff' }}>
                      Sign out of your active CodeLife session.
                    </p>
                  </div>
                  <button type="button" className="spherical-btn spherical-btn-sm">
                    Log Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: PERSONAL DETAILS WINDOW
          ===================================================================== */}
      {activeModal === 'personal_details' && (
        <div className="dash-modal-backdrop" onClick={() => closeModal(personalDetailsSource || 'settings')}>
          <div className="dash-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h2 className="modal-title">Personal Details</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => closeModal(personalDetailsSource || 'settings')}
              >
                ✕
              </button>
            </div>

            {personalDetailsToast && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 70, 32, 0.95), rgba(20, 50, 22, 0.95))',
                  color: '#ffffff',
                  border: '1px solid rgba(129, 199, 132, 0.6)',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginBottom: '10px',
                  textAlign: 'center',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                }}
              >
                {personalDetailsToast}
              </div>
            )}

            <form onSubmit={handleSavePersonalDetails} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="modal-form-group">
                <label className="modal-label">Full Name</label>
                <input
                  type="text"
                  className="modal-input"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Age</label>
                <input
                  type="number"
                  className="modal-input"
                  min="10"
                  max="120"
                  placeholder="e.g. 21 (optional)"
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Interests & Specializations</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Competitive Programming, Algorithms (optional)"
                  value={editInterest}
                  onChange={(e) => setEditInterest(e.target.value)}
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Institution Name</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. University, College, School, or Organization (optional)"
                  value={editInstitution}
                  onChange={(e) => setEditInstitution(e.target.value)}
                />
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Bio</label>
                <textarea
                  className="modal-input"
                  rows={3}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Tell us a little bit about yourself and your coding targets (optional)..."
                />
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="spherical-btn"
                  onClick={() => closeModal(personalDetailsSource || 'settings')}
                >
                  {personalDetailsSource === 'profile' ? 'Back to Profile' : 'Back to Settings'}
                </button>
                <button
                  type="submit"
                  className="spherical-btn spherical-btn-primary"
                >
                  {isPersonalDetailsSaved ? '✓ Saved!' : 'Save Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 6: USER PROFILE WINDOW
          ===================================================================== */}
      {activeModal === 'profile' && (
        <div className="dash-modal-backdrop" onClick={() => closeModal()}>
          <div className="dash-modal-window" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h2 className="modal-title">User Profile</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => closeModal()}
              >
                ✕
              </button>
            </div>

            <div className="profile-detail-grid">
              <div className="profile-info-fields">
                <div className="profile-row-item">
                  <span className="profile-field-label">Full Name</span>
                  <span className="profile-field-val">{profile.fullName}</span>
                </div>

                <div className="profile-row-item">
                  <span className="profile-field-label">Username</span>
                  <span className="profile-field-val">@{profile.username}</span>
                </div>

                <div className="profile-row-item">
                  <span className="profile-field-label">Email</span>
                  <span className="profile-field-val">{profile.email}</span>
                </div>

                {profile.age ? (
                  <div className="profile-row-item">
                    <span className="profile-field-label">Age</span>
                    <span className="profile-field-val">{profile.age} years old</span>
                  </div>
                ) : null}

                {profile.institution || profile.classGrade ? (
                  <div className="profile-row-item">
                    <span className="profile-field-label">Institution Name</span>
                    <span className="profile-field-val">{profile.institution || profile.classGrade}</span>
                  </div>
                ) : null}

                {profile.interest ? (
                  <div className="profile-row-item">
                    <span className="profile-field-label">Interests</span>
                    <span className="profile-field-val">{profile.interest}</span>
                  </div>
                ) : null}

                {profile.bio ? (
                  <div className="profile-row-item">
                    <span className="profile-field-label">Bio</span>
                    <span className="profile-field-val" style={{ fontSize: '13.5px', color: '#ffffff' }}>
                      {profile.bio}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Profile Statistics Summary */}
            <div className="streak-stats-row" style={{ marginTop: '10px' }}>
              <div className="streak-stat-box">
                <span className="streak-stat-label">Current Streak</span>
                <span className="streak-stat-val">🔥 {streakData.current_streak || 0} Days</span>
              </div>
              <div className="streak-stat-box">
                <span className="streak-stat-label">Longest Streak</span>
                <span className="streak-stat-val">⭐ {streakData.longest_streak || 0} Days</span>
              </div>
              <div className="streak-stat-box">
                <span className="streak-stat-label">Code Store Snippets</span>
                <span className="streak-stat-val">💾 {allStoredCodes.length} Files</span>
              </div>
              <div className="streak-stat-box">
                <span className="streak-stat-label">Member Since</span>
                <span className="streak-stat-val">📅 {profile.memberSince || 'Today'}</span>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="spherical-btn"
                onClick={() => handleOpenPersonalDetails('profile')}
              >
                Edit Information
              </button>
              <button
                type="button"
                className="spherical-btn spherical-btn-primary"
                onClick={() => closeModal()}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 7: PRACTICE AREA & ONLINE C COMPILER (JUDGE0 API)
          ===================================================================== */}
      {activeModal === 'practice_area' && (
        <div
          className={`dash-modal-backdrop ${practiceView === 'compiler' ? 'compiler-modal-backdrop' : ''}`}
          onClick={() => closeModal()}
        >
          <div
            className={`dash-modal-window ${practiceView === 'compiler' ? 'c-compiler-modal-window' : 'practice-modal-window'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {practiceView === 'compiler' ? (
              <OnlineCompiler
                key={`practice-${practiceLanguage}`}
                language={practiceLanguage}
                onClose={() => closeModal()}
                onSaveCode={handleSaveCompilerCode}
                onSaveUpdate={(updatedCode, id) => handleUpdateStoredCode(id, updatedCode)}
              />
            ) : (
              <>
                {/* Modal Header */}
                <div className="modal-header-row">
                  <h2 className="modal-title">Practice Area</h2>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => closeModal()}
                    title="Close Practice Area"
                  >
                    ✕
                  </button>
                </div>

                {/* Language Selection: 3 Options (C, C++, Python) with Logos */}
                <div className="practice-lang-section">
                  <label className="modal-input-label" style={{ marginBottom: '10px', display: 'block' }}>
                    Select Language
                  </label>
                  <div className="practice-lang-grid">
                    {PRACTICE_LANGUAGES.map((lang) => {
                      const isSelected = Boolean(practiceLanguage && practiceLanguage === lang.id);
                      return (
                        <div
                          key={lang.id}
                          className={`practice-lang-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectPracticeLanguage(lang.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleSelectPracticeLanguage(lang.id);
                            }
                          }}
                        >
                          <div className="practice-lang-card-top">
                            <span className={`practice-radio-pill ${isSelected ? 'active' : ''}`}>
                              {isSelected ? '✓ Selected' : 'Choose'}
                            </span>
                          </div>
                          <div className="practice-lang-icon-wrap">
                            <img
                              src={lang.logo}
                              alt={`${lang.name} Logo`}
                              className="practice-lang-img"
                            />
                          </div>
                          <h4 className="practice-lang-name">{lang.name}</h4>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
