# Implementation Plan

## Phase 1: Environment & Setup (Days 1-2)
- Initialize React + Vite project.
- Install and configure Tailwind CSS.
- Set up GitHub repository and configure CI/CD to GitHub Pages/Vercel.
- Establish Supabase/Firebase project and link API keys.

## Phase 2: Authentication & Database (Days 3-5)
- Build the glassmorphism Auth Portal UI.
- Implement Email OTP login flow.
- Create database tables (`users`, `tracks`, `challenges`, `submissions`) based on Schema.md.
- Manually seed the database with the first 7 days of coding challenges.

## Phase 3: Core Application UI (Days 6-8)
- Build the Dashboard UI (Streak counter, Track selection).
- Build the Daily Challenge View (Prompt display, text/code input area).
- Implement Markdown rendering for problem statements and solutions.

## Phase 4: Business Logic (Days 9-11)
- Write logic to fetch the specific challenge matching the current date.
- Write logic to calculate, update, and reset user streaks based on `last_active_date`.
- Implement submission handling and conditional rendering of the solution block.

## Phase 5: Testing & Launch (Days 12-14)
- Perform cross-device testing (ensure UI is responsive on mobile).
- Conduct a dry-run with a small group of peers.
- Fix bugs, refine the UI, and officially launch.