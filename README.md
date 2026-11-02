# CodeLife - Daily Code Practice & Online Compiler

A full-stack React + Vite application for coding practice, interactive code execution, problem tracking, and code store management.

---

## Online Code Compiler (xterm.js + Judge0 CE)

The application features an interactive online code compiler powered by Monaco Editor, xterm.js, and the public Judge0 API (`https://ce.judge0.com`).

### Architecture & Key Features

1. **Unified Interactive Terminal (xterm.js)**
   - Replaces separated stdin/stdout input boxes with a single, real-time terminal window (`xterm.js` + `@xterm/addon-fit`).
   - The user views prompts and types inputs in the same terminal view.
   - Built-in handling for line editing: printable characters, `Backspace` (constrained to not delete past prompt start), and `Enter` key execution.

2. **Supported Languages & Confirmed Judge0 IDs**
   Directly queried from `https://ce.judge0.com/languages`:
   - **C**: Language ID `50` (`C (GCC 9.2.0)`)
   - **C++**: Language ID `54` (`C++ (GCC 9.2.0)`)
   - **Python**: Language ID `71` (`Python (3.8.1)`)
   - Switching language in the dropdown synchronizes starter code, Monaco syntax highlighting, and execution configuration.

3. **Simulated Interactivity & Input Replay**
   - Since execution runs serverlessly directly against Judge0 without a persistent PTY server, interactivity is achieved through session input history re-execution.
   - On each `Enter`, the accumulated input line is appended to `inputs`, and code is re-submitted with `stdin = inputs.join("\n") + "\n"`.
   - **Output Delta Display**: The terminal computes the delta against previously displayed output length (`rawStdout.slice(prevLen)`), streaming only newly generated output to preserve a seamless terminal appearance.
   - **Divergence Warning**: If non-deterministic code (e.g. `time()` or `rand()`) produces divergent output across re-runs, a friendly yellow warning is displayed.

4. **Preamble Instrumentation for Waiting-for-Input Detection**
   - **Python**: Detects `EOFError` in `stderr`, suppresses the traceback, and sets terminal cursor active for input.
   - **C**: Prepends an instrumentation preamble intercepting `scanf`, `getchar`, `fgets`, and `gets`. On EOF, stdout is flushed, marker `"__NEED_INPUT__"` is written to stderr, and `_exit(0)` is invoked. Followed by `#line 1` to keep compiler error line numbers matching user source.
   - **C++**: Replaces `std::cin` stream buffer (`underflow()` interceptor) and wraps C I/O functions to trigger `"__NEED_INPUT__"` on EOF. Followed by `#line 1`.

5. **Safety Limits & Error Handling**
   - `cpu_time_limit`: 2 seconds.
   - `memory_limit`: 128 MB (128,000 KB).
   - Maximum 30 re-runs per interactive session to protect Judge0 public API rate limits.
   - Graceful HTTP 429 throttling and network failure messages in the terminal.
   - Stop button with `AbortController` to cancel in-flight requests and immediately terminate active sessions.
   - All Judge0 communication is centralized in `src/services/compilerService.js` (`runCode`). No API keys in client-side code.

---

## Running Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

3. **Build for production:**
   ```bash
   npm run build
   ```
