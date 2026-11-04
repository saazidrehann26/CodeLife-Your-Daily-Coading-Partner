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

// Import services to test
import {
  buildPublicUserDTO,
  getUserPrivacySettings,
  saveUserPrivacySettings,
  getBlockedUsers,
  toggleBlockUser,
  searchUsers,
  createCircle,
  getUserCircles,
  getPendingCircleInvites,
  sendCircleInvite,
  respondCircleInvite,
  hasGroupChallengeNotification,
} from '../src/services/groupChallengeService.js';

describe('Stage 1: Group Challenge & Public Profile Suite', () => {
  beforeEach(() => {
    storage.clear();
  });

  describe('1. Security & Sanitized Public User DTO', () => {
    const rawMockUser = {
      username: 'alice_coder',
      name: 'Alice Wonderland',
      email: 'alice@secretmail.com',
      password: 'super_secret_hashed_password',
      phone: '+1-555-0199',
      trustedDevices: ['macbook-pro-guid-12345'],
      institution: 'MIT',
      classGrade: 'Senior Year',
    };

    test('Strictly strips private fields (email, password, phone, trustedDevices)', () => {
      const dto = buildPublicUserDTO(rawMockUser, 'bob');
      assert.ok(dto);
      assert.equal(dto.username, 'alice_coder');
      assert.equal(dto.name, 'Alice Wonderland');
      
      // Critical privacy check
      assert.equal(dto.email, undefined);
      assert.equal(dto.password, undefined);
      assert.equal(dto.phone, undefined);
      assert.equal(dto.trustedDevices, undefined);
    });

    test('Respects privacy toggle: showInstitution = false hides institution from strangers', () => {
      saveUserPrivacySettings('alice_coder', { showInstitution: false });
      
      // Viewed by Bob (stranger)
      const strangerView = buildPublicUserDTO(rawMockUser, 'bob');
      assert.equal(strangerView.institution, 'Hidden by user');
      assert.equal(strangerView.classGrade, 'Hidden by user');

      // Viewed by Alice (herself)
      const ownerView = buildPublicUserDTO(rawMockUser, 'alice_coder');
      assert.equal(ownerView.institution, 'MIT');
      assert.equal(ownerView.classGrade, 'Senior Year');
    });

    test('Respects privacy toggle: showStats = false hides streak and solved metrics from strangers', () => {
      saveUserPrivacySettings('alice_coder', { showStats: false });

      // Viewed by Bob
      const strangerView = buildPublicUserDTO(rawMockUser, 'bob');
      assert.equal(strangerView.totalProblemsSolved, null);
      assert.equal(strangerView.currentStreak, null);

      // Viewed by Alice
      const ownerView = buildPublicUserDTO(rawMockUser, 'alice_coder');
      assert.notEqual(ownerView.totalProblemsSolved, null);
      assert.notEqual(ownerView.currentStreak, null);
    });
  });

  describe('2. User Blocking & Moderation', () => {
    test('Can toggle block on a user and reflect block state', () => {
      assert.equal(getBlockedUsers('alice').length, 0);

      toggleBlockUser('alice', 'troll_user');
      assert.deepEqual(getBlockedUsers('alice'), ['troll_user']);

      // Unblock
      toggleBlockUser('alice', 'troll_user');
      assert.deepEqual(getBlockedUsers('alice'), []);
    });

    test('Cannot block self', () => {
      const res = toggleBlockUser('alice', 'alice');
      assert.equal(res, false);
      assert.deepEqual(getBlockedUsers('alice'), []);
    });
  });

  describe('3. Member Search (Prefix, Case-insensitive, Length & Pagination)', () => {
    test('Rejects queries with fewer than 2 characters', async () => {
      const res1 = await searchUsers('');
      assert.deepEqual(res1.results, []);

      const res2 = await searchUsers('a');
      assert.deepEqual(res2.results, []);
    });

    test('Finds users case-insensitively when 2 or more characters provided', async () => {
      // Mock dbService users via localStorage fallback
      const mockUsers = [
        { username: 'CodeNinja', name: 'Ninja Master' },
        { username: 'CodeMaster', name: 'Alex Code' },
        { username: 'random_dev', name: 'Dave' },
      ];
      storage.set('daily_code_practice_users_db', JSON.stringify(mockUsers));

      const searchUpper = await searchUsers('CODE');
      assert.equal(searchUpper.results.length, 2);
      assert.equal(searchUpper.results[0].username, 'CodeNinja');
      assert.equal(searchUpper.results[1].username, 'CodeMaster');

      const searchLower = await searchUsers('code');
      assert.equal(searchLower.results.length, 2);
    });

    test('Supports pagination: limit and offset', async () => {
      const mockUsers = Array.from({ length: 15 }, (_, i) => ({
        username: `dev_${i + 1}`,
        name: `Developer ${i + 1}`,
      }));
      storage.set('daily_code_practice_users_db', JSON.stringify(mockUsers));

      const page1 = await searchUsers('dev', 0, 10);
      assert.equal(page1.results.length, 10);
      assert.equal(page1.hasMore, true);
      assert.equal(page1.total, 15);

      const page2 = await searchUsers('dev', 10, 10);
      assert.equal(page2.results.length, 5);
      assert.equal(page2.hasMore, false);
    });
  });

  describe('4. Circle Management & Invites (Stage 1 Foundations)', () => {
    test('Can create a circle with admin role and unique invite code', () => {
      const circle = createCircle('alice', 'Algorithm Enthusiasts', 50);
      assert.ok(circle);
      assert.equal(circle.name, 'Algorithm Enthusiasts');
      assert.equal(circle.adminUsername, 'alice');
      assert.equal(circle.maxMembers, 50);
      assert.equal(circle.status, 'No active match');
      assert.ok(circle.inviteCode);
      assert.equal(circle.members.length, 1);
      assert.equal(circle.members[0].username, 'alice');
      assert.equal(circle.members[0].role, 'admin');

      const userCircles = getUserCircles('alice');
      assert.equal(userCircles.length, 1);
      assert.equal(userCircles[0].id, circle.id);
    });

    test('Can send invite and respects allowStrangerInvites = false', () => {
      const circle = createCircle('alice', 'Coders Club');
      
      // Target bob opted out of stranger invites
      saveUserPrivacySettings('bob', { allowStrangerInvites: false });

      const inviteBlocked = sendCircleInvite('alice', 'bob', circle.id, circle.name);
      assert.equal(inviteBlocked.success, false);
      assert.match(inviteBlocked.error, /opted out/);

      // Target charlie allows invites
      saveUserPrivacySettings('charlie', { allowStrangerInvites: true });
      const inviteSuccess = sendCircleInvite('alice', 'charlie', circle.id, circle.name);
      assert.equal(inviteSuccess.success, true);
      assert.ok(inviteSuccess.invite);

      // Duplicate invite should be prevented
      const inviteDup = sendCircleInvite('alice', 'charlie', circle.id, circle.name);
      assert.equal(inviteDup.success, false);
      assert.match(inviteDup.error, /already pending/);

      // Check charlie's pending invites
      const charlieInvites = getPendingCircleInvites('charlie');
      assert.equal(charlieInvites.length, 1);
      assert.equal(charlieInvites[0].circleId, circle.id);
    });

    test('Accepting an invite adds circle to user circles and clears pending invite', () => {
      const circle = createCircle('alice', 'Team Titan');
      sendCircleInvite('alice', 'david', circle.id, circle.name);
      
      const invitesBefore = getPendingCircleInvites('david');
      assert.equal(invitesBefore.length, 1);

      // Accept
      const accepted = respondCircleInvite('david', invitesBefore[0].id, true);
      assert.equal(accepted, true);

      // Invites cleared
      const invitesAfter = getPendingCircleInvites('david');
      assert.equal(invitesAfter.length, 0);

      // Circle added to david's circles
      const davidCircles = getUserCircles('david');
      assert.equal(davidCircles.length, 1);
      assert.equal(davidCircles[0].id, circle.id);
    });

    test('Declining an invite clears invite without adding to circles', () => {
      const circle = createCircle('alice', 'Team Alpha');
      sendCircleInvite('alice', 'eva', circle.id, circle.name);

      const invites = getPendingCircleInvites('eva');
      assert.equal(invites.length, 1);

      const declined = respondCircleInvite('eva', invites[0].id, false);
      assert.equal(declined, true);

      assert.equal(getPendingCircleInvites('eva').length, 0);
      assert.equal(getUserCircles('eva').length, 0);
    });

    test('hasGroupChallengeNotification detects pending invites or live matches', () => {
      assert.equal(hasGroupChallengeNotification('frank'), false);

      const circle = createCircle('alice', 'Battle Arena');
      sendCircleInvite('alice', 'frank', circle.id, circle.name);

      assert.equal(hasGroupChallengeNotification('frank'), true);

      // Accept invite
      const [inv] = getPendingCircleInvites('frank');
      respondCircleInvite('frank', inv.id, true);

      // Now no pending invites and circle is "No active match"
      assert.equal(hasGroupChallengeNotification('frank'), false);
    });
  });
});
