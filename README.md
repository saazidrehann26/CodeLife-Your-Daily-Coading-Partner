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

## Battle Zone - Live Split-Screen Code Battles

Battle Zone is a competitive, real-time code arena where two teams battle live in a symmetrical split-screen environment.

### 1. Formats
- **Circle vs Circle**: Two distinct circles battle each other. The admin of one circle sends a battle request (searching by circle name or invite code), and the challenged circle's admin accepts via notification.
- **Inside-Circle**: A single circle splits into Team A and Team B (minimum 2 players per team, minimum 4 players per circle). Each team has a designated captain.

### 2. Screen Layout (`/battle-zone/:battleId` or `#battle-zone/:battleId`)
- **Split-Screen (50/50)**: Team A on the left, Team B on the right, separated by a glowing vertical divider. On mobile (`<= 900px`), the arena adapts into responsive tabs ("My Team" / "Opponent").
- **Top Bar**: Synchronized countdown timer, phase badge, round counter, and real-time score display (`A 1 : 0 B`).
- **Side Headers**: Circle / Team Name, captain badge with 👑 icon, online member roster, team score, and live status chip (`Writing`, `Running test...`, `Submitted`, `Passed ✓`, `Failed ✗`).
- **Problem Window**: Resizable/collapsible card displaying challenge title, description, constraints, and sample test cases.
- **Compiler Window**: Monaco Editor with fixed battle language, real-time teammate collaborative sync, stdin drawer, console output terminal, and `Run Code` / `Submit Solution` actions.

### 3. State Machine & Phases
1. **`LOBBY`**: Captains and admins lock match parameters (language: C++, Python, C; rounds; authoring and solving time limits; challenge type: *Write from Scratch*, *Fix the Bug*, *Complete the Code*; flow mode: *Simultaneous* vs *Sequential*). Both captains mark ready to unlock the match (with admin start override available).
2. **`AUTHORING`**: Each team writes a challenge for the opposing team: title, description, starter code, reference solution, and test cases (sample vs hidden).
   - **Validation**: Server verifies that the reference solution compiles and passes 100% of test cases. For *Fix the Bug* and *Complete the Code*, the starter code must fail at least one test case.
   - **Fallback**: If authoring time expires, a curated algorithmic problem is automatically selected matching the battle language.
3. **`SWAP`**: 5-second countdown screen as challenges are exchanged. Hidden test cases and reference solutions remain strictly protected server-side.
4. **`SOLVING`**: Teams receive the opponent's challenge in their problem window and collaborate in Monaco Editor to solve it.
5. **`EVALUATION`**: Submission is evaluated via Judge0 against 100% of test cases (including hidden tests).
6. **`ROUND_RESULT`**: Scoreboard update, solve time comparison, and point awards.
7. **`FINISHED`**: Victory celebration modal, Champion announcement, MVP award (fastest solve time), and post-match reference solution reveal for learning.

### 4. Opponent Privacy & Sandboxing Safety
- **Opponent Code Shielding**: A team can see only the opponent's status chip, never their code or terminal output during the battle.
- **Sandboxed Execution**: All code runs inside Judge0 CE micro-containers with strict CPU (2s) and memory (128MB) limits.
- **Spectator Mode**: Non-participating circle members can view in read-only mode if enabled by the match admin.

### 5. Running Tests
```bash
node --test test/*.test.js
```
Runs the full test suite (77 tests) including battle creation, lobby state transitions, challenge validation, opponent privacy, scoring, and captain auto-promotion.

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
