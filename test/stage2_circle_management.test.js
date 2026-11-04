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
  DEFAULT_MAX_CIRCLE_MEMBERS,
  MIN_PLAYERS_PER_CIRCLE,
  MIN_TEAM_SIZE,
  createCircle,
  getCircleById,
  getUserCircles,
  joinCircleByCode,
  removeMemberFromCircle,
  leaveCircle,
  deleteCircle,
  updateCircleName,
  sendCircleInvite,
  inviteByEmail,
  getCirclePendingInvites,
  revokeCircleInvite,
  respondCircleInvite,
} from '../src/services/groupChallengeService.js';

describe('Stage 2: Circle Management & Member Administration', () => {
  beforeEach(() => {
    storage.clear();
    // Seed test users in users database
    const mockUsers = [
      { username: 'admin_alice', name: 'Alice Admin', email: 'alice@codelife.dev' },
      { username: 'bob_coder', name: 'Bob Coder', email: 'bob@codelife.dev' },
      { username: 'charlie_dev', name: 'Charlie Dev', email: 'charlie@codelife.dev' },
      { username: 'david_algo', name: 'David Algo', email: 'david@codelife.dev' },
      { username: 'eva_hacker', name: 'Eva Hacker', email: 'eva@codelife.dev' },
    ];
    storage.set('daily_code_practice_users_db', JSON.stringify(mockUsers));
  });

  describe('1. Circle Creation & Validation Rules', () => {
    test('Creates circle with admin role, default capacity 50, and 6-char uppercase code', () => {
      assert.equal(DEFAULT_MAX_CIRCLE_MEMBERS, 50);
      assert.equal(MIN_PLAYERS_PER_CIRCLE, 4);
      assert.equal(MIN_TEAM_SIZE, 2);

      const circle = createCircle('admin_alice', 'CodeLife Titans');
      assert.ok(circle);
      assert.equal(circle.name, 'CodeLife Titans');
      assert.equal(circle.adminUsername, 'admin_alice');
      assert.equal(circle.maxMembers, 50);
      assert.equal(circle.status, 'No active match');
      assert.equal(typeof circle.inviteCode, 'string');
      assert.equal(circle.inviteCode.length, 6);
      assert.equal(circle.members.length, 1);
      assert.equal(circle.members[0].username, 'admin_alice');
      assert.equal(circle.members[0].role, 'admin');

      // Accessible via getCircleById and getUserCircles
      const fetched = getCircleById(circle.id);
      assert.equal(fetched.name, 'CodeLife Titans');

      const aliceCircles = getUserCircles('admin_alice');
      assert.equal(aliceCircles.length, 1);
      assert.equal(aliceCircles[0].id, circle.id);
    });

    test('Admin can rename circle, non-admin cannot', () => {
      const circle = createCircle('admin_alice', 'Original Name');

      // Admin updates name
      const adminUpdate = updateCircleName('admin_alice', circle.id, 'Renamed Squad');
      assert.equal(adminUpdate.success, true);
      assert.equal(getCircleById(circle.id).name, 'Renamed Squad');

      // Non-admin attempts to rename
      const hackerUpdate = updateCircleName('bob_coder', circle.id, 'Hacked Name');
      assert.equal(hackerUpdate.success, false);
      assert.match(hackerUpdate.error, /Only the circle admin/);
      assert.equal(getCircleById(circle.id).name, 'Renamed Squad');
    });
  });

  describe('2. Joining with Invite Code & Capacity Limits', () => {
    test('Allows joining via valid invite code and prevents duplicates', () => {
      const circle = createCircle('admin_alice', 'Binary Beasts');

      // Bob joins with code
      const joinBob = joinCircleByCode('bob_coder', circle.inviteCode);
      assert.equal(joinBob.success, true);
      assert.equal(joinBob.circle.members.length, 2);
      assert.ok(joinBob.circle.members.some((m) => m.username === 'bob_coder'));

      // Bob cannot join again
      const joinBobAgain = joinCircleByCode('bob_coder', circle.inviteCode);
      assert.equal(joinBobAgain.success, false);
      assert.match(joinBobAgain.error, /already a member/);
    });

    test('Rejects invalid invite codes', () => {
      const res = joinCircleByCode('bob_coder', 'INVALID');
      assert.equal(res.success, false);
      assert.match(res.error, /not found/i);
    });

    test('Enforces configurable max capacity limit', () => {
      // Create small circle with max 2 members
      const circle = createCircle('admin_alice', 'Duo Club', 2);
      assert.equal(circle.maxMembers, 2);

      // 2nd member joins (success)
      const join2 = joinCircleByCode('bob_coder', circle.inviteCode);
      assert.equal(join2.success, true);

      // 3rd member attempts to join (capacity exceeded)
      const join3 = joinCircleByCode('charlie_dev', circle.inviteCode);
      assert.equal(join3.success, false);
      assert.match(join3.error, /full|limit/i);
    });
  });

  describe('3. Multi-Channel Invitations (Username, Email, Revocation)', () => {
    test('Invite by username and accept flow', () => {
      const circle = createCircle('admin_alice', 'Recursion Club');

      const inviteRes = sendCircleInvite('admin_alice', 'charlie_dev', circle.id, circle.name);
      assert.equal(inviteRes.success, true);

      // Appears in pending outgoing invites for the circle
      const circleInvites = getCirclePendingInvites(circle.id);
      assert.equal(circleInvites.length, 1);
      assert.equal(circleInvites[0].targetUsername, 'charlie_dev');

      // Charlie accepts
      const acceptRes = respondCircleInvite('charlie_dev', inviteRes.invite.id, true);
      assert.equal(acceptRes, true);

      // Circle members list now contains Charlie
      const updatedCircle = getCircleById(circle.id);
      assert.equal(updatedCircle.members.length, 2);
      assert.ok(updatedCircle.members.some((m) => m.username === 'charlie_dev'));

      // Pending outgoing invites now empty
      assert.equal(getCirclePendingInvites(circle.id).length, 0);
    });

    test('Cannot invite someone who is already a member', () => {
      const circle = createCircle('admin_alice', 'Dynamic Programmers');
      joinCircleByCode('david_algo', circle.inviteCode);

      const dupInvite = sendCircleInvite('admin_alice', 'david_algo', circle.id, circle.name);
      assert.equal(dupInvite.success, false);
      assert.match(dupInvite.error, /already a member/);
    });

    test('Invite by email finds existing registered user and sends invite', () => {
      const circle = createCircle('admin_alice', 'Graph Theorists');

      // 'bob@codelife.dev' corresponds to 'bob_coder'
      const emailInvite = inviteByEmail('admin_alice', circle.id, 'bob@codelife.dev');
      assert.equal(emailInvite.success, true);

      const circleInvites = getCirclePendingInvites(circle.id);
      assert.equal(circleInvites.length, 1);
      assert.equal(circleInvites[0].targetUsername, 'bob_coder');
    });

    test('Invite by email for non-registered user provides external invite payload', () => {
      const circle = createCircle('admin_alice', 'Graph Theorists');

      const extInvite = inviteByEmail('admin_alice', circle.id, 'newfriend@external.org');
      assert.equal(extInvite.success, true);
      assert.equal(extInvite.isExternal, true);
      assert.equal(extInvite.inviteCode, circle.inviteCode);
    });

    test('Admin can revoke outgoing pending invite', () => {
      const circle = createCircle('admin_alice', 'Stack Overflow');
      const inv = sendCircleInvite('admin_alice', 'eva_hacker', circle.id, circle.name);
      assert.equal(getCirclePendingInvites(circle.id).length, 1);

      // Non-admin cannot revoke
      const hackerRevoke = revokeCircleInvite('bob_coder', circle.id, inv.invite.id);
      assert.equal(hackerRevoke.success, false);

      // Admin revokes
      const adminRevoke = revokeCircleInvite('admin_alice', circle.id, inv.invite.id);
      assert.equal(adminRevoke.success, true);
      assert.equal(getCirclePendingInvites(circle.id).length, 0);
    });
  });

  describe('4. Member Administration & Circle Removal', () => {
    test('Admin can remove a member from the circle', () => {
      const circle = createCircle('admin_alice', 'Code Masters');
      joinCircleByCode('bob_coder', circle.inviteCode);
      assert.equal(getCircleById(circle.id).members.length, 2);

      // Admin removes Bob
      const removeRes = removeMemberFromCircle('admin_alice', circle.id, 'bob_coder');
      assert.equal(removeRes.success, true);

      const updated = getCircleById(circle.id);
      assert.equal(updated.members.length, 1);
      assert.equal(updated.members.some((m) => m.username === 'bob_coder'), false);

      // Bob's circles no longer has this circle
      assert.equal(getUserCircles('bob_coder').length, 0);
    });

    test('Admin cannot be removed from circle', () => {
      const circle = createCircle('admin_alice', 'Code Masters');
      const removeAdmin = removeMemberFromCircle('admin_alice', circle.id, 'admin_alice');
      assert.equal(removeAdmin.success, false);
      assert.match(removeAdmin.error, /cannot be removed/i);
    });

    test('Non-admin member can leave the circle', () => {
      const circle = createCircle('admin_alice', 'Code Masters');
      joinCircleByCode('bob_coder', circle.inviteCode);

      const leaveRes = leaveCircle('bob_coder', circle.id);
      assert.equal(leaveRes.success, true);
      assert.equal(getCircleById(circle.id).members.length, 1);
      assert.equal(getUserCircles('bob_coder').length, 0);
    });

    test('Admin can delete circle and clean up all members and pending invites', () => {
      const circle = createCircle('admin_alice', 'Ephemeral Circle');
      joinCircleByCode('bob_coder', circle.inviteCode);
      sendCircleInvite('admin_alice', 'charlie_dev', circle.id, circle.name);

      // Non-admin cannot delete
      const hackerDel = deleteCircle('bob_coder', circle.id);
      assert.equal(hackerDel.success, false);

      // Admin deletes
      const adminDel = deleteCircle('admin_alice', circle.id);
      assert.equal(adminDel.success, true);

      assert.equal(getCircleById(circle.id), null);
      assert.equal(getUserCircles('admin_alice').length, 0);
      assert.equal(getUserCircles('bob_coder').length, 0);
    });
  });

  describe('5. Challenge Eligibility (Minimum 4 Players Threshold)', () => {
    test('Tracks eligibility: requires at least 4 members (2 teams x 2 players)', () => {
      const circle = createCircle('admin_alice', 'Tournament Circle');

      // 1 member (Alice) -> < 4 members
      let current = getCircleById(circle.id);
      assert.equal(current.members.length < MIN_PLAYERS_PER_CIRCLE, true);

      // Add 2nd member (Bob) -> 2 members
      joinCircleByCode('bob_coder', circle.inviteCode);
      current = getCircleById(circle.id);
      assert.equal(current.members.length < MIN_PLAYERS_PER_CIRCLE, true);

      // Add 3rd member (Charlie) -> 3 members
      joinCircleByCode('charlie_dev', circle.inviteCode);
      current = getCircleById(circle.id);
      assert.equal(current.members.length < MIN_PLAYERS_PER_CIRCLE, true);

      // Add 4th member (David) -> 4 members (Ready for Challenge!)
      joinCircleByCode('david_algo', circle.inviteCode);
      current = getCircleById(circle.id);
      assert.equal(current.members.length >= MIN_PLAYERS_PER_CIRCLE, true);
      assert.equal(current.members.length, 4);
    });
  });
});
