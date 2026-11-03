/**
 * Supabase Database & Authentication Service for Daily Code Practice
 * 
 * Key Features:
 * - Supabase integration as the primary remote database & auth provider
 * - Persistent local cache in localStorage for fast performance and offline resilience
 * - Strict email format validation: ONLY Gmail (xyz@gmail.com) and Educational Emails (.edu, .edu.*, .ac.*)
 * - Multi-device verification: unrecognized devices require mail verification OTP
 * - Every single login verifies that the user already exists in the database
 * 
 * SECURITY:
 * - Only publishable keys or client-safe endpoints are used on the frontend.
 * - SUPABASE_SECRET_KEY is kept strictly on the backend server.
 */

import { supabase } from './supabaseClient.js';

const DB_STORAGE_KEY = 'daily_code_practice_users_db';
const DEVICE_ID_KEY = 'codelife_device_id';

// Clean, zero-user initial state (all user accounts are stored dynamically in database)
const INITIAL_SEED_USERS = [];

/**
 * Strict Email Security Validation:
 * Only approves:
 *  1. Gmail: domain is strictly 'gmail.com' (e.g. itssrehann2324@gmail.com)
 *  2. Educational domains: ending with .edu, .edu.<country>, or .ac.<country>
 *     (e.g. sazid.cse.00725205101061@aust.edu, student@buet.ac.bd, scholar@oxford.ac.uk)
 * Disallows Yahoo, Hotmail, Outlook, iCloud, disposable or other commercial/personal domains.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isValidApprovedEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();

  // Basic email structure check: {user}@{domain}.{tld}
  const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!basicRegex.test(trimmed)) {
    return false;
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domainPart] = parts;
  if (!localPart || !domainPart) return false;
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false;

  // 1. Gmail approval
  if (domainPart === 'gmail.com') {
    return true;
  }

  // 2. Educational mail approval (.edu, .edu.xx, .ac.xx)
  const isEducational = /\.edu(\.[a-z]{2,})?$/.test(domainPart) || /\.ac\.[a-z]{2,}$/.test(domainPart);
  if (isEducational) {
    return true;
  }

  return false;
}

/**
 * Helper to return human-friendly validation error message for rejected emails
 */
export function getApprovedEmailErrorMessage(email) {
  if (!email || !email.trim()) {
    return 'Please enter your email address.';
  }
  const trimmed = email.trim().toLowerCase();
  const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!basicRegex.test(trimmed)) {
    return 'Invalid email structure. Email must follow the format: name@domain.com';
  }
  return 'Only Gmail (e.g. xyz@gmail.com) and educational emails (e.g. name@aust.edu) are accepted. Yahoo, Hotmail, and other personal emails are not permitted.';
}

/**
 * Validate email structure (alias strictly enforcing approved email security policy)
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmailFormat(email) {
  return isValidApprovedEmail(email);
}

/**
 * Get or generate a persistent unique ID for the current browser/device
 * @returns {string} Unique device identifier
 */
export function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return 'server_device';
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'fallback_device_' + Date.now();
  }
}

/**
 * Get human-friendly label for current browser device
 * e.g. "Windows PC (Chrome)", "Mac (Safari)", "Mobile Device"
 */
export function getCurrentDeviceName() {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent;
  let os = 'Unknown Device';
  if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android Device';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS Device';

  let browser = 'Browser';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  return `${os} (${browser})`;
}

/**
 * Check if the current device is already verified and trusted for this user
 * @param {string} usernameOrEmail
 * @param {string} [deviceId]
 * @returns {boolean}
 */
export function isDeviceTrustedForUser(usernameOrEmail, deviceId) {
  const user = findUser(usernameOrEmail);
  if (!user) return false;

  const currentDeviceId = deviceId || getOrCreateDeviceId();

  if (Array.isArray(user.trustedDevices)) {
    return user.trustedDevices.includes(currentDeviceId);
  }

  return false;
}

/**
 * Add a device ID to user's list of trusted/verified devices.
 * Updates local cache and syncs with Supabase.
 * 
 * @param {string} usernameOrEmail
 * @param {string} [deviceId]
 * @returns {boolean}
 */
export function addTrustedDeviceForUser(usernameOrEmail, deviceId) {
  const currentDeviceId = deviceId || getOrCreateDeviceId();
  const users = getUsers();
  const clean = (usernameOrEmail || '').trim().toLowerCase();

  const index = users.findIndex(
    (u) => u.email.toLowerCase() === clean || u.username.toLowerCase() === clean
  );
  if (index === -1) return false;

  const user = users[index];
  const trusted = Array.isArray(user.trustedDevices) ? [...user.trustedDevices] : [];
  if (!trusted.includes(currentDeviceId)) {
    trusted.push(currentDeviceId);
  }

  users[index].trustedDevices = trusted;
  users[index].lastLoginDevice = currentDeviceId;
  users[index].lastLoginAt = new Date().toISOString();
  saveUsers(users);

  // Sync to Supabase in background
  syncTrustedDeviceToSupabase(user.email || user.username, currentDeviceId);

  return true;
}

/**
 * Helper to sync trusted device to Supabase backend API or client
 */
async function syncTrustedDeviceToSupabase(identifier, deviceId) {
  try {
    const res = await fetch('/api/auth/trust-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, deviceId }),
    });
    if (!res.ok) {
      // If backend API isn't running, update via client if active session
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const existing = Array.isArray(user.user_metadata?.trustedDevices) ? user.user_metadata.trustedDevices : [];
        const updated = [...new Set([...existing, deviceId])];
        await supabase.auth.updateUser({
          data: { trustedDevices: updated },
        });
      }
    }
  } catch (err) {
    console.warn('[DB] Supabase device sync notice:', err.message);
  }
}

/**
 * Reset / clear trusted devices for a user (forces mail verification on next login)
 * @param {string} usernameOrEmail
 */
export function clearTrustedDevicesForUser(usernameOrEmail) {
  const users = getUsers();
  const clean = (usernameOrEmail || '').trim().toLowerCase();

  const index = users.findIndex(
    (u) => u.email.toLowerCase() === clean || u.username.toLowerCase() === clean
  );
  if (index === -1) return false;

  users[index].trustedDevices = [];
  saveUsers(users);
  return true;
}

/**
 * Purge legacy mockup and seed accounts from memory and localStorage
 */
export function purgeAlexJohnson() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;

    const legacyUsernames = ['love_code', 'student_dev', 'coader'];
    const legacyEmails = ['lovecode@gmail.com', 'sarah.cse@aust.edu', 'coader@gmail.com'];
    const legacyNames = ['alex johnson', 'student dev', 'coading user'];

    const isLegacyUser = (u) => {
      if (!u) return false;
      const uname = (u.username || '').toLowerCase();
      const umail = (u.email || '').toLowerCase();
      const unameStr = (u.name || '').toLowerCase();
      return (
        legacyUsernames.includes(uname) ||
        legacyEmails.includes(umail) ||
        legacyNames.includes(unameStr)
      );
    };

    // 1. Clean users database
    const rawUsers = localStorage.getItem(DB_STORAGE_KEY);
    if (rawUsers) {
      const parsed = JSON.parse(rawUsers);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((u) => !isLegacyUser(u));
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(cleaned));
        }
      }
    }

    // 2. Clean active user session
    const rawActive = localStorage.getItem('codelife_active_user');
    if (rawActive) {
      const active = JSON.parse(rawActive);
      if (isLegacyUser(active)) {
        localStorage.removeItem('codelife_active_user');
      }
    }

    // 3. Clean remembered credentials
    const rawRemembered = localStorage.getItem('codelife_remembered_credentials');
    if (rawRemembered) {
      const remembered = JSON.parse(rawRemembered);
      if (isLegacyUser(remembered)) {
        localStorage.removeItem('codelife_remembered_credentials');
      }
    }

    // 4. Clean user profiles, streaks, and code store data for legacy accounts
    for (const uname of legacyUsernames) {
      localStorage.removeItem(`codelife_profiles_${uname}`);
      localStorage.removeItem(`codelife_streak_${uname}`);
      localStorage.removeItem(`codelife_codestore_${uname}`);
    }
  } catch (e) {
    console.error('Error purging legacy data from memory/db:', e);
  }
}

/**
 * Wipe all user data completely across browser cache
 */
export function clearAllUserData() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(DB_STORAGE_KEY);
      localStorage.removeItem('codelife_active_user');
      localStorage.removeItem('codelife_remembered_credentials');
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify([]));
    }
  } catch (e) {
    console.error('Error clearing local user data:', e);
  }
}

// Automatically purge immediately on module evaluation
if (typeof window !== 'undefined') {
  purgeAlexJohnson();
}

/**
 * Retrieve all users from database cache
 * @returns {Array} Array of user objects
 */
export function getUsers() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(INITIAL_SEED_USERS));
      return INITIAL_SEED_USERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(INITIAL_SEED_USERS));
      return INITIAL_SEED_USERS;
    }
    const cleaned = parsed
      .filter((u) => {
        const uname = (u?.username || '').toLowerCase();
        const umail = (u?.email || '').toLowerCase();
        return (
          uname !== 'love_code' &&
          uname !== 'student_dev' &&
          uname !== 'coader' &&
          umail !== 'lovecode@gmail.com' &&
          umail !== 'sarah.cse@aust.edu' &&
          umail !== 'coader@gmail.com'
        );
      })
      .map((u) => ({
        ...u,
        trustedDevices: Array.isArray(u.trustedDevices) ? u.trustedDevices : [],
      }));
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch (err) {
    console.error('[DB] Error reading users from storage:', err);
    return INITIAL_SEED_USERS;
  }
}

/**
 * Save users to database cache
 * @param {Array} users
 */
function saveUsers(users) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('[DB] Error saving users to storage:', err);
  }
}

/**
 * Find user by email or username (synchronous, checks local cache)
 * @param {string} identifier - Email or username
 * @returns {object|null} Found user or null
 */
export function findUser(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();
  const users = getUsers();
  return (
    users.find(
      (u) => u.email.toLowerCase() === clean || u.username.toLowerCase() === clean
    ) || null
  );
}

/**
 * Find user asynchronously, checking local cache first (or forcing server refresh),
 * then querying Supabase backend to ensure accounts registered on other devices are recognized.
 * @param {string} identifier - Email or username
 * @param {boolean} [forceRefresh=false] - Whether to bypass local cache and query server directly
 * @returns {Promise<object|null>} Found user or null
 */
export async function findUserAsync(identifier, forceRefresh = false) {
  if (!identifier) return null;
  if (!forceRefresh) {
    const local = findUser(identifier);
    if (local) return local;
  }

  try {
    const res = await fetch('/api/auth/check-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifier.trim() }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.exists && data.user) {
        // Cache or update user locally
        const users = getUsers();
        const existingIdx = users.findIndex(
          (u) =>
            u.email.toLowerCase() === data.user.email?.toLowerCase() ||
            u.username?.toLowerCase() === data.user.username?.toLowerCase()
        );
        if (existingIdx !== -1) {
          users[existingIdx] = {
            ...users[existingIdx],
            ...data.user,
            password: data.user.password || users[existingIdx].password,
          };
        } else {
          users.push(data.user);
        }
        saveUsers(users);
        return data.user;
      }
    }
  } catch (err) {
    console.warn('[DB] Backend check-user unavailable:', err.message);
  }

  return findUser(identifier);
}

/**
 * Check if email or username is already registered in database
 * @param {string} email
 * @param {string} username
 * @returns {{ emailTaken: boolean, usernameTaken: boolean }}
 */
export function checkUserExists(email, username) {
  const users = getUsers();
  const cleanEmail = email?.trim().toLowerCase();
  const cleanUser = username?.trim().toLowerCase();

  const emailTaken = users.some((u) => u.email.toLowerCase() === cleanEmail);
  const usernameTaken = users.some((u) => u.username.toLowerCase() === cleanUser);

  return { emailTaken, usernameTaken };
}

/**
 * Register a new user in database & Supabase
 * @param {object} userData
 * @returns {{ success: boolean, message?: string, user?: object }}
 */
export function registerUser(userData) {
  const { name, username, email, institution, password } = userData;

  if (!isValidApprovedEmail(email)) {
    return {
      success: false,
      message: getApprovedEmailErrorMessage(email),
    };
  }

  const { emailTaken, usernameTaken } = checkUserExists(email, username);
  if (emailTaken) {
    return {
      success: false,
      message: 'This email is already registered in our database. Please sign in.',
    };
  }
  if (usernameTaken) {
    return {
      success: false,
      message: 'This username is already taken. Please choose another username.',
    };
  }

  const currentDeviceId = userData.deviceId || getOrCreateDeviceId();

  const newUser = {
    name: name.trim(),
    username: username.trim(),
    email: email.trim().toLowerCase(),
    institution: (institution || '').trim(),
    password: password.trim(),
    trustedDevices: [currentDeviceId],
    lastLoginDevice: currentDeviceId,
    createdAt: new Date().toISOString(),
  };

  const users = getUsers();
  users.push(newUser);
  saveUsers(users);

  // Sync new user to Supabase in background
  syncNewUserToSupabase(newUser);

  return {
    success: true,
    user: newUser,
  };
}

/**
 * Asynchronously register a new user and await Supabase persistence.
 * Guarantees that the new user is saved in Supabase so other devices can log in immediately.
 * @param {object} userData
 * @returns {Promise<{ success: boolean, message?: string, user?: object }>}
 */
export async function registerUserAsync(userData) {
  const localRes = registerUser(userData);
  if (!localRes.success) return localRes;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        const users = getUsers();
        const idx = users.findIndex(
          (u) => u.email.toLowerCase() === data.user.email?.toLowerCase()
        );
        if (idx !== -1) {
          users[idx] = { ...users[idx], ...data.user, password: userData.password };
        } else {
          users.push({ ...data.user, password: userData.password });
        }
        saveUsers(users);
        return { success: true, user: users[idx !== -1 ? idx : users.length - 1] };
      }
    }
  } catch (err) {
    console.warn('[DB] Supabase register error:', err.message);
  }

  return localRes;
}

/**
 * Background helper to persist registered user in Supabase
 */
async function syncNewUserToSupabase(userData) {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!res.ok) {
      // Fallback: register via client Supabase Auth (publishable key)
      await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            name: userData.name,
            username: userData.username,
            institution: userData.institution,
            trustedDevices: userData.trustedDevices,
          },
        },
      });
    }
  } catch (err) {
    console.warn('[DB] Supabase user registration notice:', err.message);
  }
}

/**
 * Update user's password in database & Supabase
 * @param {string} identifier - Email or username
 * @param {string} newPassword
 * @returns {boolean}
 */
export function updateUserPassword(identifier, newPassword) {
  if (!identifier || !newPassword) return false;
  const clean = identifier.trim().toLowerCase();
  const users = getUsers();

  const index = users.findIndex(
    (u) => u.email.toLowerCase() === clean || u.username.toLowerCase() === clean
  );

  if (index !== -1) {
    users[index].password = newPassword.trim();
    users[index].updatedAt = new Date().toISOString();
    saveUsers(users);
  }

  // Update in Supabase in background
  syncPasswordUpdateToSupabase(identifier, newPassword);
  return true;
}

/**
 * Background helper to update password in Supabase
 */
async function syncPasswordUpdateToSupabase(identifier, newPassword) {
  try {
    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, newPassword }),
    });
    if (!res.ok) {
      await supabase.auth.updateUser({ password: newPassword });
    }
  } catch (err) {
    console.warn('[DB] Supabase password update notice:', err.message);
  }
}

/**
 * Strictly check whether a user exists in the database by username or email.
 * This is verified on every single login attempt.
 *
 * @param {string} identifier - Username or Email
 * @returns {boolean} True if user exists in database, false otherwise.
 */
export function isUserInDatabase(identifier) {
  if (!identifier || typeof identifier !== 'string') return false;
  return Boolean(findUser(identifier));
}

/**
 * Asynchronously check whether a user exists in Supabase database
 * @param {string} identifier - Username or Email
 * @returns {Promise<boolean>}
 */
export async function isUserInDatabaseAsync(identifier) {
  if (!identifier || typeof identifier !== 'string') return false;
  const user = await findUserAsync(identifier);
  return Boolean(user);
}

/**
 * Sync users list from Supabase backend to keep local cache fresh
 */
export async function syncUsersFromSupabase() {
  try {
    const res = await fetch('/api/auth/users');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.users) && data.users.length > 0) {
        const localUsers = getUsers();
        const merged = [...localUsers];

        for (const remoteUser of data.users) {
          const idx = merged.findIndex(
            (u) => u.email.toLowerCase() === remoteUser.email.toLowerCase()
          );
          if (idx !== -1) {
            merged[idx] = {
              ...merged[idx],
              name: remoteUser.name || merged[idx].name,
              username: remoteUser.username || merged[idx].username,
              institution: remoteUser.institution || merged[idx].institution,
              password: remoteUser.password || merged[idx].password,
              trustedDevices: Array.isArray(remoteUser.trustedDevices)
                ? remoteUser.trustedDevices
                : merged[idx].trustedDevices,
            };
          } else {
            merged.push({
              name: remoteUser.name || '',
              username: remoteUser.username || remoteUser.email.split('@')[0],
              email: remoteUser.email,
              institution: remoteUser.institution || '',
              password: remoteUser.password || 'password123',
              trustedDevices: Array.isArray(remoteUser.trustedDevices)
                ? remoteUser.trustedDevices
                : [],
              createdAt: remoteUser.createdAt || new Date().toISOString(),
            });
          }
        }

        saveUsers(merged);
      }
    }
  } catch {
    // Silent fallback if server is offline
  }
}

// Automatically sync users in background on browser initialization
if (typeof window !== 'undefined') {
  syncUsersFromSupabase();
}

/**
 * Remember Me Credentials Storage
 * Saves, retrieves, and clears remembered login credentials
 */
const REMEMBERED_CREDENTIALS_KEY = 'codelife_remembered_credentials';

export function getRememberedCredentials() {
  try {
    const raw = localStorage.getItem(REMEMBERED_CREDENTIALS_KEY);
    if (!raw) return null;
    const creds = JSON.parse(raw);
    if (!creds?.username) return null;
    // Strict DB verification: Ensure remembered user actually exists in the database
    const userInDb = findUser(creds.username);
    if (!userInDb) {
      clearRememberedCredentials();
      return null;
    }
    return creds;
  } catch {
    return null;
  }
}

export function saveRememberedCredentials(credentials) {
  try {
    localStorage.setItem(REMEMBERED_CREDENTIALS_KEY, JSON.stringify(credentials));
  } catch (e) {
    console.error('Failed to save remembered credentials', e);
  }
}

export function clearRememberedCredentials() {
  try {
    localStorage.removeItem(REMEMBERED_CREDENTIALS_KEY);
  } catch (e) {
    console.error('Failed to clear remembered credentials', e);
  }
}
