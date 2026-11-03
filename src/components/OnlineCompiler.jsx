import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS,
  DEBUG,
} from '../services/compilerService';
import './OnlineCCompiler.css';

/**
 * Confirmed Language Configurations from https://ce.judge0.com/languages
 */
const LANGUAGE_CONFIGS = {
  C: {
    id: 'C',
    name: 'C (GCC 9.2.0)',
    title: 'C Compiler',
    languageId: CONFIRMED_LANGUAGE_IDS.C, // 50
    monacoLanguage: 'c',
    fileName: 'main.c',
    logo: '/c_logo_white.png',
    defaultCode: `#include <stdio.h>

int main() {
    // Your code goes here
   

    return 0;
}`,
  },
  'C++': {
    id: 'C++',
    name: 'C++ (GCC 9.2.0)',
    title: 'C++ Compiler',
    languageId: CONFIRMED_LANGUAGE_IDS.CPP, // 54
    monacoLanguage: 'cpp',
    fileName: 'main.cpp',
    logo: '/cpp_logo_white.png',
    defaultCode: `#include <iostream>

int main() {
    // Your code goes here
    

    return 0;
}`,
  },
  Python: {
    id: 'Python',
    name: 'Python (3.8.1)',
    title: 'Python Compiler',
    languageId: CONFIRMED_LANGUAGE_IDS.PYTHON, // 71
    monacoLanguage: 'python',
    fileName: 'main.py',
    logo: '/python_logo_white.png',
    defaultCode: `def main():
    # Your code goes here
    

if __name__ == "__main__":
    main()`,
  },
};

const resolveLanguageKey = (lang) => {
  if (!lang) return 'C++';
  const l = String(lang).trim().toLowerCase();
  if (l === 'c') return 'C';
  if (l === 'cpp' || l === 'c++') return 'C++';
  if (l === 'python' || l === 'py') return 'Python';
  return 'C++';
};

/**
 * Format string for xterm.js so \n is converted to \r\n
 */
function formatForTerminal(str) {
  if (!str) return '';
  return str.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

export default function OnlineCompiler({
  language = 'C++',
  initialCode,
  problemName,
  _problemId,
  _location,
  fileName,
  onClose,
  onSaveCode,
  onSaveUpdate,
  onDeleteCode,
}) {
  const selectedLang = resolveLanguageKey(language);
  const selectedLangRef = useRef(selectedLang);
  const config = LANGUAGE_CONFIGS[selectedLang] || LANGUAGE_CONFIGS['C++'];

  const [code, setCode] = useState(
    initialCode !== undefined ? initialCode : config.defaultCode
  );
  const codeRef = useRef(code);

  const [isInFlight, setIsInFlight] = useState(false);
  const isInFlightRef = useRef(false);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const isSessionRunningRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // In-compiler state for saved problem details
  const [currentProblemName, setCurrentProblemName] = useState(problemName || '');
  const [currentProblemId, setCurrentProblemId] = useState(_problemId || null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState(problemName || '');
  const [saveError, setSaveError] = useState('');
  const [saveToast, setSaveToast] = useState('');

  // Terminal & Execution Session References
  const terminalContainerRef = useRef(null);
  const xtermInstance = useRef(null);
  const fitAddonInstance = useRef(null);

  const sessionActiveRef = useRef(false);
  const inFlightAbortController = useRef(null);
  const inputsListRef = useRef([]);
  // Both programOutputShownRef and displayedStdoutLengthRef tracked explicitly
  const programOutputShownRef = useRef('');
  const displayedStdoutLengthRef = useRef(0);
  const currentInputLineRef = useRef('');
  const isWaitingForInputRef = useRef(false);
  const runCountRef = useRef(0);

  // Function refs to avoid stale closures in terminal event listeners
  const executeNextSessionStepRef = useRef(null);
  const handleStopSessionRef = useRef(null);

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13.5,
      fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
      theme: {
        background: '#0c0706',
        foreground: '#ffffff',
        cursor: '#ffb74d',
        selectionBackground: 'rgba(255, 183, 77, 0.35)',
        black: '#000000',
        red: '#ef5350',
        green: '#4caf50',
        yellow: '#ffb74d',
        blue: '#42a5f5',
        magenta: '#ab47bc',
        cyan: '#26c6da',
        white: '#ffffff',
      },
      convertEol: true,
      rows: 10,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainerRef.current);

    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch {}
    }, 50);

    xtermInstance.current = term;
    fitAddonInstance.current = fitAddon;

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleResize);

    // Initial welcome banner in terminal
    term.write('\x1b[90m// xterm.js interactive terminal ready. Press Run to execute.\x1b[0m\r\n');

    // Terminal keyboard data handler (handles character typing, backspace, and Enter)
    term.onData((data) => {
      if (!isWaitingForInputRef.current || !sessionActiveRef.current) return;

      // Handle Ctrl+C (cancel session)
      if (data === '\u0003') {
        if (handleStopSessionRef.current) {
          handleStopSessionRef.current();
        }
        return;
      }

      if (data === '\r' || data === '\n' || data === '\r\n') {
        // User pressed Enter: write newline to xterm screen only
        term.write('\r\n');
        const submittedLine = currentInputLineRef.current;
        currentInputLineRef.current = '';
        isWaitingForInputRef.current = false;

        inputsListRef.current.push(submittedLine);
        if (executeNextSessionStepRef.current) {
          executeNextSessionStepRef.current();
        }
      } else if (data === '\u007F' || data === '\b') {
        // Backspace: do NOT erase past the start of the current input line
        if (currentInputLineRef.current.length > 0) {
          currentInputLineRef.current = currentInputLineRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data >= ' ' || data === '\t') {
        // Regular printable characters: written directly to xterm screen only
        currentInputLineRef.current += data;
        term.write(data);
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // Re-fit terminal on container layout updates
  useEffect(() => {
    if (fitAddonInstance.current) {
      try {
        fitAddonInstance.current.fit();
      } catch {}
    }
  }, [selectedLang]);

  // Execution Step using simulated re-run with inputs list
  const executeNextSessionStep = async () => {
    if (!sessionActiveRef.current) return;

    const term = xtermInstance.current;
    if (!term) return;

    // Cap total re-runs per session (30) to protect Judge0 public instance from throttling
    runCountRef.current += 1;
    if (runCountRef.current > 30) {
      term.write('\r\n\x1b[33m[Session ended: Maximum input re-runs limit reached (30).]\x1b[0m\r\n');
      sessionActiveRef.current = false;
      isSessionRunningRef.current = false;
      setIsSessionRunning(false);
      isInFlightRef.current = false;
      setIsInFlight(false);
      return;
    }

    isInFlightRef.current = true;
    setIsInFlight(true);

    const abortController = new AbortController();
    inFlightAbortController.current = abortController;

    const currentLangKey = selectedLangRef.current;
    const langConfig = LANGUAGE_CONFIGS[currentLangKey] || LANGUAGE_CONFIGS['C++'];
    const currentSource = codeRef.current;
    const preparedSource = prepareSourceForExecution(langConfig.languageId, currentSource);
    const stdinPayload =
      inputsListRef.current.length > 0
        ? inputsListRef.current.join('\n') + '\n'
        : '';

    try {
      const result = await runCode(langConfig.languageId, preparedSource, stdinPayload, {
        signal: abortController.signal,
        cpu_time_limit: 2,
        memory_limit: 128000,
      });

      if (!sessionActiveRef.current) return; // Discard response if stopped

      // Order of checks:
      // (1) Compile error: shown in red, once, ends session immediately
      if (result.compile_output && result.status?.id === 6) {
        term.write(`\r\n\x1b[31m${formatForTerminal(result.compile_output)}\x1b[0m\r\n`);
        sessionActiveRef.current = false;
        isWaitingForInputRef.current = false;
        isSessionRunningRef.current = false;
        setIsSessionRunning(false);
        isInFlightRef.current = false;
        setIsInFlight(false);

        if (DEBUG) {
          console.log(`[Judge0 Call #${runCountRef.current}]`, {
            language: langConfig.name,
            languageId: langConfig.languageId,
            stdinSent: stdinPayload,
            stdout: result.stdout,
            stderr: result.stderr,
            status: result.status,
            exitCode: result.exit_code,
            considered: 'FINISHED (Compilation Error)',
            reason: 'Compile error (status 6)',
          });
        }
        return;
      }

      // Normalise line endings (\r\n to \n) in stdout before comparing
      const rawStdout = result.stdout || '';
      const normalizedStdout = rawStdout.replace(/\r\n/g, '\n');
      const prevOutput = programOutputShownRef.current;

      // Consistency check: new stdout must start with the exact program output already rendered
      if (!normalizedStdout.startsWith(prevOutput)) {
        // If it does not start with it, do NOT print any sliced text.
        // Print one warning line, end the session, and explain that the program's output changed between runs.
        term.write(
          '\r\n\x1b[33m[Warning: Program output diverged from previous run. The program produced different output than expected across re-runs (e.g. due to time, randomness, or unbuffered state). Session ended.]\x1b[0m\r\n'
        );
        sessionActiveRef.current = false;
        isWaitingForInputRef.current = false;
        isSessionRunningRef.current = false;
        setIsSessionRunning(false);
        isInFlightRef.current = false;
        setIsInFlight(false);

        if (DEBUG) {
          console.warn(`[Judge0 Call #${runCountRef.current}] Divergence detected!`, {
            programOutputShownBefore: prevOutput,
            normalizedStdout,
            stdinSent: stdinPayload,
          });
        }
        return;
      }

      // Write ONLY the delta beyond what has already been shown
      const delta = normalizedStdout.slice(prevOutput.length);
      if (delta) {
        term.write(formatForTerminal(delta));
      }
      programOutputShownRef.current = normalizedStdout;
      displayedStdoutLengthRef.current = normalizedStdout.length;

      // (2) Waiting marker or EOFError means waiting
      const { isWaiting, cleanStderr } = checkWaitingForInput(langConfig.languageId, result);

      // Show runtime errors in red (stderr other than the waiting signals)
      if (cleanStderr) {
        term.write(`\r\n\x1b[31m${formatForTerminal(cleanStderr)}\x1b[0m\r\n`);
      }

      if (DEBUG) {
        const reason = isWaiting
          ? (langConfig.languageId === CONFIRMED_LANGUAGE_IDS.PYTHON
              ? 'EOFError in stderr -> waiting for input'
              : '__NEED_INPUT__ marker in stderr -> waiting for input')
          : `Normal exit (status ${result.status?.id}: ${result.status?.description || 'Accepted'})`;

        console.log(`[Judge0 Call #${runCountRef.current}]`, {
          language: langConfig.name,
          languageId: langConfig.languageId,
          stdinSent: stdinPayload,
          stdout: result.stdout,
          stderr: result.stderr,
          status: result.status,
          exitCode: result.exit_code,
          considered: isWaiting ? 'WAITING' : 'FINISHED',
          reason,
          programOutputShownBefore: prevOutput,
          programOutputShownAfter: programOutputShownRef.current,
        });
      }

      if (isWaiting) {
        // A waiting marker must always win over "process finished"
        isWaitingForInputRef.current = true;
        isInFlightRef.current = false;
        setIsInFlight(false);
      } else {
        // (3) Otherwise finished
        sessionActiveRef.current = false;
        isWaitingForInputRef.current = false;
        isSessionRunningRef.current = false;
        setIsSessionRunning(false);
        isInFlightRef.current = false;
        setIsInFlight(false);

        const exitCode =
          result.exit_code !== undefined && result.exit_code !== null
            ? result.exit_code
            : result.status?.id === 3
            ? 0
            : 1;
        const timeStr = result.time ? `${result.time} s` : '0.00 s';

        if (result.status?.id === 5) {
          term.write(`\r\n\x1b[31mTime Limit Exceeded (cpu_time_limit: 2s)\x1b[0m\r\n`);
        } else {
          term.write(`\r\n\x1b[32mProcess returned ${exitCode} | time: ${timeStr}\x1b[0m\r\n`);
        }
      }
    } catch (err) {
      console.error('[OnlineCompiler Error]', err);
      if (!sessionActiveRef.current) return;
      isInFlightRef.current = false;
      setIsInFlight(false);
      sessionActiveRef.current = false;
      isSessionRunningRef.current = false;
      setIsSessionRunning(false);

      if (err.name === 'AbortError') {
        term.write('\r\n\x1b[33m[Process stopped by user]\x1b[0m\r\n');
      } else {
        term.write(`\r\n\x1b[31m${formatForTerminal(err.message || 'Execution error')}\x1b[0m\r\n`);
      }
    }
  };

  // Run Button: starts fresh session (clears inputs and terminal)
  const handleStartSession = () => {
    if (isInFlightRef.current) return;

    const term = xtermInstance.current;
    if (!term) return;

    if (inFlightAbortController.current) {
      inFlightAbortController.current.abort();
    }

    term.reset();
    term.clear();
    if (fitAddonInstance.current) {
      try {
        fitAddonInstance.current.fit();
      } catch {}
    }

    inputsListRef.current = [];
    programOutputShownRef.current = '';
    displayedStdoutLengthRef.current = 0;
    currentInputLineRef.current = '';
    runCountRef.current = 0;
    sessionActiveRef.current = true;
    isWaitingForInputRef.current = false;

    isSessionRunningRef.current = true;
    setIsSessionRunning(true);
    executeNextSessionStep();
  };

  // Stop Button: ends session, aborts in-flight request, ignores late response
  const handleStopSession = () => {
    sessionActiveRef.current = false;
    isWaitingForInputRef.current = false;
    isSessionRunningRef.current = false;
    setIsSessionRunning(false);
    isInFlightRef.current = false;
    setIsInFlight(false);
    programOutputShownRef.current = '';
    displayedStdoutLengthRef.current = 0;
    inputsListRef.current = [];
    currentInputLineRef.current = '';
    runCountRef.current = 0;

    if (inFlightAbortController.current) {
      inFlightAbortController.current.abort();
      inFlightAbortController.current = null;
    }

    const term = xtermInstance.current;
    if (term) {
      term.write('\r\n\x1b[33m[Process stopped by user]\x1b[0m\r\n');
    }
  };

  // Keep function refs updated so terminal listeners always invoke the freshest implementation
  useEffect(() => {
    executeNextSessionStepRef.current = executeNextSessionStep;
    handleStopSessionRef.current = handleStopSession;
  });

  const handleCopyCode = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Open Save Modal inside the compiler window
  const handleOpenSaveModal = () => {
    setSaveNameInput(currentProblemName || '');
    setSaveError('');
    setShowSaveModal(true);
  };

  // Confirm save directly from inside the compiler
  const handleConfirmSave = (e) => {
    if (e) e.preventDefault();
    const trimmedName = saveNameInput.trim();
    if (!trimmedName) {
      setSaveError('Please enter a problem name.');
      return;
    }

    if (onSaveCode) {
      const savedResult = onSaveCode({
        problemName: trimmedName,
        language: config.name.split(' ')[0], // C, C++, or Python
        code,
      });

      setCurrentProblemName(trimmedName);
      if (savedResult && savedResult.id) {
        setCurrentProblemId(savedResult.id);
      }
      setIsSaved(true);
      setShowSaveModal(false);

      setSaveToast(`✓ "${trimmedName}" saved to Code Store!`);
      setTimeout(() => setSaveToast(''), 3500);
    }
  };

  // Save updates to an already saved problem
  const handleSaveUpdates = () => {
    if (onSaveUpdate && currentProblemId) {
      onSaveUpdate(code, currentProblemId);
      setIsSaved(true);
      setSaveToast(`✓ Saved latest updates to "${currentProblemName}"!`);
      setTimeout(() => {
        setIsSaved(false);
        setSaveToast('');
      }, 3000);
    }
  };

  return (
    <div className="c-compiler-container">
      {/* Toast Notification */}
      {saveToast && (
        <div className="c-compiler-toast">
          <span>{saveToast}</span>
        </div>
      )}

      {/* Save to Code Store Modal Overlay */}
      {showSaveModal && (
        <div className="c-save-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div
            className="c-save-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="c-save-modal-title"
          >
            <div className="c-save-modal-header">
              <h3 id="c-save-modal-title" className="c-save-modal-title">
                Save Code to Code Store
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowSaveModal(false)}
                title="Cancel"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmSave} className="c-save-modal-body">
              {saveError && <div className="c-save-modal-error">{saveError}</div>}

              <div className="modal-input-group">
                <label className="modal-input-label" htmlFor="save-problem-name">
                  Problem Name *
                </label>
                <input
                  id="save-problem-name"
                  type="text"
                  className="modal-input-field"
                  placeholder="e.g., Two Sum, Bubble Sort, Reverse String..."
                  value={saveNameInput}
                  onChange={(e) => {
                    setSaveNameInput(e.target.value);
                    if (saveError) setSaveError('');
                  }}
                  autoFocus
                />
              </div>

              <div className="modal-input-group">
                <label className="modal-input-label">Language</label>
                <div className="c-save-lang-chip">
                  <img src={config.logo} alt={config.name} className="c-tab-icon" />
                  <span>{config.name}</span>
                </div>
              </div>

              <div className="c-save-modal-actions">
                <button
                  type="button"
                  className="spherical-btn spherical-btn-sm"
                  onClick={() => setShowSaveModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="spherical-btn spherical-btn-primary spherical-btn-sm"
                >
                  Save to Code Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="c-compiler-header">
        <div className="c-compiler-header-left">
          <div className="c-compiler-brand-badge">
            <img src={config.logo} alt={`${config.name} Logo`} className="c-compiler-logo-img" />
            <h2 className="c-compiler-title">{currentProblemName || config.title}</h2>
            {currentProblemName && (
              <span className="problem-lang-badge">{config.name}</span>
            )}
          </div>
        </div>

        <div className="c-compiler-header-right">
          {onClose && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              title={`Close ${currentProblemName || config.title}`}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Monaco Code Editor Frame */}
      <div className="c-editor-window">
        <div className="c-editor-window-titlebar">
          <div className="c-editor-dots">
            <span className="compiler-dot dot-close" />
            <span className="compiler-dot dot-minimize" />
            <span className="compiler-dot dot-expand" />
          </div>
          <div className="c-editor-file-tab">
            <img src={config.logo} alt={config.name} className="c-tab-icon" />
            <span>
              {fileName ||
                (currentProblemName
                  ? `${currentProblemName.toLowerCase().replace(/\s+/g, '_')}.${config.fileName.split('.').pop()}`
                  : config.fileName)}
            </span>
          </div>
          <div className="c-editor-actions">
            <button
              type="button"
              className="c-editor-copy-btn"
              onClick={handleCopyCode}
              title="Copy code to clipboard"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Monaco React Editor */}
        <div className="c-monaco-wrapper">
          <Editor
            height="46vh"
            defaultLanguage={config.monacoLanguage}
            language={config.monacoLanguage}
            theme="vs-dark"
            value={code}
            onChange={(val) => {
              const nextVal = val || '';
              setCode(nextVal);
              codeRef.current = nextVal;
            }}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: 'on',
              roundedSelection: true,
              tabSize: 4,
              padding: { top: 10, bottom: 10 },
            }}
          />
        </div>
      </div>

      {/* Controls Toolbar: Run, Stop, Save, Close */}
      <div className="c-compiler-toolbar">
        <div className="c-compiler-toolbar-left">
          {/* Run Button (starts fresh session) */}
          <button
            type="button"
            className="spherical-btn spherical-btn-primary c-toolbar-btn c-run-btn"
            onClick={handleStartSession}
            disabled={isInFlight}
            title="Execute code in the xterm terminal"
          >
            {isInFlight ? (
              <>
                <span className="c-spinner" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Run</span>
              </>
            )}
          </button>

          {/* Stop Button (terminates session & in-flight requests) */}
          <button
            type="button"
            className="spherical-btn spherical-btn-danger c-toolbar-btn"
            onClick={handleStopSession}
            disabled={!isSessionRunning && !isInFlight}
            title="Stop running execution and abort pending requests"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
            <span>Stop</span>
          </button>
        </div>

        <div className="c-compiler-toolbar-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Save Updates if problem already exists in Code Store */}
          {currentProblemId && onSaveUpdate && (
            <button
              type="button"
              className="spherical-btn spherical-btn-primary c-toolbar-btn"
              onClick={handleSaveUpdates}
              title="Save your latest changes to this code in Code Store"
            >
              {isSaved ? '✓ Saved Updates!' : 'Save Updates'}
            </button>
          )}

          {/* Save to Code Store / Save as New Copy */}
          {onSaveCode && (
            <button
              type="button"
              className={`spherical-btn c-toolbar-btn ${!currentProblemId ? 'spherical-btn-primary' : ''}`}
              onClick={handleOpenSaveModal}
              title={currentProblemId ? 'Save a new copy to Code Store' : `Save this ${config.name} code into your Code Store`}
            >
              {currentProblemId ? 'Save as New' : 'Save to Code Store'}
            </button>
          )}

          {onDeleteCode && (
            <button
              type="button"
              className="spherical-btn spherical-btn-danger c-toolbar-btn"
              onClick={onDeleteCode}
              title="Delete this problem from Code Store"
            >
              Delete Code
            </button>
          )}

          {onClose && (
            <button
              type="button"
              className="spherical-btn c-toolbar-btn"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Single Unified xterm.js Terminal Console */}
      <div className="c-xterm-terminal-panel">
        <div className="c-xterm-header">
          <div className="c-xterm-header-left">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span className="c-xterm-title">Terminal Console</span>
            {isSessionRunning && (
              <span className="c-xterm-live-tag">● Interactive</span>
            )}
          </div>
          <div className="c-xterm-header-right">
            <button
              type="button"
              className="c-console-clear-btn"
              onClick={() => {
                if (xtermInstance.current) {
                  xtermInstance.current.clear();
                }
              }}
              title="Clear terminal screen"
            >
              Clear
            </button>
          </div>
        </div>

        {/* xterm.js mount container */}
        <div
          ref={terminalContainerRef}
          className="c-xterm-canvas-wrapper"
          onClick={() => {
            if (xtermInstance.current) {
              xtermInstance.current.focus();
            }
          }}
        />

        {/* Documentation notice regarding simulated input & sandbox limits */}
        <div className="c-xterm-footnote">
          <span>
            💡 <strong>Note:</strong> Input is simulated by re-running the program with the lines typed so far. Output that depends on non-deterministic state (such as system time or random numbers) may differ across re-runs. Large inputs or exceeding 30 prompts per session may reach public sandbox limits.
          </span>
        </div>
      </div>
    </div>
  );
}
