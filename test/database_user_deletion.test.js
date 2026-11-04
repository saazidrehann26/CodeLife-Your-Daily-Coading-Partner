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
  saveUsers,
  getUsers,
  findUser,
  deleteUser,
  verifyUserExistsInDatabase,
} from '../src/services/dbService.js';

import {
  getActiveUser,
  setActiveUser,
} from '../src/services/dashboardService.js';

describe('Database User Deletion & Session Access Suite', () => {
  beforeEach(() => {
    storage.clear();
  });

  test('1. deleteUser removes user from database by username and email', () => {
    const mockUsers = [
      {
        name: 'John Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: 'password123',
      },
      {
        name: 'Jane Smith',
        username: 'janesmith',
        email: 'jane@example.com',
        password: 'password456',
      },
    ];

    saveUsers(mockUsers);
    assert.equal(getUsers().length, 2);
    assert.ok(findUser('johndoe'));

    // Delete by username
    const deletedByUname = deleteUser('johndoe');
    assert.equal(deletedByUname, true);
    assert.equal(getUsers().length, 1);
    assert.equal(findUser('johndoe'), null);
    assert.equal(findUser('john@example.com'), null);

    // Delete by email
    const deletedByEmail = deleteUser('jane@example.com');
    assert.equal(deletedByEmail, true);
    assert.equal(getUsers().length, 0);
    assert.equal(findUser('janesmith'), null);
  });

  test('2. deleteUser automatically purges active session for currently logged-in user', () => {
    const user = {
      name: 'Bob Builder',
      username: 'bob_builds',
      email: 'bob@builder.com',
      password: 'secret_pass_1',
    };

    saveUsers([user]);
    setActiveUser(user);
    localStorage.setItem('codelife_remembered_credentials', JSON.stringify({ email: user.email }));

    // User is active
    const activeBefore = getActiveUser();
    assert.ok(activeBefore);
    assert.equal(activeBefore.username, 'bob_builds');

    // Delete user from database
    deleteUser('bob_builds');

    // Session must be purged immediately
    assert.equal(localStorage.getItem('codelife_active_user'), null);
    assert.equal(localStorage.getItem('codelife_remembered_credentials'), null);
    assert.equal(getActiveUser(), null);
  });

  test('3. getActiveUser() returns null immediately if user was removed from DB even if active session JSON is present', () => {
    const user = {
      name: 'Ghost User',
      username: 'ghost_user',
      email: 'ghost@spectral.io',
      password: 'password123',
    };

    // User in DB and active
    saveUsers([user]);
    setActiveUser(user);
    assert.ok(getActiveUser());

    // User deleted directly from database (e.g. database admin deleted record)
    saveUsers([]);

    // Stale session remains in localStorage until checked
    assert.ok(localStorage.getItem('codelife_active_user'));

    // Calling getActiveUser() must detect absence in DB, wipe the session, and return null
    const active = getActiveUser();
    assert.equal(active, null);
    assert.equal(localStorage.getItem('codelife_active_user'), null);
  });

  test('4. verifyUserExistsInDatabase correctly detects missing/deleted accounts', async () => {
    saveUsers([
      {
        name: 'Alice Wonder',
        username: 'alice_w',
        email: 'alice@wonderland.com',
        password: 'pass',
      },
    ]);

    const existsAlice = await verifyUserExistsInDatabase('alice_w');
    assert.equal(existsAlice, true);

    const existsNonExistent = await verifyUserExistsInDatabase('deleted_user');
    assert.equal(existsNonExistent, false);

    deleteUser('alice_w');
    const existsAfterDelete = await verifyUserExistsInDatabase('alice_w');
    assert.equal(existsAfterDelete, false);
  });

  test('5. deleteUser completely cleans up all user practice data, streaks, profiles, and active session', () => {
    const user = {
      name: 'Sam Fisher',
      username: 'sam_fisher',
      email: 'sam@echelon.org',
      password: 'password123',
    };

    saveUsers([user]);
    setActiveUser(user);

    // Populate user-specific data
    localStorage.setItem('codelife_user_streaks_sam_fisher', JSON.stringify({ current_streak: 5 }));
    localStorage.setItem('codelife_code_store_problems_sam_fisher', JSON.stringify([{ id: 1, title: 'Code' }]));
    localStorage.setItem('codelife_user_profiles_sam_fisher', JSON.stringify({ fullName: 'Sam Fisher' }));
    localStorage.setItem('codelife_user_privacy_sam_fisher', JSON.stringify({ showStats: true }));

    assert.ok(localStorage.getItem('codelife_user_streaks_sam_fisher'));
    assert.ok(localStorage.getItem('codelife_code_store_problems_sam_fisher'));
    assert.ok(localStorage.getItem('codelife_user_profiles_sam_fisher'));
    assert.ok(localStorage.getItem('codelife_user_privacy_sam_fisher'));

    // Trigger delete account
    const deleted = deleteUser('sam_fisher');
    assert.equal(deleted, true);

    // Verify all associated data and session are completely purged
    assert.equal(localStorage.getItem('codelife_user_streaks_sam_fisher'), null);
    assert.equal(localStorage.getItem('codelife_code_store_problems_sam_fisher'), null);
    assert.equal(localStorage.getItem('codelife_user_profiles_sam_fisher'), null);
    assert.equal(localStorage.getItem('codelife_user_privacy_sam_fisher'), null);
    assert.equal(localStorage.getItem('codelife_active_user'), null);
    assert.equal(findUser('sam_fisher'), null);
  });
});
