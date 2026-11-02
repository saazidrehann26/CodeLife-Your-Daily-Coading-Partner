# Application Flow

## 1. Authentication Flow
- **Unauthenticated User:** Arrives at the landing page -> Views value proposition -> Clicks "Start Practicing".
- **Sign Up / Log In:** Inputs email for OTP verification -> Authenticates.

## 2. Onboarding Flow (First Login Only)
- User selects their primary focus track (e.g., "C Programming Foundation").
- Brief tutorial on how the streak system works.

## 3. Daily Practice Flow
- **Dashboard:** User sees their current streak (e.g., "🔥 5 Days") and a prominent "Today's Challenge" card.
- **Execution:** 
  - User clicks the challenge.
  - Reads the prompt and constraints.
  - Inputs their code or answer.
  - Submits.
- **Feedback:** System validates the answer -> Shows success/failure state -> Reveals optimal solution and conceptual explanation.

## 4. Historical Flow
- User navigates to the "History" tab.
- Views a calendar heat-map of their activity.
- Can click past days to re-read concepts they previously solved for spaced repetition.