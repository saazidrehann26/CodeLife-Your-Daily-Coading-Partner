# UI Specification — CodeLife Complete Authentication System

## Brand Identity
- **Application Name:** **CodeLife**
- **Brand Logo:** Coding Brain Emblem with circuit nodes, curly braces, and `< / >` code symbol
- **Logo Sources:**
  - `public/codelife_logo_white_bg.png` & `public/codelife_logo_square.png` (840×840 1:1 proportional crop with exact pure white `#FFFFFF` background from `public/app_logo_and_favicon.jpg`)
  - `public/app_logo_and_favicon.jpg` (Original source file)
- **Favicon:**
  - `public/favicon_brand.png` (128×128 exact `#FFFFFF` white background)
  - `public/favicon.ico` (32×32 exact `#FFFFFF` white background for browser tab)
  - `public/favicon.png` (exact `#FFFFFF` white background)
- **Brand Pill:** `CodeLife` pill badge in uppercase relief on all pages
- **Company Branding Logo:**
  - `public/company_logo.png` & `public/company_logo_clean.png` (Horizontal organization logo with circular labyrinth emblem and pure white title text, tightly cropped to 586x256, 2.289:1 aspect ratio)
  - Styled with frosted glass capsule container (`background: rgba(46, 31, 28, 0.72); backdrop-filter: blur(14px); border: 1px solid rgba(255, 255, 255, 0.22);`) and pure white backlight halo, positioned at the top-left corner of the viewport.

## Theme & Palette
- **Primary Color:** `#60433D` (Warm Deep Cocoa / Terracotta Bronze)
- **Backlight Accent:** Pure White (`#FFFFFF`) multi-level illumination halo embedded directly behind the spherical frame
- **Ambient Canvas:** Custom circuit board background wallpaper (`/log_in_page_bg.jpg`) with warm copper traces and centered card aperture
- **Input Fill (Debossed Cavity):** `#503631`
- **Text:** `#FCF9F8` (Primary), `#D9CAC7` (Muted), `#B39F9B` (Faint), `#4ADE80` (Recovery Status Green)

---

## Typography
- **Headings (`.main-message`):** **Bell MT** (`'Bell MT', 'Bell', 'Georgia', 'Baskerville', 'Times New Roman', serif`)
  - Applied to `"Let's start coding again"`, `"Create your account"`, `"Recover your account"`, and `"Verify your mail"`
  - High-contrast, editorial serif styling with subtle embossed light highlights (`text-shadow`)
- **Body & Controls:** `'Outfit'`, system-ui, -apple-system, sans-serif
- **Codes & OTP:** `'JetBrains Mono'`, monospace

## Background Image & Ratio Integration
- **Source:** `public/log_in_page_bg.jpg` (native `2752x1536`, 16:9 aspect ratio)
- **Proper Ratio Rendering:**
  - Set via `background-size: cover;` and `background-position: center center;` ensuring zero distortion, stretching, or warping across any screen aspect ratio (ultrawide, 16:9, laptop, tablet, mobile).
  - Implemented as a dedicated fixed viewport layer (`.login-page-bg` with `width: 100vw; height: 100vh; height: 100dvh;`) to prevent background jitter when forms expand or on mobile keyboard popup.
  - Layered with a subtle radial vignette overlay to keep the centered spherical frame and pure white backlight halo popping with high contrast.

## Landing & Introduction Page Architecture
- **Component:** `src/components/LandingPage.jsx` & `LandingPage.css`
- **Entry Behavior:** Defaults as the initial page (`currentPage = 'landing'`) before the login/auth flow.
- **Fixed Still Background:** `public/log_in_page_bg.jpg` pinned to viewport (`position: fixed; inset: 0; background-size: cover; background-position: center center;`) while content scrolls smoothly over it.
- **Top Navigation Bar (Never Half-Cut):**
  - Styled with `position: fixed; top: 0; left: 0; right: 0; width: 100%; z-index: 1000;` ensuring zero clipping or vertical half-cuts on page reload / scroll restoration.
  - Generous top padding (`padding-top: 105px;`) on main content prevents overlap.
  - **Left:** Company Branding Logo capsule + CodeLife circular white logo and title (`Bell MT`).
  - **Right Controls (in exact sequence):**
    1. `"Get started for free"`: Prominent pill CTA button with arrow icon, transitioning to the Sign In / Sign Up flow.
    2. `"Contact Us"`: Navigation button opening frosted support dialog with email links.
    3. `"Privacy Policy"`: Navigation button opening data security & encryption policy dialog.
    4. `"About us"`: Navigation button scrolling to purpose section and opening mission dialog.
- **Hero / Purpose Section:**
  - Image (`public/landing_page.jpg`): Centered frame with `fade-in-up` transition.
  - Heading: `"What is the purpose of CodeLife"` in `Bell MT` with `fade-in-up` transition.
  - Purpose Paragraph (from `public/webite_landing_text.txt`): Embossed frosted card with `slide-in-up` transition.
- **Continuous Scroll Animations (`IntersectionObserver`):**
  - Transition duration set to **`1.8s`** (`cubic-bezier(0.16, 1, 0.3, 1)`) for extended, silky-smooth cinematic gliding.
  - Elements automatically remove `.is-visible` on exiting viewport and re-add it on entering, ensuring animations replay every single time the user scrolls back through the page.
- **Features Section Divider:**
  - Styled with `"Platform Features"` pill in **Bell MT**, pure white (`#ffffff`), font size **24px** (increased by 3pt from 21px), centered with glowing horizontal accent rules.
- **Scroll-Triggered Feature Showcases:**
  1. **"Code Store"**:
     - Text (title in `Bell MT` + problem curation perks): Slides in from the left (`anim-slide-in-left`).
     - Image (`public/codestore.png`): Slides in from the right (`anim-slide-in-right`).
  2. **"Code Editor" (Enlarged Compiler Showcase)**:
     - Dedicated expansive grid ratio (`1.45fr 1fr` on desktop) providing significantly enlarged, crisp presentation for `public/compiler.png` (`.compiler-feature-img` & `.compiler-glow-wrap`).
     - Image side: Slides in from the left (`anim-slide-in-left`).
     - Text side: Slides in from the right (`anim-slide-in-right`).
     - Languages Showcase: "C" (`public/c_logo_white.png`), "C++" (`public/cpp_logo_white.png`), and "Python" (`public/python_logo_white.png`) rendered as custom pure white (`#ffffff`) vector-precise logos on transparent backgrounds with subtle depth shadow, sized at `29px × 29px` (+3pt enlargement), sliding up together in a synchronized transition.
  3. **"Streak Counter"**:
     - Text & Streak Badge (`public/streak.png`): Slides in from the left (`anim-slide-in-left`).
     - Graph Image (`public/graph.png`): Slides in from the right (`anim-slide-in-right`).
  4. **Ending Showcase**:
     - Combined Platform Image (`public/combine.png`): Fades in as user scrolls to the bottom.
     - Final Call to Action Box: Large `"Get started for free →"` button.
- **Two-Way & Browser History Navigation:**
  - Integrated with the native **HTML5 History API** (`window.history.pushState`, `window.history.replaceState`, and `popstate` event listeners).
  - Enables full browser **Backward (←)** and **Forward (→)** button functionality across all views (`landing` ⇄ `signin` ⇄ `forgot-password` ⇄ `recovery-otp` ⇄ `new-password` ⇄ `signup-otp`).
  - Supports deep-linking and direct page refresh via hash routes (e.g. `/#signin`, `/#forgot-password`).
  - Login page includes a top-right `"← Home"` button to return to the landing page at any time.

---

## Real-Time Password Strength Indicator
Placed directly below the password input field on the **Registration / Sign Up** form and **Password Reset** form.

### 1. 5 Specific Validation Rules
1. **Minimum 8 characters** (`password.length >= 8`)
2. **At least one uppercase letter** (`/[A-Z]/`)
3. **At least one lowercase letter** (`/[a-z]/`)
4. **At least one number** (`/[0-9]/`)
5. **At least one special character** (`/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/`)

### 2. UI/UX & Real-Time Feedback
- **5-Segmented Progress Meter**: Updates in real time as the user types.
- **Weak**: **Red** (`#EF4444`) — Meets 0-2 criteria.
- **Fair / Medium**: **Yellow / Orange** (`#F59E0B`) — Meets 3-4 criteria.
- **Strong**: **Green** (`#22C55E`) — Meets all 5 criteria.
- **Real-Time Helper Text**: Tells user what is missing (e.g., `"Missing: Add a special character (e.g. !@#$%^&*)"`, `"Missing: Add an uppercase letter (A-Z)"`).
- **Interactive Criteria Pills**: 5 compact chips (`8+ chars`, `Uppercase`, `Lowercase`, `Number`, `Special symbol`) showing checkmark `✓` when met.

### 3. Form Submission Rule
- The `'Sign up'` / `'Register'` button is **strictly disabled** (`disabled={!isPasswordStrong}`) until the password reaches the **Strong** criteria (all 5 rules met).
- When disabled, styled with opacity `0.45` and `cursor: not-allowed` with tooltip guidance.

---

## Browser Autofill Override
- Overrode browser-default white/blue autofill backgrounds using `-webkit-box-shadow: 0 0 0 1000px #503631 inset !important;` and `-webkit-text-fill-color: #ffffff !important;`.
- Inputs always retain their dark `#503631` embossed cavity styling and white typography when autofilled.

---

## Application Entry Point & Localhost Navigation Flow
- **Default Entry Point:** Every time the application is accessed or loaded on localhost (`http://localhost:5174/` or root URL), it **always starts from the Home Page (`landing`)**.
- **Session-Start Guarantee:** When a browser tab/window launches localhost, `sessionStorage` initialization ensures any lingering hashes (e.g. `#dashboard`) are cleared and the user lands on the Home Page (`LandingPage`).
- **Authenticated Home Page State:** When a user is logged in, the Home Page navigation bar and call-to-actions dynamically update:
  - **"Go to Dashboard →"** primary CTA button.
  - **User Profile Pill (`.landing-user-badge`)** displaying user avatar and full name.
  - **"Sign Out"** button to log out directly from the Home Page.
  - Ending CTA and About modal buttons direct the authenticated user to the Dashboard.
- **Log In Navigation:** Logging in on the Sign In page navigates the user to the **Home Page (`landing`)** with their authenticated session active, from where they can explore features or click **"Go to Dashboard →"** to enter the coding platform.

---

## Remember Me & Instant Access Flow
- **Credential Persistence (`codelife_remembered_credentials`):** When Remember Me is enabled on Sign In, the user's username/email and password are securely remembered in persistent client storage.
- **One-Click Instant Access ("Get Him In"):**
  - Clicking the **"Remember me"** checkbox or label when credentials are typed immediately validates the credentials, persists them, and logs the user in without requiring an additional click on the Sign In button.
  - If a user returns with previously saved credentials, clicking "Remember me" automatically loads them and logs them in.
- **Automatic Pre-fill:** When returning to the Sign In screen, remembered credentials (`username`, `password`) are automatically populated into the input fields, and the "Remember me" checkbox starts checked.
- **Opt-Out Control:** Explicitly unchecking the "Remember me" checkbox immediately clears saved credentials from storage. Signing in with Remember Me unchecked clears any previously stored credentials.

---

## Email Structure & Database Rules
- **Email Structure:** Must strictly match `{user}@{domain}.com` (e.g. `name@domain.com`). Rejects missing `@`, missing domain, or missing TLD.
- **Database Presence Check:**
  - **Forgot Password:** Checks if the entered mail/username exists in the persistent database (`localStorage`). If not found, immediately displays `"This email/username is not found in our database"` and **does not send any email**. If found, resolves their registered email and dispatches the OTP.
  - **Sign Up:** Verifies that neither the email nor the username is already registered. If taken, prevents submission and shows error. Upon successful OTP verification, registers the new user into the database.
  - **Sign In:** Verifies credentials against the database.
- **Legacy Seed Removal:** Dummy account `Alex Johnson` (`love_code`, `lovecode@gmail.com`) has been completely removed from seed users, memory defaults, and persistent browser storage. An automatic purge cleans any legacy keys on startup.

---

## Keyboard Navigation (Enter Key)
- Pressing `Enter` in any credential box automatically advances focus to the next input box:
  - **Sign Up:** `Name` → `Username` → `Email` → `Password` → `Confirm Password` → Submits form.
  - **Sign In:** `Username/Mail` → `Password` → Submits form.
  - **New Password:** `New Password` → `Confirm New Password` → Submits form.
  - **Spherical OTP Boxes:** Automatically advances between spherical boxes upon typing digits and on `Enter`.

---

## 1. Forgot Password Page
- **Route / State:** `'forgot-password'`
- **Heading:** `"Recover your account"`
- **Input Field:** `"Your registered mail/username"`
- **Button:** `"Check database and send OTP"`
- **Brand Header:** CodeLife logo badge and "CodeLife" pill

---

## 2. Password Recovery OTP Page & New Password Flow
- **Heading:** `"Recover your account"`
- **Status Text:** `"Mail sent successfully to {{email address}}"` in emerald green (`#4ADE80`).
- **5 Spherical Boxes:** Circular debossed frames with proportional typography.
- **Countdown Timer:** 3-minute (`03:00`) timer.
- **Resend Action:** `"If you don't receive mail, send again"`.
- **Automatic Verification:** Enters 5th digit → auto-verifies (no button needed) → opens New Password Page.
- **New Password Page:** `"Your new password"` & `"Confirm new password"` with real-time password strength meter. Pressing Enter advances and submits to update the database.

---

## 3. Sign-Up OTP Verification Page
- **Heading:** `"Verify your mail"`
- **5 Spherical Boxes:** Same layout and 3-minute timer.
- **Automatic Verification:** Enters 5th digit of the correct OTP → auto-verifies → registers user in database → initializes user profile & practice stats → sets active session and immediately takes the user directly to the **Dashboard** (does not take them back to the home page or sign in).

---

## 4. Main Platform Dashboard Architecture
- **Component:** `src/components/DashboardPage.jsx` & `DashboardPage.css`
- **Route / State:** `'dashboard'` (Accessible via login or directly via `#dashboard`)
- **Theme & Styling:**
  - **Full-Width Edge-to-Edge Layout:** The container spans `width: 100%; max-width: 100%;` pulling the profile and navigation sidebar all the way to the left, and pulling the streak & activity graph all the way to the right with consistent 28px outer margins, while maximizing the width of the center content area (`minmax(0, 1fr)`).
  - **Glassmorphism:** `backdrop-filter: blur(18px)`, translucent cocoa panels (`rgba(43, 27, 24, 0.62)`), thin glassy borders with subtle lighting highlights.
  - **Separated Spherical Buttons:** Every interactive control features a distinct 3D convex spherical area with multi-level relief shadows (`inset 1.5px 1.5px 2px rgba(255, 255, 255, 0.35), inset -2px -2px 4px rgba(0, 0, 0, 0.6)`).
  - **Pure White Typography (`#ffffff`):** Every text element across the dashboard—including headings, welcome banner salutation, body paragraphs, section titles, difficulty pills, language badges, dates, handles, stat counters, labels, axis indicators, code previews, and modal content—is styled with pure white font (`#ffffff`) for maximum clarity and contrast against the dark glassmorphic circuit backdrop.
- **Brand Identity & Navigation:**
  - **Circular Logo:** `public/codelife_logo_white_bg.png` enclosed in a 44px circular glass frame with glowing border.
  - **Platform Title:** `"CodeLife"` in **Bell MT** font (`font-family: 'Bell MT', 'Bell', 'Georgia', serif; font-size: 26px; font-weight: 700;`).
  - **Top Navigation Bar:**
    - **Left:** Circular CodeLife logo and "CodeLife" title in Bell MT font.
    - **Right:** Authenticated User Profile Pill (user avatar and exact full name), opening the profile modal.
  - **Left Sidebar Organization:**
    - **User Profile Card:** Positioned prominently at the top of the sidebar above the navigation controls, displaying photo, prominent full name (`21px`, bold), clear username handle (`15px`), university / institution badge (`13.5px`), and "View Profile" button.
    - **Navigation Menu:** Clean spherical action buttons for `Practice Area`, `Code Store`, and `Settings`.
- **Center Section Features:**
  - **Zero-State Initialization on Signup:** When any user signs up, all dashboard metrics start strictly at ZERO:
    - **Today's Challenge:** Shows `Day 0 • Practice Not Started`, ready for the user to solve their first challenge.
    - **Recent Problems:** Initialized to `0 problems` (clean empty feed with prompt to store their first code).
    - **Streak Counter:** Initialized to `0 Days` (`current_streak: 0`, `longest_streak: 0`, `total_problems_solved: 0`, `last_active_date: null`).
    - **Activity Graph:** 0 submissions across all 30 days (`count: 0` on every bar).
  - **Practice Inception Tracking:** The very first time the user starts practicing (either by completing Today's Challenge or saving code into Code Store):
    - Practice officially begins: `first_practice_date` is stamped to the current local date.
    - Today's Challenge advances to `Day 1 • Today`.
    - Streak immediately starts at `1 Day`.
    - Activity graph records today's submission, elevating today's bar.
    - Subsequent days advance progressively according to the Stateless Date-Math Algorithm modulo `n`.
  - **Welcome Note:** Minimalist, high-focus `"Welcome, {{user 2nd name}}"` in **Bell MT** font (derived dynamically from the authenticated user's exact name).
  - **Recent Problems:** Real-time feed showing the latest 2 problems added to Code Store, with problem title, language badge, date/time, and instant "View Code" modal. When empty, displays guidance prompt to store code.
  - **Today's Challenge (Conditional Content Display):**
    - The Today's Challenge card appears on the dashboard. When Code Store is empty (`allStoredCodes.length === 0`), the problem and compiler are hidden, displaying: `"No stored problems in Code Store yet. Store your first code using \"+ Add New Code\" above to unlock Today's Challenge!"`.
    - Once code is stored, the active challenge unlocks, driven by the **Stateless Date-Math Algorithm (Zero Database Writes)**: `Days_Passed = floor((Today_Local - First_Practice_Date) / 1 day)`, `Daily_Index = Days_Passed % Total_Problems`.
    - Features problem metadata, difficulty pill (Easy/Medium/Hard), description, input/output test examples.
    - **Standard Compiler Code Viewer (`CodeCompilerViewer`):**
      - Full IDE/compiler presentation with macOS-style window control dots (Close, Minimize, Expand), active language tabs (`Python`, `C++`, `C`), dynamic line count badge, and instant "Copy Code" button.
      - **Line Numbers Gutter:** Every single line of code displays an exact line number (`1, 2, 3...`) in a dedicated non-selectable left gutter with subtle divider line and line hover highlight.
      - **Compiler Status Bar:** Displays active compiler mode (`Standard C++ Compiler`), current line position (`Ln 14, Col 1`), encoding (`UTF-8`), and tab spacing (`Spaces: 4`).
    - "Mark Challenge as Completed" button triggers automatic streak day and total problem count increment.
- **Right Column Features:**
  - **Streak Counter:**
    - Displays flame badge (`public/streak.png`), `current_streak` days, `longest_streak` best score, and last active date status.
    - **Automatic Activity Tracking:** Streak day and total problem count automatically increment whenever a problem is completed or saved into Code Store (no manual "keep streak" button needed).
  - **Audio-Spectrum Activity Bar Graph:**
    - 30-day vertical activity bar chart using `generateBarGraphData`.
    - Proportional heights dynamically calculated against peak problem-solving activity with a subtle 2.5% inactive baseline.
    - Full-width clean chart container without any vertical Y-axis tick clutter or buttons.
    - **X-Axis (Timeline):** Displays `30 days ago`, `15 days`, and `Today` beneath the bars in pure white (`#ffffff`).
    - **Hover Tooltip & Clearance (Zero Overlap & Zero Clipping):**
      - Dedicated `28px` top margin on `.graph-container-wrap` ensures hover tooltips never overlap with the header caption (`"X total problems solved in last 30 days"`).
      - Tooltip features structured date (`12px #e6c4b4`, increased by 2pt) and problem count (`13px bold #ffffff`, increased by 2pt) with `5px 10px` padding.
      - Smart edge alignment: Leftmost bars clamp to `left: 0; transform: none;` and rightmost bars clamp to `right: 0; transform: none;`, preventing any tooltip clipping at card edges.
      - Header subtitle remains static and clean (`"X total problems solved in last 30 days"`).
    - Rendered with `display: flex; align-items: flex-end;` and glowing neon tops on active problem-solving days with hover tooltips.
- **Code Store Feature:**
  - Modal form for storing code with integrated standard compiler editor frame, dynamic filename tag, live line counter, location input, and status bar.
  - Features prominent enlarged action button **`+ Store New Code`** (`padding: 10px 24px; font-size: 15.5px; font-weight: 700;`) in the Code Store repository view for quick code submission.
  - Stored persistently with date, time, and custom location tag (`📍`), immediately updating Recent Problems and activity charts.
  - **Code Deletion Option:** Stored code snippets can be safely deleted directly from the **Code Store** modal cards, from the **Recent Problems** cards, and from inside the **View Code** compiler modal (`Delete Code` danger button) with a confirmation dialog.
  - **Live Compiler for Stored Code:** Opening any code from the Code Store launches the interactive 95% full-page **Online Compiler** (powered by Monaco Editor & Judge0). Users can freely edit the code, run it with real-time compilation and execution output, click **`Save Updates`** to persist changes back to their Code Store, or delete the problem.
  - **View Code Modal:** Integrates `OnlineCompiler` displaying the full source code in an editable standard compiler format with line numbers, syntax highlighting, filename tab, location badge, Run Code button, Save Updates button, Delete Code option, and copy action.
- **Practice Area Feature:**
  - Dedicated multi-language coding arena opened via **`Practice Area`** in the left sidebar navigation.
  - **Three Selectable Language Options:**
    1. **C:** Displays enlarged official pure white C hexagon shield (`/c_logo_white.png`, `50px × 50px`) and the name `C`.
    2. **C++:** Displays enlarged official pure white C++ hexagon shield (`/cpp_logo_white.png`, `50px × 50px`) and the name `C++`.
    3. **Python:** Displays enlarged official pure white Python interlocking snakes logo (`/python_logo_white.png`, `50px × 50px`) and the name `Python`.
  - **Interactive Selection Cards:** Three-column responsive grid with centered enlarged logos, bold language titles (`24px`), and hover lift. When opening the Practice Area, **no language is pre-selected by default** — all three cards (`C`, `C++`, `Python`) display neutral `Choose` status with no glowing borders. The user explicitly selects their preferred language, which triggers selection and immediately launches the compiler.
  - **Online Multi-Language Compilers (Judge0 API & Monaco Editor):**
    - Clicking on any language card (**C**, **C++**, or **Python**) directly launches the full-featured **Online Compiler** in a large, spacious window occupying **95% of the whole page** (`width: 95vw; height: 95vh; min-height: 95vh; max-height: 95vh;`).
    - **View Code Compiler Modal:** Saved code solutions in Code Store open in the same 95% full-page compiler viewer window format with line numbers and full height display.
    - **Monaco Editor Integration:** Embedded VS Code Monaco editor (`vs-dark`, language `c`/`cpp`/`python`, height: `50vh`) with full syntax highlighting, automatic layout, line numbers, and clean dark frame.
    - **Judge0 Execution (C ID 50 - GCC 9.2.0, C++ ID 54 - GCC 9.2.0, Python ID 71 - Python 3.8.1):**
      - Secure server route `/api/compile` (built into Vite dev middleware and standalone Express `server.js`) keeps API keys protected on the backend.
      - Base64 encoding/decoding enables full support for GCC compiler diagnostics, syntax errors with caret indicators, runtime outputs, and UTF-8 characters.
      - Real-time status indicators for Accepted (ID: 3), Time Limit Exceeded (ID: 5), and Compilation Error (ID: 6) with execution time and memory statistics.
      - Clean header with language logo, title (`C Compiler`, `C++ Compiler`, `Python Compiler`), and `✕` close button.
      - **Unified Compiler Toolbar Button Sizing:**
        - **Consistent Size & Proportion:** All action buttons in the compiler toolbar (**Run Code**, **Save to Code Store** / **Save Updates**, **Close**, and **Input (stdin)**) share the exact same height (`38px`), font size (`13.5px`), font weight (`600`), pill border-radius (`9999px`), padding (`0 18px`), and vertical alignment.
        - **Visual Balance:** Right-hand action buttons maintain a minimum width (`min-width: 90px`) so buttons like **Close** have matching visual weight and presence alongside **Run Code** and **Save to Code Store** without size disparities.
      - **In-Compiler Save Flow (User Stays on Compiler):** Clicking `Save to Code Store` inside any compiler window (Practice Area or Code Store) opens an in-compiler save dialog directly over the editor without redirecting away or closing the compiler. Users enter their custom **Problem Name** (location is not shown or required). Upon saving, the problem is saved to the Code Store, live streak and problem counts update, a confirmation toast appears (`✓ "[Problem Name]" saved to Code Store!`), the compiler title updates, and a `Save Updates` button is revealed for subsequent quick saves. The user remains entirely on the compiler window without interruption.
      - **Interactive Step-by-Step Terminal Session (No Extra Buttons, Keyboard Enter Workflow):**
        - **Zero Extra Button Clicks:** The user clicks **Run Code** once. From that moment onward, the interactive terminal session runs entirely via the keyboard (`[Enter]` key) inside the terminal console window.
        - **Sequential Input Prompts:** The compiler displays the first prompt (e.g. `Enter first number: `) with a transparent inline cursor. When the user types a value and presses `[Enter]`, that line is committed and the compiler automatically displays the next input prompt on the following line (e.g. `Enter second number: `).
        - **Final Result Output:** When all consecutive inputs have been entered via `[Enter]`, the program executes and displays the final result on the subsequent line, followed by `...Program finished with exit code 0` in bright green (`#68bb59`).
        - **Seamless Monospace Terminal Session:**
          ```
          Enter first number: 2
          Enter second number: 3
          Sum = 5

          ...Program finished with exit code 0
          ```
        - **Space-Separated Multi-Input Support:** Users can also supply all values on a single line separated by spaces (e.g. `2 3`); pressing `[Enter]` immediately proceeds to execution.
        - **Automatic Re-Focus:** Clicking anywhere in the terminal console auto-focuses the active input line so keyboard input is never lost.
      - **Backward Navigation & Session Guard:** Fully integrated with HTML5 History API (`pushState`/`popstate`). When a user is on any compiler page (Practice Area or Code Store) and clicks the browser's Back button (←), they smoothly return to the previous view (e.g. Practice Area language picker, Code Store, or Dashboard) rather than being signed out or kicked to the sign-in screen. Active login sessions are protected so users remain securely logged in.
- **Code Store 3-File Organization & Navigation:**
  - **No Location Displayed:** Stored code items display strictly the **Problem Name** and the **Language** badge (e.g. `C`, `C++`, `Python`). Location/platform indicators (`📍 LeetCode`, `📍 Practice Area`) are completely omitted from Code Store cards, Recent Problems cards, and modal forms.
  - **3 Language Files Navigation:** The Code Store organizes stored solutions into **3 distinct files** corresponding to the platform languages:
    - 📄 **C File (`.c`)**
    - 📄 **C++ File (`.cpp`)**
    - 📄 **Python File (`.py`)**
    - 📁 **All Codes** (overview tab displaying total counts)
  - **Store Code Redirects to Practice Area:** Clicking **`+ Store Code`** inside the Code Store automatically redirects the user to the **Practice Area** (with the active file language pre-selected, e.g. Python, C++, or C). In the Practice Area, the user can code in the online compiler and save their problem directly to Code Store using the in-compiler save feature.
  - **In-File Search Button & Navigation:** Inside each file view, a dedicated search bar with a **Search** button enables users to filter and navigate codes by problem name with real-time matching and reset controls.
- **Top Navigation Bar User Display:**
  - **Static Display Pill (`.dash-user-pill`):** Non-interactive badge displaying the user's circular avatar (`44px` with glowing border) and Full Name (`17px`, bold, `#ffffff`) on a frosted cocoa glassmorphic background (`rgba(43, 27, 24, 0.75)` with `1.5px` border). Default cursor, non-clickable, clean static presence. Full profile details remain easily viewable via the Left Sidebar Profile Card.
- **Left Sidebar User Profile Card:**
  - **Prominent Profile Picture Frame (`.sidebar-user-avatar-frame`):** Enlarged `96px × 96px` circular avatar container with 4px inner padding, copper/terracotta border, and 3D back-depth drop shadow.
  - **Typography:** Enlarged user name (`21px`), username handle (`15px`), and university/institution badge (`13.5px`).
- **Personal Details & Profile:**
  - **Sign-Up Form Streamlined:** When signing up, users are only asked for their **Name**, **Username**, **Email**, **Password**, and **Confirm Password**. No institutional or extra personal details are asked during registration. Enter key smoothly navigates: Name -> Username -> Email -> Password -> Confirm Password.
  - **First-Time Sign-Up Minimal Profile Display:** When a user registers for the first time, strictly only their **Name**, **Username**, and **Email** are displayed. All optional personal details (Age, Institution Name, Interests, and Bio) remain completely hidden until the user explicitly inputs them via `Settings -> Personal Details`.
  - **Default Profile Picture:** If the user has not uploaded or chosen a custom picture of themselves, the official **CodeLife Web Logo** (`/codelife_logo_white_bg.png`) is automatically displayed as their circular avatar across the top navigation bar, left sidebar profile card, and profile modals.
  - **Sidebar Badge:** Institution badge is rendered only when `institution` / `classGrade` has been provided by the user; no dummy fallback (e.g. `Developer`) is shown for new users.
  - **Profile Modal:** Displays Web Logo Avatar, Full Name, Username, and Email. Any optional fields (Age, Institution Name, Interests, Bio) are rendered only if filled by the user. Empty fields and placeholder boxes are not shown.
  - In-place editable form in Personal Details window (accessed via `Settings -> Personal Details`).
  - **In-Page Save & Clean Navigation:** Saving personal details keeps the user directly on the **Personal Details** page with an instant confirmation toast (`✓ Personal details saved successfully!`) and a temporary `✓ Saved!` button indicator. Users can continue reviewing or editing their details. Returning to Settings (or User Profile) via "Back to Settings" or the `✕` close button uses clean history replacement (`replaceState`), and closing Settings returns directly to the Dashboard without entering history ping-pong loops or getting stuck.
  - **Profile Picture Changer:** Features live circular avatar preview with camera overlay badge, local device image file upload (`FileReader` Base64 encoding saved to `localStorage`), reset to web logo button, and quick preset avatar selectors (`Web Logo (Default)`, `CodeLife Square`, `CodeLife Dark`, `Flame Badge`, `Company Crest`). When saved, the new photo immediately updates across the top navbar, left sidebar card, and profile modals.

- **Unified Online Code Compiler & Interactive Terminal (`xterm.js` + Judge0):**
  - **Single Interactive Terminal:** Replaces previous separate stdin and output textboxes with a unified, interactive terminal powered by `@xterm/xterm` and `@xterm/addon-fit`. Prompts and user inputs occur within the exact same console view.
  - **Simulated Input Interactivity:** Operates serverlessly against the public Judge0 API (`https://ce.judge0.com`) by tracking input history (`inputs`), re-executing with base64 encoded payload upon each `Enter`, and computing stdout delta slicing (`rawStdout.slice(prevLen)`) to display subsequent prompt/results seamlessly.
  - **Waiting-for-Input Interception:**
    - C/C++: Code instrumentation preamble with `#line 1` catches `scanf`, `getchar`, `fgets`, and `std::cin` underflow on EOF, flushes `stdout`, and emits marker `__NEED_INPUT__` to `stderr`, exiting with 0. Marker is parsed by frontend to display waiting cursor.
    - Python: Catches `EOFError` in `stderr` to detect waiting input without printing uncaught traceback.
  - **Language Configuration:** Automatically configured from the practice area selection or problem language (C - ID 50, C++ - ID 54, Python - ID 71) synchronizing Monaco editor mode, file tab name, starter code, and Judge0 execution environment (header dropdown removed for a clean, focused UI).
  - **Toolbar Action Uniformity:** All buttons (`Run`, `Stop`, `Save to Code Store`, `Close`) share uniform heights (38px), pill radius (9999px), font sizing (13.5px), and interactive states. Running disables the Run button and shows a spinner; Stop aborts the active `AbortController` and resets session state.
  - **Limits & Safeguards:** Caps interactive sessions at 30 re-runs, enforces 2s CPU time limit, handles HTTP 429 throttling cleanly, and warns if non-deterministic outputs diverge.
