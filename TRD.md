# Technical Requirements Document (TRD)

## 1. Frontend Architecture
- **Framework:** React.
- **Build Tool:** Vite (for fast HMR and optimized builds).
- **Styling:** Tailwind CSS (for rapid utility-class styling and responsive mobile-first design).
- **Routing:** React Router DOM.

## 2. Backend & Authentication
- **BaaS (Backend as a Service):** Supabase or Firebase (Free Tier).
- **Authentication:** Passwordless Email OTP (Native Supabase/Firebase auth or custom EmailJS integration).
- **Database:** PostgreSQL (if Supabase) or NoSQL Document Store (if Firebase).

## 3. Hosting & Deployment
- **Frontend Hosting:** GitHub Pages or Vercel (CI/CD connected to the main GitHub branch).

## 4. Future Integrations
- **Code Execution:** Piston API or Judge0 API to compile and run C/Python code directly in the browser safely.