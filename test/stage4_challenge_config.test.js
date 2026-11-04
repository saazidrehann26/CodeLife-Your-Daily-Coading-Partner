import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  deriveDefaultProblemCount,
  getAvailableChallengeProblems,
  autoSelectChallengeProblems,
  calculateProblemScore,
  calculateTeamFinalScore,
  distributeProblemsRoundRobin,
  validateChallengeConfig,
  createChallengeDraft,
  updateChallengeConfig,
  CHALLENGE_MODES,
  PROBLEM_SOURCES,
  DEFAULT_SCORING_CONFIG,
  createCircle,
  saveAllCircles,
  saveAllChallenges,
} from '../src/services/groupChallengeService.js';

// Setup Mock In-Memory Storage
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => {
    mockStorage[key] = String(val);
  },
  removeItem: (key) => {
    delete mockStorage[key];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  },
};

describe('Stage 4: Challenge Configuration, Problems & Scoring Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Default Problem Count Derivation', () => {
    it('Derives problem count as max(3, max(teamA, teamB))', () => {
      assert.strictEqual(deriveDefaultProblemCount(2, 2), 3);
      assert.strictEqual(deriveDefaultProblemCount(2, 3), 3);
      assert.strictEqual(deriveDefaultProblemCount(4, 4), 4);
      assert.strictEqual(deriveDefaultProblemCount(3, 6), 6);
      assert.strictEqual(deriveDefaultProblemCount(0, 0), 3);
    });
  });

  describe('2. Problem Catalog & Solved Exclusion', () => {
    it('Retrieves base problem catalog containing Easy, Medium, and Hard problems', () => {
      const available = getAvailableChallengeProblems({ excludeSolved: false });
      assert.ok(available.length >= 8);
      const difficulties = new Set(available.map((p) => p.difficulty));
      assert.ok(difficulties.has('Easy'));
      assert.ok(difficulties.has('Medium'));
      assert.ok(difficulties.has('Hard'));
    });

    it('Excludes problems already solved by any match participant', () => {
      // Simulate user streak data with solved problem and practice_started flag
      const streakUserA = {
        practice_started: true,
        current_streak: 2,
        total_problems_solved: 2,
        solvedChallengeIds: [1, 'Valid Palindrome'],
      };
      localStorage.setItem('codelife_user_streaks_participant_a', JSON.stringify(streakUserA));

      const filtered = getAvailableChallengeProblems({
        participants: ['participant_a'],
        excludeSolved: true,
      });

      const ids = filtered.map((p) => p.id);
      const titles = filtered.map((p) => p.title.toLowerCase());
      assert.ok(!ids.includes(1));
      assert.ok(!titles.includes('two sum'));
      assert.ok(!titles.includes('valid palindrome'));
    });

    it('Auto-selects problems matching count and difficulty distribution', () => {
      const selected = autoSelectChallengeProblems({
        count: 4,
        difficultyMix: { Easy: 2, Medium: 1, Hard: 1 },
        excludeSolved: false,
      });

      assert.strictEqual(selected.length, 4);
      const easyCount = selected.filter((p) => p.difficulty === 'Easy').length;
      const medCount = selected.filter((p) => p.difficulty === 'Medium').length;
      const hardCount = selected.filter((p) => p.difficulty === 'Hard').length;
      assert.strictEqual(easyCount, 2);
      assert.strictEqual(medCount, 1);
      assert.strictEqual(hardCount, 1);
    });
  });

  describe('3. Single Configurable Scoring Formula', () => {
    it('Calculates base points correctly for each difficulty level', () => {
      const scoreEasy = calculateProblemScore({
        difficulty: 'Easy',
        timeRemainingSeconds: 0,
        totalTimeSeconds: 1800,
        wrongSubmissionsCount: 0,
      });
      const scoreMed = calculateProblemScore({
        difficulty: 'Medium',
        timeRemainingSeconds: 0,
        totalTimeSeconds: 1800,
        wrongSubmissionsCount: 0,
      });
      const scoreHard = calculateProblemScore({
        difficulty: 'Hard',
        timeRemainingSeconds: 0,
        totalTimeSeconds: 1800,
        wrongSubmissionsCount: 0,
      });

      assert.strictEqual(scoreEasy, 100);
      assert.strictEqual(scoreMed, 200);
      assert.strictEqual(scoreHard, 300);
    });

    it('Applies time bonus proportionally based on time remaining', () => {
      // Half time remaining: (900/1800) * 50 = 25 bonus pts
      const score = calculateProblemScore({
        difficulty: 'Easy',
        timeRemainingSeconds: 900,
        totalTimeSeconds: 1800,
        wrongSubmissionsCount: 0,
      });
      assert.strictEqual(score, 125); // 100 + 25
    });

    it('Applies wrong submission penalty and preserves minimum positive floor', () => {
      // 2 wrong submissions = -20 pts
      const score = calculateProblemScore({
        difficulty: 'Easy',
        timeRemainingSeconds: 0,
        totalTimeSeconds: 1800,
        wrongSubmissionsCount: 2,
      });
      assert.strictEqual(score, 80); // 100 - 20

      // Severe penalties: 15 wrong submissions = -150 pts on 100 base
      // Guaranteed floor prevents negative score
      const flooredScore = calculateProblemScore({
        difficulty: 'Easy',
        timeRemainingSeconds: 0,
        totalTimeSeconds: 1800,
        wrongSubmissionsCount: 15,
      });
      assert.strictEqual(flooredScore, 10);
    });
  });

  describe('4. Fairness Score Normalization for Unequal Teams', () => {
    it('Normalizes score by team size when normalizeBySize is true', () => {
      // Team Alpha: 300 pts with 3 players = 100.0 avg
      const teamAlphaNorm = calculateTeamFinalScore(300, 3, 5, true);
      assert.strictEqual(teamAlphaNorm, 100);

      // Team Beta: 450 pts with 5 players = 90.0 avg
      const teamBetaNorm = calculateTeamFinalScore(450, 5, 3, true);
      assert.strictEqual(teamBetaNorm, 90);

      // Returns raw score when normalizeBySize is false
      const raw = calculateTeamFinalScore(300, 3, 5, false);
      assert.strictEqual(raw, 300);
    });
  });

  describe('5. Assigned Mode Distribution', () => {
    it('Round-robins problems across any team size', () => {
      const mockProblems = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
      const members = ['alice', 'bob', 'charlie'];
      const distribution = distributeProblemsRoundRobin(mockProblems, members);

      assert.strictEqual(distribution.alice.length, 2); // prob 1, prob 4
      assert.strictEqual(distribution.bob.length, 2);   // prob 2, prob 5
      assert.strictEqual(distribution.charlie.length, 1); // prob 3
      assert.strictEqual(distribution.alice[0].id, 1);
      assert.strictEqual(distribution.alice[1].id, 4);
    });
  });

  describe('6. Challenge Draft & Configuration Integration', () => {
    it('Automatically activates fairness normalization when team sizes are unequal', () => {
      const circle = createCircle('circle_admin', 'Competitive Circle');
      const circleId = circle.id;

      const participants = ['circle_admin', 'p2', 'p3', 'p4', 'p5'];
      const customTeams = {
        teamA: {
          id: 'team_a',
          name: 'Team Alpha',
          captainUsername: 'circle_admin',
          members: ['circle_admin', 'p2'],
        },
        teamB: {
          id: 'team_b',
          name: 'Team Beta',
          captainUsername: 'p3',
          members: ['p3', 'p4', 'p5'],
        },
      };

      const res = createChallengeDraft(circleId, 'circle_admin', participants, {
        teamSizeMode: 'flexible',
        teams: customTeams,
        timeLimitMinutes: 45,
        mode: CHALLENGE_MODES.SHARED_POOL,
      });

      assert.ok(res.success);
      assert.strictEqual(res.challenge.config.timeLimitMinutes, 45);
      // Unequal teams: 2 vs 3 => fairness normalization auto-enabled!
      assert.strictEqual(res.challenge.config.scoringConfig.normalizeBySize, true);
      assert.strictEqual(res.challenge.config.fairnessNormalization, true);
      assert.ok(res.challenge.problems.length >= 3);
    });

    it('Admin can update challenge configuration while in lobby', () => {
      const circle = createCircle('circle_admin', 'Config Circle');
      const circleId = circle.id;
      const participants = ['circle_admin', 'p2', 'p3', 'p4'];

      const draft = createChallengeDraft(circleId, 'circle_admin', participants);
      assert.ok(draft.success);

      const updateRes = updateChallengeConfig(draft.challenge.id, 'circle_admin', {
        timeLimitMinutes: 60,
        mode: CHALLENGE_MODES.ASSIGNED,
      });

      assert.ok(updateRes.success);
      assert.strictEqual(updateRes.challenge.config.timeLimitMinutes, 60);
      assert.strictEqual(updateRes.challenge.config.mode, CHALLENGE_MODES.ASSIGNED);
      assert.ok(updateRes.challenge.assignments?.teamA);
      assert.ok(updateRes.challenge.assignments?.teamB);

      // Non-admin cannot modify config
      const failRes = updateChallengeConfig(draft.challenge.id, 'p2', { timeLimitMinutes: 90 });
      assert.strictEqual(failRes.success, false);
    });

    it('Validates challenge configuration options', () => {
      const valid = validateChallengeConfig({
        problemCount: 4,
        timeLimitMinutes: 30,
        mode: 'shared_pool',
      });
      assert.strictEqual(valid.isValid, true);

      const invalidTime = validateChallengeConfig({
        problemCount: 4,
        timeLimitMinutes: 2, // below 5 mins minimum
        mode: 'shared_pool',
      });
      assert.strictEqual(invalidTime.isValid, false);
      assert.ok(invalidTime.errors[0].includes('Time limit must be between'));
    });
  });
});
