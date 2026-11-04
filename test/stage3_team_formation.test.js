import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory localStorage mock for node environment
const storage = new Map();
global.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

import {
  MIN_TEAM_SIZE,
  MIN_PLAYERS_PER_CIRCLE,
  TEAM_SIZE_MODES,
  validateTeamFormation,
  randomSplitTeams,
  autoPromoteCaptain,
  createCircle,
  createChallengeDraft,
  getChallengeById,
  updateTeamDetails,
  setTeamReady,
  cancelChallenge,
  getCircleById,
} from '../src/services/groupChallengeService.js';

describe('Stage 3: Team Formation, Captains & Challenge Setup', () => {
  beforeEach(() => {
    storage.clear();
    const mockUsers = [
      { username: 'admin_alice', name: 'Alice Admin', email: 'alice@codelife.dev' },
      { username: 'bob_coder', name: 'Bob Coder', email: 'bob@codelife.dev' },
      { username: 'charlie_dev', name: 'Charlie Dev', email: 'charlie@codelife.dev' },
      { username: 'david_algo', name: 'David Algo', email: 'david@codelife.dev' },
      { username: 'eva_hacker', name: 'Eva Hacker', email: 'eva@codelife.dev' },
      { username: 'frank_pro', name: 'Frank Pro', email: 'frank@codelife.dev' },
    ];
    storage.set('daily_code_practice_users_db', JSON.stringify(mockUsers));
  });

  describe('1. Hard Validation Rules & Team Size Modes', () => {
    test('Enforces MIN_TEAM_SIZE = 2 constant', () => {
      assert.equal(MIN_TEAM_SIZE, 2);
    });

    test('Rejects teams with fewer than 2 players per team', () => {
      const invalidTeams = {
        teamA: { members: ['alice'], captainUsername: 'alice' },
        teamB: { members: ['bob', 'charlie'], captainUsername: 'bob' },
      };

      const res = validateTeamFormation(invalidTeams, 'balanced');
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((err) => err.includes('only 1 player')));
    });

    test('Balanced mode enforces exact N vs N equality', () => {
      const unequalTeams = {
        teamA: { members: ['alice', 'charlie'], captainUsername: 'alice' },
        teamB: { members: ['bob', 'david', 'eva'], captainUsername: 'bob' },
      };

      // Fails in balanced mode (2 vs 3)
      const balancedRes = validateTeamFormation(unequalTeams, 'balanced');
      assert.equal(balancedRes.isValid, false);
      assert.ok(balancedRes.errors.some((err) => err.includes('Balanced mode requires equal team sizes')));

      // Passes in flexible mode (2 vs 3 with minimum 2 players met)
      const flexibleRes = validateTeamFormation(unequalTeams, 'flexible');
      assert.equal(flexibleRes.isValid, true);
      assert.equal(flexibleRes.errors.length, 0);
    });

    test('Prevents a player from being assigned to both teams', () => {
      const duplicateTeams = {
        teamA: { members: ['alice', 'bob'], captainUsername: 'alice' },
        teamB: { members: ['bob', 'charlie'], captainUsername: 'charlie' },
      };

      const res = validateTeamFormation(duplicateTeams, 'balanced');
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((err) => err.includes('cannot be assigned to both teams')));
    });
  });

  describe('2. Captain Rules & Auto-Promotion', () => {
    test('Rejects if team has no designated captain or captain is not on that team', () => {
      const missingCapTeams = {
        teamA: { members: ['alice', 'bob'], captainUsername: '' },
        teamB: { members: ['charlie', 'david'], captainUsername: 'charlie' },
      };
      const res1 = validateTeamFormation(missingCapTeams, 'balanced');
      assert.equal(res1.isValid, false);
      assert.ok(res1.errors.some((err) => err.includes('Team A must have a designated captain')));

      const foreignCapTeams = {
        teamA: { members: ['alice', 'bob'], captainUsername: 'david' }, // david is not in teamA
        teamB: { members: ['charlie', 'david'], captainUsername: 'charlie' },
      };
      const res2 = validateTeamFormation(foreignCapTeams, 'balanced');
      assert.equal(res2.isValid, false);
      assert.ok(res2.errors.some((err) => err.includes('must be a member of Team A')));
    });

    test('autoPromoteCaptain designates the next player in roster if captain leaves or is missing', () => {
      const teamWithValidCaptain = {
        members: ['alice', 'bob'],
        captainUsername: 'bob',
      };
      const unchanged = autoPromoteCaptain(teamWithValidCaptain);
      assert.equal(unchanged.captainUsername, 'bob');

      // Captain removed or not in members
      const teamMissingCaptain = {
        members: ['charlie', 'david'],
        captainUsername: 'eva', // eva left
      };
      const promoted = autoPromoteCaptain(teamMissingCaptain);
      assert.equal(promoted.captainUsername, 'charlie'); // auto-promotes first member
    });
  });

  describe('3. Team Formation Mechanisms', () => {
    test('randomSplitTeams splits participants and designates captains', () => {
      const participants = ['alice', 'bob', 'charlie', 'david'];
      const { teamA, teamB } = randomSplitTeams(participants, 'balanced');

      assert.equal(teamA.members.length, 2);
      assert.equal(teamB.members.length, 2);
      assert.ok(teamA.members.includes(teamA.captainUsername));
      assert.ok(teamB.members.includes(teamB.captainUsername));

      const validation = validateTeamFormation({ teamA, teamB }, 'balanced');
      assert.equal(validation.isValid, true);
    });

    test('randomSplitTeams respects preset designated captains', () => {
      const participants = ['alice', 'bob', 'charlie', 'david', 'eva', 'frank'];
      const { teamA, teamB } = randomSplitTeams(participants, 'balanced', 'bob', 'eva');

      assert.equal(teamA.captainUsername, 'bob');
      assert.ok(teamA.members.includes('bob'));
      assert.equal(teamB.captainUsername, 'eva');
      assert.ok(teamB.members.includes('eva'));
      assert.equal(teamA.members.length, 3);
      assert.equal(teamB.members.length, 3);
    });
  });

  describe('4. Challenge Draft Creation & Lobby Lifecycle', () => {
    test('createChallengeDraft creates challenge in lobby status and sets circle status to Lobby open', () => {
      const circle = createCircle('admin_alice', 'Lobby Circle');
      const participants = ['admin_alice', 'bob_coder', 'charlie_dev', 'david_algo'];

      const res = createChallengeDraft(circle.id, 'admin_alice', participants, {
        teamSizeMode: 'balanced',
        formationMode: 'random',
      });

      assert.equal(res.success, true);
      assert.ok(res.challenge);
      assert.equal(res.challenge.status, 'lobby');
      assert.equal(res.challenge.teams.teamA.members.length, 2);
      assert.equal(res.challenge.teams.teamB.members.length, 2);

      // Circle status updated to 'Lobby open'
      const updatedCircle = getCircleById(circle.id);
      assert.equal(updatedCircle.status, 'Lobby open');
    });

    test('Non-admin cannot create challenge draft', () => {
      const circle = createCircle('admin_alice', 'Protected Circle');
      const participants = ['admin_alice', 'bob_coder', 'charlie_dev', 'david_algo'];

      const res = createChallengeDraft(circle.id, 'bob_coder', participants);
      assert.equal(res.success, false);
      assert.match(res.error, /Only the circle admin/);
    });

    test('cancelChallenge resets circle status back to No active match', () => {
      const circle = createCircle('admin_alice', 'Cancel Test');
      const participants = ['admin_alice', 'bob_coder', 'charlie_dev', 'david_algo'];
      const draft = createChallengeDraft(circle.id, 'admin_alice', participants);

      assert.equal(getCircleById(circle.id).status, 'Lobby open');

      // Admin cancels challenge
      const cancelRes = cancelChallenge(draft.challenge.id, 'admin_alice');
      assert.equal(cancelRes.success, true);

      assert.equal(getCircleById(circle.id).status, 'No active match');
    });
  });

  describe('5. Captain Permissions & Lobby Readiness', () => {
    let challenge;
    let circle;

    beforeEach(() => {
      circle = createCircle('admin_alice', 'Captain Power Circle');
      const participants = ['admin_alice', 'bob_coder', 'charlie_dev', 'david_algo'];
      const teams = {
        teamA: {
          id: 'team_a',
          name: 'Red Dragons',
          captainUsername: 'admin_alice',
          members: ['admin_alice', 'bob_coder'],
          strategyNote: '',
          isReady: false,
          submitAuthority: 'all',
        },
        teamB: {
          id: 'team_b',
          name: 'Blue Phoenix',
          captainUsername: 'charlie_dev',
          members: ['charlie_dev', 'david_algo'],
          strategyNote: '',
          isReady: false,
          submitAuthority: 'all',
        },
      };

      const res = createChallengeDraft(circle.id, 'admin_alice', participants, {
        teamSizeMode: 'balanced',
        teams,
      });
      challenge = res.challenge;
    });

    test('Captain can rename team and set strategy note', () => {
      // Charlie (Team B Captain) renames Team B and sets note
      const updateRes = updateTeamDetails(
        challenge.id,
        'teamB',
        {
          name: 'Cyber Wolves',
          strategyNote: 'Charlie solves problem 1, David tackles problem 2!',
          submitAuthority: 'captain_only',
        },
        'charlie_dev'
      );

      assert.equal(updateRes.success, true);
      assert.equal(updateRes.team.name, 'Cyber Wolves');
      assert.equal(updateRes.team.strategyNote, 'Charlie solves problem 1, David tackles problem 2!');
      assert.equal(updateRes.team.submitAuthority, 'captain_only');

      const saved = getChallengeById(challenge.id);
      assert.equal(saved.teams.teamB.name, 'Cyber Wolves');
    });

    test('Non-captain teammate cannot change team settings', () => {
      // David is in Team B, but is not the captain
      const unauthorizedUpdate = updateTeamDetails(
        challenge.id,
        'teamB',
        { name: 'David Hacked Team' },
        'david_algo'
      );

      assert.equal(unauthorizedUpdate.success, false);
      assert.match(unauthorizedUpdate.error, /Only the team captain or challenge admin/);
    });

    test('Captain can mark team ready in the lobby', () => {
      // Charlie marks Team B ready
      const readyRes = setTeamReady(challenge.id, 'teamB', true, 'charlie_dev');
      assert.equal(readyRes.success, true);
      assert.equal(readyRes.challenge.teams.teamB.isReady, true);

      // David (non-captain) cannot toggle ready
      const unauthorizedReady = setTeamReady(challenge.id, 'teamB', false, 'david_algo');
      assert.equal(unauthorizedReady.success, false);
      assert.match(unauthorizedReady.error, /Only the team captain/);
    });
  });
});
