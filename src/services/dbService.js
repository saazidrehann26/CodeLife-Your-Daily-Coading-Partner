/**
 * Local Database Service for Daily Code Practice
 * - Persistent mock database stored in localStorage
 * - Strict email format validation: ONLY Gmail (xyz@gmail.com) and Educational Emails (.edu, .edu.*, .ac.*)
 * - Device tracking & authentication: multi-device login requires mail verification
 * - User lookup, registration, and password update
 */

const DB_STORAGE_KEY = 'daily_code_practice_users_db';
const DEVICE_ID_KEY = 'codelife_device_id';

// Initial pre-registered users in the database with approved credentials
const INITIAL_SEED_USERS = [
  {
    name: 'Student Dev',
    username: 'student_dev',
    email: 'sarah.cse@aust.edu',
    institution: 'AUST',
    password: 'password123',
    trustedDevices: [],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Coading User',
    username: 'coader',
    email: 'coader@gmail.com',
    institution: 'Dhaka University',
    password: 'password123',
    trustedDevices: [],
    createdAt: new Date().toISOString(),
  },
];

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

  // If user has a trustedDevices array, check if currentDeviceId is included
  if (Array.isArray(user.trustedDevices)) {
    return user.trustedDevices.includes(currentDeviceId);
  }

  return false;
}

/**
 * Add a device ID to user's list of trusted/verified devices
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
  return true;
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
 * Purge any legacy Alex Johnson / love_code data from memory and database
 */
export function purgeAlexJohnson() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;

    // 1. Clean users database
    const rawUsers = localStorage.getItem(DB_STORAGE_KEY);
    if (rawUsers) {
      const parsed = JSON.parse(rawUsers);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (u) =>
            u?.username?.toLowerCase() !== 'love_code' &&
            u?.name?.toLowerCase() !== 'alex johnson' &&
            u?.email?.toLowerCase() !== 'lovecode@gmail.com'
        );
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(cleaned));
        }
      }
    }

    // 2. Clean active user session
    const rawActive = localStorage.getItem('codelife_active_user');
    if (rawActive) {
      const active = JSON.parse(rawActive);
      if (
        active?.username?.toLowerCase() === 'love_code' ||
        active?.name?.toLowerCase() === 'alex johnson' ||
        active?.email?.toLowerCase() === 'lovecode@gmail.com'
      ) {
        localStorage.removeItem('codelife_active_user');
      }
    }

    // 3. Clean remembered credentials
    const rawRemembered = localStorage.getItem('codelife_remembered_credentials');
    if (rawRemembered) {
      const remembered = JSON.parse(rawRemembered);
      if (
        remembered?.username?.toLowerCase() === 'love_code' ||
        remembered?.username?.toLowerCase() === 'lovecode@gmail.com'
      ) {
        localStorage.removeItem('codelife_remembered_credentials');
      }
    }

    // 4. Clean user profiles, streaks, and code store data for love_code
    localStorage.removeItem('codelife_profiles_love_code');
    localStorage.removeItem('codelife_streak_love_code');
    localStorage.removeItem('codelife_codestore_love_code');
  } catch (e) {
    console.error('Error purging Alex Johnson from memory/db:', e);
  }
}

// Automatically purge immediately on module evaluation
if (typeof window !== 'undefined') {
  purgeAlexJohnson();
}

/**
 * Retrieve all users from database
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
    // Ensure Alex Johnson / love_code is purged if still present in storage
    const cleaned = parsed
      .filter(
        (u) =>
          u?.username?.toLowerCase() !== 'love_code' &&
          u?.name?.toLowerCase() !== 'alex johnson' &&
          u?.email?.toLowerCase() !== 'lovecode@gmail.com'
      )
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
 * Save users to database
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
 * Find user by email or username (case-insensitive)
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
 * Register a new user in database
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

  return {
    success: true,
    user: newUser,
  };
}

/**
 * Update user's password in database
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

  if (index === -1) return false;

  users[index].password = newPassword.trim();
  users[index].updatedAt = new Date().toISOString();
  saveUsers(users);
  return true;
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
