/**
 * Judge0 Online Compiler Service
 *
 * Runs entirely in the browser using the public Judge0 API (https://ce.judge0.com)
 * Uses confirmed Judge0 CE language IDs:
 *   - 50: C (GCC 9.2.0)
 *   - 54: C++ (GCC 9.2.0)
 *   - 71: Python (3.8.1)
 *
 * Implements simulated interactive execution via preamble instrumentation for C/C++
 * and EOFError detection for Python.
 */

// Debug flag: logs every Judge0 call with stdin sent, stdout, stderr, status, exit code, and decision
export const DEBUG = true;

// Confirmed Language IDs from https://ce.judge0.com/languages
export const CONFIRMED_LANGUAGE_IDS = {
  C: 50,
  CPP: 54,
  PYTHON: 71,
};

/**
 * C Instrumentation Preamble
 * Includes standard headers BEFORE macro definitions.
 * Intercepts scanf, fscanf (with stdin), getchar, getc, fgetc, fgets, and gets so that
 * upon hitting EOF, stdout is flushed, marker "__NEED_INPUT__" is written to stderr, and _exit(0) is called.
 * Followed by #line 1 so compiler error line numbers exactly match the user's source code.
 */
export const C_INSTRUMENTATION_PREAMBLE = `/* === JUDGE0 C INSTRUMENTATION PREAMBLE === */
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>

#define __NEED_INPUT__ "__NEED_INPUT__"

static inline void __trigger_need_input__(void) {
    fflush(stdout);
    write(2, __NEED_INPUT__, 14);
    _exit(0);
}

#define scanf(...) ({ \\
    int __r = (scanf)(__VA_ARGS__); \\
    if (__r == EOF || feof(stdin)) { \\
        __trigger_need_input__(); \\
    } \\
    __r; \\
})

#define fscanf(stream, ...) ({ \\
    FILE *__s = (stream); \\
    int __r = (fscanf)(__s, __VA_ARGS__); \\
    if ((__s == stdin && __r == EOF) || (__s == stdin && feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __r; \\
})

#define getchar() ({ \\
    int __c = (getchar)(); \\
    if (__c == EOF || feof(stdin)) { \\
        __trigger_need_input__(); \\
    } \\
    __c; \\
})

#define getc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (getc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgetc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (fgetc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgets(s, size, stream) ({ \\
    FILE *__s = (stream); \\
    char *__res = (fgets)(s, size, __s); \\
    if (!__res && (__s == stdin || feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __res; \\
})

#define gets(s) ({ \\
    char *__res = (gets)(s); \\
    if (!__res && feof(stdin)) { \\
        __trigger_need_input__(); \\
    } \\
    __res; \\
})
#line 1
`;

/**
 * C++ Instrumentation Preamble
 * Includes standard headers BEFORE macro definitions.
 * Replaces std::cin's stream buffer with an interceptor that triggers __NEED_INPUT__
 * on underflow / uflow at EOF, and wraps C I/O functions.
 * Followed by #line 1 so compiler error line numbers match user's source code.
 */
export const CPP_INSTRUMENTATION_PREAMBLE = `/* === JUDGE0 C++ INSTRUMENTATION PREAMBLE === */
#include <iostream>
#include <string>
#include <streambuf>
#include <cstdio>
#include <cstdlib>
#include <unistd.h>

#define __NEED_INPUT__ "__NEED_INPUT__"

namespace __judge0_input_interceptor__ {
    static inline void __trigger_need_input__() {
        std::cout.flush();
        fflush(stdout);
        write(2, __NEED_INPUT__, 14);
        _exit(0);
    }

    class InterceptBuf : public std::streambuf {
        std::streambuf* orig;
        char ch;
    public:
        InterceptBuf(std::streambuf* o) : orig(o), ch(0) {}
    protected:
        virtual int_type underflow() override {
            int_type c = orig->sbumpc();
            if (c == traits_type::eof()) {
                __trigger_need_input__();
                return traits_type::eof();
            }
            ch = traits_type::to_char_type(c);
            setg(&ch, &ch, &ch + 1);
            return c;
        }
        virtual int_type uflow() override {
            int_type c = orig->sbumpc();
            if (c == traits_type::eof()) {
                __trigger_need_input__();
                return traits_type::eof();
            }
            return c;
        }
    };

    static struct Init {
        InterceptBuf* ib;
        Init() {
            ib = new InterceptBuf(std::cin.rdbuf());
            std::cin.rdbuf(ib);
        }
    } __init__;
}

#define scanf(...) ({ \\
    int __r = (scanf)(__VA_ARGS__); \\
    if (__r == EOF || feof(stdin)) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __r; \\
})

#define fscanf(stream, ...) ({ \\
    FILE *__s = (stream); \\
    int __r = (fscanf)(__s, __VA_ARGS__); \\
    if ((__s == stdin && __r == EOF) || (__s == stdin && feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __r; \\
})

#define getchar() ({ \\
    int __c = (getchar)(); \\
    if (__c == EOF || feof(stdin)) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __c; \\
})

#define getc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (getc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgetc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (fgetc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgets(s, size, stream) ({ \\
    FILE *__s = (stream); \\
    char *__res = (fgets)(s, size, __s); \\
    if (!__res && (__s == stdin || feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __res; \\
})

#define gets(s) ({ \\
    char *__res = (gets)(s); \\
    if (!__res && feof(stdin)) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __res; \\
})
#line 1
`;

/**
 * Robust base64 encoding using TextEncoder for UTF-8 and non-ASCII safety
 */
export function toBase64(str) {
  if (typeof str !== 'string') return '';
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/**
 * Robust base64 decoding using TextDecoder for UTF-8 and non-ASCII safety
 */
export function fromBase64(b64) {
  if (!b64 || typeof b64 !== 'string') return '';
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return b64;
  }
}

/**
 * Prepend instrumentation preamble for C / C++ or return unmodified for Python
 */
export function prepareSourceForExecution(languageId, userCode) {
  const lid = Number(languageId);
  if (lid === CONFIRMED_LANGUAGE_IDS.C) {
    return C_INSTRUMENTATION_PREAMBLE + (userCode || '');
  }
  if (lid === CONFIRMED_LANGUAGE_IDS.CPP) {
    return CPP_INSTRUMENTATION_PREAMBLE + (userCode || '');
  }
  return userCode || '';
}

/**
 * Determine if program is waiting for input based on stderr markers
 */
export function checkWaitingForInput(languageId, result) {
  const lid = Number(languageId);
  const stderr = result?.stderr || '';

  if (lid === CONFIRMED_LANGUAGE_IDS.PYTHON) {
    // Python raises EOFError when input() hits EOF
    if (stderr.includes('EOFError')) {
      return { isWaiting: true, cleanStderr: '' };
    }
  } else if (lid === CONFIRMED_LANGUAGE_IDS.C || lid === CONFIRMED_LANGUAGE_IDS.CPP) {
    // C and C++ trigger __NEED_INPUT__
    if (stderr.includes('__NEED_INPUT__')) {
      const cleanStderr = stderr.replace(/__NEED_INPUT__/g, '').trim();
      return { isWaiting: true, cleanStderr };
    }
  }

  return { isWaiting: false, cleanStderr: stderr };
}

/**
 * Core Judge0 execution function.
 * ALL communication with Judge0 is centralized here.
 *
 * @param {number|string} languageId
 * @param {string} sourceCode
 * @param {string} stdin
 * @param {object} options - { cpu_time_limit, memory_limit, signal, apiUrl }
 */
export async function runCode(languageId, sourceCode, stdin = '', options = {}) {
  const url = options.apiUrl || 'https://ce.judge0.com/submissions?base64_encoded=true&wait=true';

  const payload = {
    source_code: toBase64(sourceCode),
    language_id: Number(languageId),
    stdin: toBase64(stdin),
    cpu_time_limit: options.cpu_time_limit !== undefined ? options.cpu_time_limit : 2,
    memory_limit: options.memory_limit !== undefined ? options.memory_limit : 128000,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('HTTP 429: Judge0 public instance rate limit exceeded. Please wait a few seconds and try again.');
      }
      throw new Error(`Judge0 API returned HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    const decoded = {
      ...data,
      stdout: fromBase64(data.stdout),
      compile_output: fromBase64(data.compile_output),
      stderr: fromBase64(data.stderr),
      message: fromBase64(data.message),
    };

    return decoded;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    if (err.message && err.message.includes('429')) {
      throw err;
    }
    throw new Error(`Network failure: Unable to reach Judge0 API (${err.message}). Please check internet connection.`);
  }
}

// Alias for backwards compatibility
export const executeCode = (sourceCode, languageId = 50, stdin = '') => {
  const prepared = prepareSourceForExecution(languageId, sourceCode);
  return runCode(languageId, prepared, stdin);
};

export const executeCCode = (code, stdin = '') => executeCode(code, 50, stdin);
export const executeCppCode = (code, stdin = '') => executeCode(code, 54, stdin);
export const executePythonCode = (code, stdin = '') => executeCode(code, 71, stdin);
