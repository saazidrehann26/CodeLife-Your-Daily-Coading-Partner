import React, { useState } from 'react';
import { getFileExtension } from '../services/dashboardService';
import './CodeCompilerViewer.css';

/**
 * Returns a recognizable language icon/glyph.
 */
function getLanguageGlyph(lang = '') {
  const normalized = (lang || '').toLowerCase().trim();
  switch (normalized) {
    case 'python':
      return '🐍';
    case 'c++':
    case 'cpp':
      return '⚙️';
    case 'c':
      return '⚡';
    case 'javascript':
    case 'js':
      return '🟨';
    case 'java':
      return '☕';
    case 'rust':
      return '🦀';
    case 'go':
      return '🐹';
    default:
      return '📜';
  }
}

/**
 * Lightweight syntax tokenizer for standard compiler representation.
 */
function tokenizeLine(line) {
  if (!line || line.trim() === '') {
    return [{ type: 'plain', text: line || ' ' }];
  }

  // Detect comments (// in C/C++/JS or # in Python)
  let codePart = line;
  let commentPart = null;

  const commentMatch = line.match(/^([\s\S]*?)(\/\/.*|#.*)$/);
  if (commentMatch) {
    codePart = commentMatch[1];
    commentPart = commentMatch[2];
  }

  const tokens = [];

  // Match keywords, strings, numbers, function calls, and plain segments
  const tokenRegex = /(\b(?:def|return|for|while|if|else|elif|in|import|from|class|const|let|var|function|int|void|bool|char|float|double|struct|auto|size_t|vector|string|nullptr|NULL|true|false|True|False|None|include|using|namespace|public|private|protected)\b)|("[^"]*"|'[^']*')|(\b\d+\b)|([a-zA-Z_]\w*(?=\s*\())|([^\s\w"']+|\w+|\s+)/g;

  let match;
  while ((match = tokenRegex.exec(codePart)) !== null) {
    if (match[1]) {
      tokens.push({ type: 'kw', text: match[1] });
    } else if (match[2]) {
      tokens.push({ type: 'str', text: match[2] });
    } else if (match[3]) {
      tokens.push({ type: 'num', text: match[3] });
    } else if (match[4]) {
      tokens.push({ type: 'fn', text: match[4] });
    } else {
      tokens.push({ type: 'plain', text: match[0] });
    }
  }

  if (commentPart) {
    tokens.push({ type: 'comm', text: commentPart });
  }

  return tokens.length > 0 ? tokens : [{ type: 'plain', text: line }];
}

/**
 * Standard Compiler Code Viewer Component
 * Renders source code in full compiler / IDE editor format with:
 * - Line numbers in gutter for every line
 * - Window title bar with compiler status, dots, file tabs, copy action
 * - High-contrast syntax styling
 * - Compiler status bar with line/column/UTF-8 info
 */
export default function CodeCompilerViewer({
  code = '',
  language = 'Python',
  title = '',
  tabs = [],
  activeTab = '',
  onTabChange,
  maxHeight = '320px',
  allowCopy = true,
  filename,
}) {
  const [copied, setCopied] = useState(false);

  // Normalize code lines (preserve empty lines)
  const normalizedCode = (code || '').replace(/\r\n/g, '\n');
  const lines = normalizedCode.split('\n');
  const lineCount = lines.length;

  const currentLanguage = activeTab || language || 'Python';
  const displayFileName = filename || title || `main.${getFileExtension(currentLanguage)}`;

  const handleCopyCode = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(normalizedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="compiler-frame">
      {/* 1. Standard Compiler IDE Titlebar */}
      <div className="compiler-titlebar">
        <div className="compiler-titlebar-left">
          {/* macOS / IDE Control Dots */}
          <div className="compiler-dots-group" aria-hidden="true" title="Compiler Window Controls">
            <span className="compiler-dot dot-close" />
            <span className="compiler-dot dot-minimize" />
            <span className="compiler-dot dot-expand" />
          </div>

          {/* Language Tabs or File Tab */}
          {tabs && tabs.length > 0 ? (
            <div className="compiler-tabs-container">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`compiler-tab-btn ${currentLanguage === tab ? 'active' : ''}`}
                  onClick={() => onTabChange && onTabChange(tab)}
                  title={`Switch to ${tab} compiler`}
                >
                  <span className="compiler-tab-glyph">{getLanguageGlyph(tab)}</span>
                  <span className="compiler-tab-label">{tab}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="compiler-file-tab">
              <span className="compiler-tab-glyph">{getLanguageGlyph(currentLanguage)}</span>
              <span className="compiler-file-label">{displayFileName}</span>
            </div>
          )}
        </div>

        {/* Titlebar Right: Line Count & Copy Button */}
        <div className="compiler-titlebar-right">
          <span className="compiler-meta-badge">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'} • {currentLanguage}
          </span>
          {allowCopy && (
            <button
              type="button"
              className="compiler-copy-btn"
              onClick={handleCopyCode}
              title="Copy source code to clipboard"
            >
              {copied ? (
                <>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Code</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 2. Compiler Gutter & Code Area with Every Line Number */}
      <div className="compiler-code-viewport" style={{ maxHeight }}>
        <table className="compiler-code-table" cellSpacing="0" cellPadding="0">
          <tbody>
            {lines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const tokens = tokenizeLine(lineText);

              return (
                <tr key={idx} className="compiler-line-row">
                  {/* Line Number in Standard Gutter */}
                  <td className="compiler-gutter-col" aria-hidden="true">
                    <span className="compiler-line-num">{lineNum}</span>
                  </td>

                  {/* Code Line Content */}
                  <td className="compiler-content-col">
                    <pre className="compiler-code-pre">
                      <code>
                        {tokens.map((tok, tIdx) => (
                          <span key={tIdx} className={`tok-${tok.type}`}>
                            {tok.text}
                          </span>
                        ))}
                      </code>
                    </pre>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. Compiler Status Bar */}
      <div className="compiler-statusbar">
        <div className="compiler-status-left">
          <span className="compiler-status-beacon" />
          <span className="compiler-status-text">Standard {currentLanguage} Compiler</span>
        </div>
        <div className="compiler-status-right">
          <span>Ln {lineCount}, Col 1</span>
          <span className="status-sep">|</span>
          <span>Spaces: 4</span>
          <span className="status-sep">|</span>
          <span>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
