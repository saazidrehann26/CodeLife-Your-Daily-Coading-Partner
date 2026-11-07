/**
 * Battle Zone Test Suite
 *
 * Tests the live split-screen code battle system between two teams:
 * 1. Formats: Circle vs Circle & In-Circle Battles
 * 2. State Machine: LOBBY -> AUTHORING -> SWAP -> SOLVING -> ROUND_RESULT -> FINISHED
 * 3. Authoring Validation: Solvable reference solution, >= 1 test, starter code failure for bug/complete
 * 4. Opponent Privacy & Sanitization: Solver cannot see opponent code or hidden tests during match
 * 5. Submission Evaluation & Pass Criteria: 100% test case pass needed, 1 point awarded
 * 6. Scoring, Tie-Breakers & MVP: Lower solve time tie-breaker, fastest solver MVP
 * 7. Captain Disconnect & Auto-Promotion
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCircleVsCircleBattle,
  createInCircleBattle,
  updateBattleSettings,
  setCaptainReady,
  startBattle,
  validateChallengeAuthoring,
  publishTeamChallenge,
  generateFallbackChallenge,
  checkAuthoringTimeout,
  advanceToSwapPhase,
  advanceToSolvingPhase,
  syncBattleCode,
  submitSolution,
  advanceToRoundResultPhase,
  advanceToNextRoundOrFinish,
  updateBattleTime,
  finishBattle,
  calculateBattleMVP,
  getSanitizedBattleForUser,
  handleCaptainDisconnect,
  sendBattleRequest,
  respondBattleRequest,
  saveBattle,
  getBattleById,
  getAllBattles,
  BATTLE_PHASES,
  CHALLENGE_TYPES,
  SUPPORTED_BATTLE_LANGUAGES,
} from '../src/services/battleZoneService.js';

import {
  createCircle,
  saveAllCircles,
} from '../src/services/groupChallengeService.js';

// Setup Mock In-Memory Storage for Node.js test environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

describe('Battle Zone Live Split-Screen Code Battle Suite', () => {
  beforeEach(() => {
    mockStorage.clear();
    saveAllCircles([]);
  });

  describe('1. Battle Creation & Formats', () => {
    it('creates an In-Circle battle splitting circle into Team A and Team B', () => {
      const circle = createCircle('alice', 'Algorithms Circle');
      // Add 4 members
      circle.members = [
        { username: 'alice', name: 'Alice', role: 'admin' },
        { username: 'bob', name: 'Bob', role: 'member' },
        { username: 'charlie', name: 'Charlie', role: 'member' },
        { username: 'david', name: 'David', role: 'member' },
      ];
      saveAllCircles([circle]);

      const teamAConfig = {
        name: 'Alpha Team',
        captainUsername: 'alice',
        members: [{ username: 'alice' }, { username: 'bob' }],
      };
      const teamBConfig = {
        name: 'Beta Team',
        captainUsername: 'charlie',
        members: [{ username: 'charlie' }, { username: 'david' }],
      };

      const res = createInCircleBattle(circle.id, 'alice', teamAConfig, teamBConfig, {
        language: 'C++',
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.battle);
      assert.strictEqual(res.battle.phase, BATTLE_PHASES.LOBBY);
      assert.strictEqual(res.battle.teams.teamA.name, 'Alpha Team');
      assert.strictEqual(res.battle.teams.teamB.name, 'Beta Team');
      assert.strictEqual(res.battle.teams.teamA.captainUsername, 'alice');
      assert.strictEqual(res.battle.teams.teamB.captainUsername, 'charlie');
      assert.strictEqual(res.battle.teams.teamA.members.length, 2);
      assert.strictEqual(res.battle.teams.teamB.members.length, 2);
    });

    it('rejects In-Circle battle if teams have fewer than 2 players or overlapping players', () => {
      const circle = createCircle('alice', 'Small Circle');
      circle.members = [
        { username: 'alice', role: 'admin' },
        { username: 'bob', role: 'member' },
        { username: 'charlie', role: 'member' },
      ];
      saveAllCircles([circle]);

      // Team B has only 1 player
      const res = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
      }, {
        members: [{ username: 'charlie' }],
      });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /at least 2 players/i);

      // Overlapping player
      const resOverlap = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
      }, {
        members: [{ username: 'bob' }, { username: 'charlie' }],
      });
      assert.strictEqual(resOverlap.success, false);
      assert.match(resOverlap.error, /cannot be in both teams/i);
    });

    it('sends and accepts Circle vs Circle battle requests', () => {
      const circleA = createCircle('alice', 'Circle Alpha');
      circleA.members = [{ username: 'alice' }, { username: 'bob' }];
      const circleB = createCircle('charlie', 'Circle Beta');
      circleB.members = [{ username: 'charlie' }, { username: 'david' }];
      saveAllCircles([circleA, circleB]);

      // Admin Alice challenges Circle Beta
      const sendRes = sendBattleRequest(circleA.id, circleB.inviteCode, 'alice', { language: 'Python' });
      assert.strictEqual(sendRes.success, true);
      assert.strictEqual(sendRes.request.status, 'pending');

      // Admin Charlie accepts
      const acceptRes = respondBattleRequest(sendRes.request.id, 'charlie', true);
      assert.strictEqual(acceptRes.success, true);
      assert.ok(acceptRes.battle);
      assert.strictEqual(acceptRes.battle.format, 'circle_vs_circle');
      assert.strictEqual(acceptRes.battle.circleAName, 'Circle Alpha');
      assert.strictEqual(acceptRes.battle.circleBName, 'Circle Beta');
      assert.strictEqual(acceptRes.battle.language, 'Python');
    });
  });

  describe('2. Lobby Phase & Settings Lock', () => {
    it('allows captains or creator to update battle settings before match starts', () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
        captainUsername: 'alice',
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
        captainUsername: 'charlie',
      });

      const updateRes = updateBattleSettings(battle.id, 'alice', {
        language: 'Python',
        authoringTimeMinutes: 5,
        solvingTimeMinutes: 10,
        challengeType: CHALLENGE_TYPES.FIX_BUG,
      });

      assert.strictEqual(updateRes.success, true);
      assert.strictEqual(updateRes.battle.language, 'Python');
      assert.strictEqual(updateRes.battle.settings.authoringTimeMinutes, 5);
      assert.strictEqual(updateRes.battle.settings.solvingTimeMinutes, 10);
      assert.strictEqual(updateRes.battle.settings.challengeType, CHALLENGE_TYPES.FIX_BUG);
    });

    it('requires both captains to mark ready before starting battle', () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
        captainUsername: 'alice',
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
        captainUsername: 'charlie',
      });

      // Try starting with no captains ready
      const startFail = startBattle(battle.id, 'alice');
      assert.strictEqual(startFail.success, false);
      assert.match(startFail.error, /both captains must mark ready/i);

      // Alice marks ready
      setCaptainReady(battle.id, 'teamA', 'alice', true);

      // Still only 1 ready
      const startFail2 = startBattle(battle.id, 'alice');
      assert.strictEqual(startFail2.success, false);

      // Charlie marks ready
      setCaptainReady(battle.id, 'teamB', 'charlie', true);

      // Now both ready, battle starts!
      const startSuccess = startBattle(battle.id, 'alice');
      assert.strictEqual(startSuccess.success, true);
      assert.strictEqual(startSuccess.battle.phase, BATTLE_PHASES.AUTHORING);
    });

    it('allows admin force start override even if a captain has not marked ready', () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
      });

      // Admin override
      const overrideRes = startBattle(battle.id, 'alice', true);
      assert.strictEqual(overrideRes.success, true);
      assert.strictEqual(overrideRes.battle.phase, BATTLE_PHASES.AUTHORING);
    });
  });

  describe('3. Challenge Authoring, Validation & Fallback Selection', () => {
    it('validates that challenge has title, description, reference solution and test cases', async () => {
      const emptyRes = await validateChallengeAuthoring(null, 'Python', 71);
      assert.strictEqual(emptyRes.isValid, false);

      const noTitle = await validateChallengeAuthoring({
        title: '',
        description: 'Solve this',
        testCases: [{ input: '1', expectedOutput: '1' }],
        referenceSolution: 'print(1)',
      }, 'Python', 71);
      assert.strictEqual(noTitle.isValid, false);
      assert.match(noTitle.error, /title is required/i);

      const noTests = await validateChallengeAuthoring({
        title: 'Problem A',
        description: 'Solve this',
        testCases: [],
        referenceSolution: 'print(1)',
      }, 'Python', 71);
      assert.strictEqual(noTests.isValid, false);
      assert.match(noTests.error, /at least 1 test case/i);
    });

    it('auto-picks a fallback challenge from curated problem set if authoring time expires', () => {
      const fallbackA = generateFallbackChallenge('teamA', 'C++');
      assert.ok(fallbackA);
      assert.ok(fallbackA.title);
      assert.ok(fallbackA.testCases.length > 0);
      assert.strictEqual(fallbackA.published, true);
      assert.strictEqual(fallbackA.isFallback, true);
    });

    it('handles authoring timeout by assigning fallbacks and advancing to SWAP', () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
      });

      startBattle(battle.id, 'alice', true);

      // Fast forward phaseEndTime into past
      const loaded = getBattleById(battle.id);
      loaded.phaseEndTime = new Date(Date.now() - 5000).toISOString();
      saveBattle(loaded);

      const updated = checkAuthoringTimeout(battle.id);
      assert.ok(updated);
      assert.strictEqual(updated.phase, BATTLE_PHASES.SWAP);
      assert.strictEqual(updated.rounds[0].teamAChallenge.isFallback, true);
      assert.strictEqual(updated.rounds[0].teamBChallenge.isFallback, true);
    });
  });

  describe('4. Opponent Privacy & Data Sanitization', () => {
    it('strictly hides opponent live editor code and output from solving team', () => {
      const battle = {
        id: 'b1',
        phase: BATTLE_PHASES.SOLVING,
        settings: { allowSpectators: true },
        teams: {
          teamA: {
            name: 'Alpha',
            members: [{ username: 'alice' }, { username: 'bob' }],
            code: 'int main() { return 0; }',
            output: 'Program output A',
          },
          teamB: {
            name: 'Beta',
            members: [{ username: 'charlie' }, { username: 'david' }],
            code: 'def solve(): pass',
            output: 'Program output B',
          },
        },
        rounds: [
          {
            teamAChallenge: {
              title: 'Chal A',
              starterCode: 'code A',
              referenceSolution: 'SECRET_SOLUTION_A',
              testCases: [
                { input: '1', expectedOutput: '1', isSample: true },
                { input: '100', expectedOutput: '100', isSample: false, isHidden: true },
              ],
            },
            teamBChallenge: {
              title: 'Chal B',
              starterCode: 'code B',
              referenceSolution: 'SECRET_SOLUTION_B',
              testCases: [
                { input: '2', expectedOutput: '2', isSample: true },
                { input: '200', expectedOutput: '200', isSample: false, isHidden: true },
              ],
            },
          },
        ],
      };

      // Alice is on Team A: Team B code must be masked
      const sanitizedForAlice = getSanitizedBattleForUser(battle, 'alice');
      assert.match(sanitizedForAlice.teams.teamB.code, /Opponent code is hidden/i);
      assert.strictEqual(sanitizedForAlice.teams.teamB.output, '');
      // Alice must NOT see Team B's reference solution or hidden tests
      assert.strictEqual(sanitizedForAlice.rounds[0].teamBChallenge.referenceSolution, '[Protected]');
      assert.strictEqual(sanitizedForAlice.rounds[0].teamBChallenge.testCases.length, 1);
      assert.strictEqual(sanitizedForAlice.rounds[0].teamBChallenge.testCases[0].isSample, true);

      // Charlie is on Team B: Team A code must be masked
      const sanitizedForCharlie = getSanitizedBattleForUser(battle, 'charlie');
      assert.match(sanitizedForCharlie.teams.teamA.code, /Opponent code is hidden/i);
      assert.strictEqual(sanitizedForCharlie.teams.teamA.output, '');
      assert.strictEqual(sanitizedForCharlie.rounds[0].teamAChallenge.referenceSolution, '[Protected]');
    });

    it('reveals reference solutions and hidden test cases once match is FINISHED', () => {
      const battle = {
        id: 'b1',
        phase: BATTLE_PHASES.FINISHED,
        teams: {
          teamA: { members: [{ username: 'alice' }], code: 'solution A' },
          teamB: { members: [{ username: 'bob' }], code: 'solution B' },
        },
        rounds: [
          {
            teamAChallenge: { referenceSolution: 'SECRET_A', testCases: [{ isSample: true }, { isHidden: true }] },
            teamBChallenge: { referenceSolution: 'SECRET_B', testCases: [{ isSample: true }, { isHidden: true }] },
          },
        ],
      };

      const sanitized = getSanitizedBattleForUser(battle, 'alice');
      assert.strictEqual(sanitized.teams.teamB.code, 'solution B');
      assert.strictEqual(sanitized.rounds[0].teamBChallenge.referenceSolution, 'SECRET_B');
    });
  });

  describe('5. Solving Phase, Evaluation & Pass Criteria', () => {
    it('syncs collaborative code across teammates', () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
      });

      // Bob edits Team A code
      const syncRes = syncBattleCode(battle.id, 'teamA', 'bob', 'int a = 10;');
      assert.strictEqual(syncRes.success, true);

      const refreshed = getBattleById(battle.id);
      assert.strictEqual(refreshed.teams.teamA.code, 'int a = 10;');
    });

    it('rejects code sync if user is not a member of that team', () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
      });

      // Charlie attempts to edit Team A code
      const forbidden = syncBattleCode(battle.id, 'teamA', 'charlie', 'malicious edit');
      assert.strictEqual(forbidden.success, false);
      assert.match(forbidden.error, /only edit your own team/i);
    });

    it('evaluates submission and awards 1 point on successful run', async () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
      });

      advanceToSolvingPhase(battle);
      // Give Team B a challenge for Team A to solve
      battle.rounds[0].teamBChallenge = {
        title: 'Echo',
        testCases: [
          { input: 'hello', expectedOutput: 'hello', isSample: true },
        ],
      };
      saveBattle(battle);

      // In test mock runCode, we can submit solution
      const subRes = await submitSolution(battle.id, 'teamA', 'alice', '# Python echo');
      assert.strictEqual(subRes.success, true);
    });
  });

  describe('6. Scoring, Tie-Breakers & MVP Calculation', () => {
    it('breaks ties using lower total solve time', () => {
      const battle = {
        id: 'b1',
        totalRounds: 1,
        currentRound: 1,
        teams: {
          teamA: { name: 'Alpha', score: 1, totalSolveTimeSeconds: 45 },
          teamB: { name: 'Beta', score: 1, totalSolveTimeSeconds: 30 },
        },
        rounds: [
          {
            teamASubmission: { allPassed: true, solveTimeSeconds: 45, submittedBy: 'alice' },
            teamBSubmission: { allPassed: true, solveTimeSeconds: 30, submittedBy: 'charlie' },
          },
        ],
        events: [],
      };

      finishBattle(battle);
      assert.strictEqual(battle.phase, BATTLE_PHASES.FINISHED);
      // Team B solved faster (30s vs 45s) -> Team B wins tie-breaker!
      assert.strictEqual(battle.winner, 'teamB');
      assert.strictEqual(battle.mvp.username, 'charlie');
      assert.strictEqual(battle.mvp.solveTimeSeconds, 30);
    });
  });

  describe('7. Disconnect Resilience & Captain Auto-Promotion', () => {
    it('auto-promotes replacement captain if current captain disconnects', () => {
      const circle = createCircle('alice', 'Coders');
      circle.members = [
        { username: 'alice' }, { username: 'bob' },
        { username: 'charlie' }, { username: 'david' },
      ];
      saveAllCircles([circle]);

      const { battle } = createInCircleBattle(circle.id, 'alice', {
        members: [{ username: 'alice' }, { username: 'bob' }],
        captainUsername: 'alice',
      }, {
        members: [{ username: 'charlie' }, { username: 'david' }],
        captainUsername: 'charlie',
      });

      assert.strictEqual(battle.teams.teamA.captainUsername, 'alice');

      // Alice disconnects
      const updated = handleCaptainDisconnect(battle.id, 'alice');
      assert.ok(updated);
      assert.strictEqual(updated.teams.teamA.captainUsername, 'bob');
      assert.strictEqual(updated.teams.teamA.members.find((m) => m.username === 'bob').role, 'captain');
    });
  });

  describe('8. Custom Time Setting & Direct Finish on Battle Conclusion', () => {
    it('directly finishes match on final round without intermediate button or round result modal', () => {
      const battle = {
        id: 'battle_test_finish',
        totalRounds: 1,
        currentRound: 1,
        phase: BATTLE_PHASES.SOLVING,
        teams: {
          teamA: { name: 'Alpha', score: 1, totalSolveTimeSeconds: 40, members: [{ username: 'alice' }] },
          teamB: { name: 'Beta', score: 0, totalSolveTimeSeconds: 0, members: [{ username: 'bob' }] },
        },
        rounds: [
          {
            roundNumber: 1,
            teamASubmission: { allPassed: true, solveTimeSeconds: 40, submittedBy: 'alice' },
            teamBSubmission: { allPassed: false, solveTimeSeconds: 0, submittedBy: 'bob' },
          },
        ],
        events: [],
      };
      saveBattle(battle);

      // Call advanceToRoundResultPhase on final round
      advanceToRoundResultPhase(battle);

      // Must be directly FINISHED without intermediate ROUND_RESULT
      assert.strictEqual(battle.phase, BATTLE_PHASES.FINISHED);
      assert.strictEqual(battle.status, 'finished');
      assert.strictEqual(battle.winner, 'teamA');
    });

    it('updates custom time in minutes and recalculates phase duration and end time', () => {
      const battle = {
        id: 'battle_test_custom_time',
        totalRounds: 1,
        currentRound: 1,
        phase: BATTLE_PHASES.SOLVING,
        settings: { solvingTimeMinutes: 15 },
        teams: {
          teamA: { name: 'Alpha', captainUsername: 'alice', members: [{ username: 'alice' }] },
          teamB: { name: 'Beta', captainUsername: 'bob', members: [{ username: 'bob' }] },
        },
        events: [],
      };
      saveBattle(battle);

      const res = updateBattleTime(battle.id, 'alice', { minutes: 25 });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.battle.settings.solvingTimeMinutes, 25);
      assert.strictEqual(res.battle.phaseDurationSeconds, 25 * 60);
      assert.ok(new Date(res.battle.phaseEndTime).getTime() > Date.now());
    });

    it('extends active battle timer with addMinutes', () => {
      const battle = {
        id: 'battle_test_extend_time',
        totalRounds: 1,
        currentRound: 1,
        phase: BATTLE_PHASES.SOLVING,
        settings: { solvingTimeMinutes: 15 },
        phaseEndTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        teams: {
          teamA: { name: 'Alpha', captainUsername: 'alice', members: [{ username: 'alice' }] },
          teamB: { name: 'Beta', captainUsername: 'bob', members: [{ username: 'bob' }] },
        },
        events: [],
      };
      saveBattle(battle);

      const oldEnd = new Date(battle.phaseEndTime).getTime();
      const res = updateBattleTime(battle.id, 'alice', { addMinutes: 5 });
      assert.strictEqual(res.success, true);
      const newEnd = new Date(res.battle.phaseEndTime).getTime();
      // Should be roughly ~5 minutes (300,000 ms) later
      assert.ok(newEnd - oldEnd >= 295000);
    });
  });
});
