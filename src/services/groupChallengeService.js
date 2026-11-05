/**
 * Group Challenge Service (Stage 1: User Search, Public Profile, Circles & Invites State)
 * 
 * Complies with strict security and privacy standards:
 * - Sanitized User DTOs: Never exposes email, password, phone, device IDs, or private tokens.
 * - Privacy settings: Allows users to hide stats/institution and opt out of stranger invites.
 * - Rate limiting: Protects search against scraping.
 * - Case-insensitive prefix/partial username search.
 */

import { getUsers, findUser } from './dbService.js';
import {
  getUserProfile,
  getUserStreakData,
  DEFAULT_PROFILE_PHOTO,
  CURATED_PROBLEMS,
  getCodeStoreProblems,
} from './dashboardService.js';

const STORAGE_KEY_CIRCLES = 'codelife_group_circles';
const STORAGE_KEY_INVITES = 'codelife_group_invites';
const STORAGE_KEY_MATCH_HISTORY = 'codelife_group_match_history';
const STORAGE_KEY_USER_PRIVACY = 'codelife_user_privacy_';
const STORAGE_KEY_BLOCKED_USERS = 'codelife_blocked_users_';

// Client-side rate-limiting tracker for search: max 30 requests per minute
const searchRateLimiter = {
  timestamps: [],
  limit: 30,
  windowMs: 60 * 1000,
  isAllowed() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.limit) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  },
  reset() {
    this.timestamps = [];
  },
};

/**
 * Get user privacy settings with secure defaults
 * @param {string} username 
 */
export function getUserPrivacySettings(username) {
  if (!username) return { showInstitution: true, showStats: true, allowStrangerInvites: true };
  const clean = username.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_USER_PRIVACY}${clean}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        showInstitution: parsed.showInstitution !== false,
        showStats: parsed.showStats !== false,
        allowStrangerInvites: parsed.allowStrangerInvites !== false,
      };
    }
  } catch (e) {
    console.error('Error reading privacy settings:', e);
  }
  return { showInstitution: true, showStats: true, allowStrangerInvites: true };
}

/**
 * Update user privacy settings
 * @param {string} username 
 * @param {object} settings 
 */
export function saveUserPrivacySettings(username, settings) {
  if (!username) return;
  const clean = username.trim().toLowerCase();
  try {
    const current = getUserPrivacySettings(clean);
    const updated = { ...current, ...settings };
    localStorage.setItem(`${STORAGE_KEY_USER_PRIVACY}${clean}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Error saving privacy settings:', e);
  }
}

/**
 * Get blocked users list for a given user
 */
export function getBlockedUsers(username) {
  if (!username) return [];
  const clean = username.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_BLOCKED_USERS}${clean}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Error reading blocked users:', e);
  }
  return [];
}

/**
 * Block or unblock a user
 */
export function toggleBlockUser(currentUsername, targetUsername) {
  if (!currentUsername || !targetUsername) return false;
  const cleanCurrent = currentUsername.trim().toLowerCase();
  const cleanTarget = targetUsername.trim().toLowerCase();
  if (cleanCurrent === cleanTarget) return false;

  const list = getBlockedUsers(cleanCurrent);
  let updated;
  if (list.includes(cleanTarget)) {
    updated = list.filter((u) => u !== cleanTarget);
  } else {
    updated = [...list, cleanTarget];
  }
  localStorage.setItem(`${STORAGE_KEY_BLOCKED_USERS}${cleanCurrent}`, JSON.stringify(updated));
  return updated.includes(cleanTarget);
}

/**
 * Sanitized Public User DTO Builder
 * Strictly filters out any sensitive fields (email, password, trustedDevices, etc.)
 * @param {object} rawUser 
 * @param {string} [viewerUsername]
 */
export function buildPublicUserDTO(rawUser, viewerUsername = null) {
  if (!rawUser) return null;
  const uname = rawUser.username || '';
  const profile = getUserProfile(rawUser);
  const streak = getUserStreakData(uname);
  const privacy = getUserPrivacySettings(uname);
  const isOwner = viewerUsername && viewerUsername.toLowerCase() === uname.toLowerCase();

  const institutionVisible = privacy.showInstitution || isOwner;
  const statsVisible = privacy.showStats || isOwner;

  // Derive Group Challenge match stats if available
  const matchHistory = getCircleMatchHistory();
  let matchesPlayed = 0;
  let matchesWon = 0;
  matchHistory.forEach((m) => {
    if (m.participants?.includes(uname)) {
      matchesPlayed += 1;
      if (m.winningTeamMembers?.includes(uname)) {
        matchesWon += 1;
      }
    }
  });

  const institutionVal = profile?.institution || rawUser.institution;
  const classVal = profile?.classGrade || rawUser.classGrade;

  return {
    username: uname,
    name: profile?.fullName || rawUser.name || uname,
    photoUrl: profile?.photoUrl || DEFAULT_PROFILE_PHOTO,
    institution: institutionVisible ? (institutionVal || 'Not specified') : 'Hidden by user',
    classGrade: institutionVisible ? (classVal || 'Not specified') : 'Hidden by user',
    bio: profile?.bio || rawUser.bio || '',
    totalProblemsSolved: statsVisible ? (streak?.total_problems_solved || 0) : null,
    currentStreak: statsVisible ? (streak?.current_streak || 0) : null,
    longestStreak: statsVisible ? (streak?.longest_streak || 0) : null,
    matchesPlayed: statsVisible ? matchesPlayed : null,
    matchesWon: statsVisible ? matchesWon : null,
    memberSince: profile?.memberSince || 'Recent member',
    allowStrangerInvites: privacy.allowStrangerInvites,
    showInstitution: privacy.showInstitution,
    showStats: privacy.showStats,
    isBlocked: viewerUsername ? getBlockedUsers(viewerUsername).includes(uname.toLowerCase()) : false,
  };
}

/**
 * Case-insensitive search for users by username or name
 * - Debounced by caller (~300ms)
 * - Minimum 2 characters
 * - Max 10 results per page with offset
 * - Rate-limited to prevent username scraping
 * 
 * @param {string} query
 * @param {number} [offset=0]
 * @param {number} [limit=10]
 * @param {string} [viewerUsername=null]
 * @returns {Promise<{ results: Array, total: number, hasMore: boolean, rateLimited?: boolean }>}
 */
export async function searchUsers(query = '', offset = 0, limit = 10, viewerUsername = null) {
  const trimmed = (query || '').trim();
  if (trimmed.length < 2) {
    return { results: [], total: 0, hasMore: false };
  }

  // Enforce rate limit
  if (!searchRateLimiter.isAllowed()) {
    console.warn('[Search] Rate limit exceeded');
    return {
      results: [],
      total: 0,
      hasMore: false,
      rateLimited: true,
      error: 'Search rate limit exceeded. Please wait a moment before searching again.',
    };
  }

  // 1. Attempt server API call first if available
  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}&offset=${offset}&limit=${limit}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        results: data.results || [],
        total: data.total || 0,
        hasMore: data.hasMore || false,
      };
    }
  } catch {
    // Fall back to client database cache (offline / local resilience)
  }

  // 2. Client-side search fallback
  const cleanQ = trimmed.toLowerCase();
  const allUsers = getUsers();
  const blockedList = viewerUsername ? getBlockedUsers(viewerUsername) : [];

  const matched = allUsers.filter((u) => {
    const uname = (u?.username || '').toLowerCase();
    const name = (u?.name || '').toLowerCase();
    if (blockedList.includes(uname)) return false;
    return uname.includes(cleanQ) || name.includes(cleanQ);
  });

  const sliced = matched.slice(offset, offset + limit);
  const results = sliced.map((u) => buildPublicUserDTO(u, viewerUsername));

  return {
    results,
    total: matched.length,
    hasMore: offset + limit < matched.length,
  };
}

/**
 * Fetch a member's public profile safely
 * @param {string} username 
 * @param {string} [viewerUsername]
 * @returns {Promise<object|null>}
 */
export async function getPublicProfile(username, viewerUsername = null) {
  if (!username) return null;
  const clean = username.trim().toLowerCase();

  // Try API first
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(clean)}/public-profile`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.user) {
        return data.user;
      }
    }
  } catch {
    // Fall back to client database
  }

  const user = findUser(clean);
  if (!user) {
    return null;
  }
  return buildPublicUserDTO(user, viewerUsername);
}

export const DEFAULT_MAX_CIRCLE_MEMBERS = 50;
export const MIN_PLAYERS_PER_CIRCLE = 4; // 2 teams x minimum 2 players
export const MIN_TEAM_SIZE = 2;

const STORAGE_KEY_ALL_CIRCLES = 'codelife_group_all_circles';
const STORAGE_KEY_DELETED_CIRCLES = 'codelife_group_deleted_circles';

/**
 * Get IDs of deleted circles to prevent resurrection across devices/tabs
 * @returns {Array<string>}
 */
export function getDeletedCircleIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_CIRCLES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // storage fallback
  }
  return [];
}

/**
 * Save IDs of deleted circles
 * @param {Array<string>} ids 
 */
export function saveDeletedCircleIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY_DELETED_CIRCLES, JSON.stringify(ids));
  } catch {
    // storage fallback
  }
}

/**
 * Mark a circle as deleted locally
 * @param {string} circleId 
 */
export function markCircleDeletedLocally(circleId) {
  if (!circleId) return;
  const current = new Set(getDeletedCircleIds());
  current.add(circleId);
  saveDeletedCircleIds(Array.from(current));
}

/**
 * Get all circles from centralized storage
 * @returns {Array}
 */
export function getAllCircles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ALL_CIRCLES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading all circles:', e);
  }
  return [];
}

/**
 * Save all circles to centralized storage
 * @param {Array} circles 
 */
export function saveAllCircles(circles) {
  try {
    localStorage.setItem(STORAGE_KEY_ALL_CIRCLES, JSON.stringify(circles));
  } catch (e) {
    console.error('Error saving all circles:', e);
  }
}

/**
 * Get circles belonging to or joined by the user
 */
export function getUserCircles(username) {
  if (!username) return [];
  const clean = username.trim().toLowerCase();
  const all = getAllCircles();

  return all.filter((c) =>
    Array.isArray(c.members) && c.members.some((m) => (m.username || '').toLowerCase() === clean)
  );
}

/**
 * Save user's circles (legacy compatibility sync)
 */
export function saveUserCircles(username, circles) {
  if (!username) return;
  const clean = username.trim().toLowerCase();
  try {
    localStorage.setItem(`${STORAGE_KEY_CIRCLES}_${clean}`, JSON.stringify(circles));
  } catch (e) {
    console.error('Error saving circles:', e);
  }
}

/**
 * Get circle by its unique ID
 * @param {string} circleId 
 * @returns {object|null}
 */
export function getCircleById(circleId) {
  if (!circleId) return null;
  const all = getAllCircles();
  return all.find((c) => c.id === circleId) || null;
}

/**
 * Create a new circle
 * @param {string} creatorUsername 
 * @param {string} circleName 
 * @param {number} [maxMembers=DEFAULT_MAX_CIRCLE_MEMBERS] 
 * @returns {object|null}
 */
/**
 * Create a new circle
 * Supports custom invite code, category, and capacity
 * @param {string} creatorUsername 
 * @param {string} circleName 
 * @param {number} [maxMembers=DEFAULT_MAX_CIRCLE_MEMBERS] 
 * @param {string} [customInviteCode=null]
 * @param {string} [category='General']
 * @param {string} [description='']
 * @returns {object|null}
 */
export function createCircle(
  creatorUsername,
  circleName,
  maxMembers = DEFAULT_MAX_CIRCLE_MEMBERS,
  customInviteCode = null,
  category = 'General',
  description = ''
) {
  if (!creatorUsername || !circleName?.trim()) return null;
  const clean = creatorUsername.trim().toLowerCase().replace(/^@/, '');
  const all = getAllCircles();

  let inviteCode = '';
  if (customInviteCode && typeof customInviteCode === 'string') {
    const sanitizedCode = customInviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (sanitizedCode.length >= 3 && sanitizedCode.length <= 12) {
      // Check if code is already used by another circle
      const exists = all.some(
        (c) => (c.inviteCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === sanitizedCode
      );
      if (!exists) {
        inviteCode = sanitizedCode;
      }
    }
  }

  // If no valid custom code provided or it was taken, auto-generate unique 6-char code
  if (!inviteCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
      inviteCode = '';
      for (let i = 0; i < 6; i++) {
        inviteCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (all.some((c) => (c.inviteCode || '').toUpperCase() === inviteCode));
  }

  const newCircle = {
    id: `circle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: circleName.trim(),
    adminUsername: clean,
    maxMembers: Number(maxMembers) || DEFAULT_MAX_CIRCLE_MEMBERS,
    status: 'No active match', // 'No active match' | 'Lobby open' | 'Match live'
    createdAt: new Date().toISOString(),
    inviteCode,
    category: category || 'General',
    description: (description || '').trim(),
    members: [
      {
        username: clean,
        role: 'admin',
        joinedAt: new Date().toISOString(),
      },
    ],
  };

  const updatedAll = [newCircle, ...all];
  saveAllCircles(updatedAll);
  saveUserCircles(clean, getUserCircles(clean));

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    fetch('/api/circles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCircle),
    }).catch(() => {});
  }

  return newCircle;
}

/**
 * Create a new circle and await remote server / Supabase confirmation
 */
export async function createCircleAsync(
  creatorUsername,
  circleName,
  maxMembers = DEFAULT_MAX_CIRCLE_MEMBERS,
  customInviteCode = null,
  category = 'General',
  description = ''
) {
  const newCircle = createCircle(creatorUsername, circleName, maxMembers, customInviteCode, category, description);
  if (!newCircle) return null;

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    try {
      const res = await fetch('/api/circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCircle),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.circle) {
          const all = getAllCircles();
          const idx = all.findIndex((c) => c.id === data.circle.id);
          if (idx !== -1) all[idx] = data.circle;
          else all.unshift(data.circle);
          saveAllCircles(all);
          saveUserCircles(creatorUsername, getUserCircles(creatorUsername));
          return data.circle;
        }
      }
    } catch (e) {
      console.warn('Could not sync created circle immediately:', e);
    }
  }
  return newCircle;
}

/**
 * Rename a circle (Admin only)
 * @param {string} adminUsername 
 * @param {string} circleId 
 * @param {string} newName 
 */
export function updateCircleName(adminUsername, circleId, newName) {
  if (!adminUsername || !circleId || !newName?.trim()) {
    return { success: false, error: 'Circle name cannot be empty.' };
  }
  const cleanAdmin = adminUsername.trim().toLowerCase();
  const all = getAllCircles();
  const circleIndex = all.findIndex((c) => c.id === circleId);
  if (circleIndex === -1) return { success: false, error: 'Circle not found.' };

  const circle = all[circleIndex];
  if ((circle.adminUsername || '').toLowerCase() !== cleanAdmin) {
    return { success: false, error: 'Only the circle admin can rename this circle.' };
  }

  circle.name = newName.trim();
  all[circleIndex] = circle;
  saveAllCircles(all);
  return { success: true, circle };
}

/**
 * Join a circle using its 6-character invite code
 * @param {string} username 
 * @param {string} inviteCode 
 * @returns {{ success: boolean, circle?: object, error?: string }}
 */
export function joinCircleByCode(username, inviteCode) {
  if (!username || !inviteCode) {
    return { success: false, error: 'Username and invite code are required.' };
  }
  const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
  const cleanCode = inviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  const all = getAllCircles();
  const circleIndex = all.findIndex(
    (c) => (c.inviteCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanCode
  );

  if (circleIndex === -1) {
    return { success: false, error: 'Circle not found. Please verify the 6-character invite code.' };
  }

  const circle = all[circleIndex];
  const members = circle.members || [];

  // Check if already a member
  if (members.some((m) => (m.username || '').toLowerCase().replace(/^@/, '') === cleanUser)) {
    return { success: false, error: 'You are already a member of this circle.', circle };
  }

  // Capacity check
  const max = circle.maxMembers || DEFAULT_MAX_CIRCLE_MEMBERS;
  if (members.length >= max) {
    return { success: false, error: `This circle is full (max ${max} members reached).` };
  }

  const updatedMembers = [
    ...members,
    {
      username: cleanUser,
      role: 'member',
      joinedAt: new Date().toISOString(),
    },
  ];

  const updatedCircle = {
    ...circle,
    members: updatedMembers,
  };

  all[circleIndex] = updatedCircle;
  saveAllCircles(all);
  saveUserCircles(cleanUser, getUserCircles(cleanUser));

  // Clear any pending invite for this user and circle
  const userInvites = getPendingCircleInvites(cleanUser);
  const remainingInvites = userInvites.filter((inv) => inv.circleId !== circle.id);
  savePendingCircleInvites(cleanUser, remainingInvites);

  // Notify backend server asynchronously if online
  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    fetch('/api/circles/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUser, inviteCode: cleanCode }),
    }).catch(() => {});
  }

  return { success: true, circle: updatedCircle };
}

/**
 * Join circle asynchronously checking local cache and backend server
 */
export async function joinCircleByCodeAsync(username, inviteCode) {
  if (!username || !inviteCode) {
    return { success: false, error: 'Username and invite code are required.' };
  }
  const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
  const cleanCode = inviteCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  const localRes = joinCircleByCode(cleanUser, cleanCode);
  if (localRes.success) return localRes;

  // If user is already a member locally, return the circle so caller navigates directly to it
  if (localRes.circle) {
    return { success: true, circle: localRes.circle, message: localRes.error || 'Already a member' };
  }

  // If not found locally, query remote server
  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    try {
      const res = await fetch('/api/circles/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, inviteCode: cleanCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.circle) {
        const all = getAllCircles();
        const idx = all.findIndex((c) => c.id === data.circle.id);
        if (idx !== -1) all[idx] = data.circle;
        else all.unshift(data.circle);
        saveAllCircles(all);
        saveUserCircles(cleanUser, getUserCircles(cleanUser));

        const userInvites = getPendingCircleInvites(cleanUser);
        const remainingInvites = userInvites.filter((inv) => inv.circleId !== data.circle.id);
        savePendingCircleInvites(cleanUser, remainingInvites);

        return { success: true, circle: data.circle, message: data.message };
      } else if (data.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // Fall through to local error
    }
  }

  return localRes;
}

/**
 * Sync all circles and invites from backend server
 */
export async function syncCirclesAndInvitesAsync(username) {
  if (typeof window === 'undefined' || !window.navigator?.onLine) return;
  try {
    const deletedIds = new Set(getDeletedCircleIds());
    let local = getAllCircles().filter((c) => c && c.id && !deletedIds.has(c.id));
    saveAllCircles(local);
    let synced = false;

    // 1. Two-way sync: push local circles to server and pull latest server circles
    try {
      const syncRes = await fetch('/api/circles/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circles: local,
          deletedCircleIds: Array.from(deletedIds),
        }),
      });
      if (syncRes.ok) {
        const data = await syncRes.json();
        if (Array.isArray(data.deletedCircleIds)) {
          data.deletedCircleIds.forEach((id) => deletedIds.add(id));
          saveDeletedCircleIds(Array.from(deletedIds));
        }
        if (Array.isArray(data.circles)) {
          const cleanServerCircles = data.circles.filter((c) => c && c.id && !deletedIds.has(c.id));
          saveAllCircles(cleanServerCircles);
          synced = true;
        }
      }
    } catch {
      // Fall through to standard GET
    }

    // 2. Fallback to GET /api/circles if sync endpoint didn't succeed
    if (!synced) {
      const circlesRes = await fetch('/api/circles');
      if (circlesRes.ok) {
        const data = await circlesRes.json();
        if (Array.isArray(data.deletedCircleIds)) {
          data.deletedCircleIds.forEach((id) => deletedIds.add(id));
          saveDeletedCircleIds(Array.from(deletedIds));
        }
        if (Array.isArray(data.circles)) {
          const cleanServerCircles = data.circles.filter((c) => c && c.id && !deletedIds.has(c.id));
          saveAllCircles(cleanServerCircles);
        }
      }
    }

    if (username) {
      const clean = username.trim().toLowerCase().replace(/^@/, '');
      saveUserCircles(clean, getUserCircles(clean));
      const invitesRes = await fetch(`/api/invites/${clean}`);
      if (invitesRes.ok) {
        const data = await invitesRes.json();
        if (Array.isArray(data.invites)) {
          const localInvites = getPendingCircleInvites(clean);
          const map = new Map();
          for (const inv of localInvites) {
            if (inv && inv.circleId && !deletedIds.has(inv.circleId)) {
              map.set(inv.id, inv);
            }
          }
          for (const inv of data.invites) {
            if (inv && inv.circleId && !deletedIds.has(inv.circleId)) {
              map.set(inv.id, inv);
            }
          }
          savePendingCircleInvites(clean, Array.from(map.values()));
        }
      }
    }
  } catch {
    // Network sync fallback
  }
}

/**
 * Remove a member from a circle (Admin only)
 * @param {string} adminUsername 
 * @param {string} circleId 
 * @param {string} targetUsername 
 */
export function removeMemberFromCircle(adminUsername, circleId, targetUsername) {
  if (!adminUsername || !circleId || !targetUsername) {
    return { success: false, error: 'Missing required parameters.' };
  }
  const cleanAdmin = adminUsername.trim().toLowerCase().replace(/^@/, '');
  const cleanTarget = targetUsername.trim().toLowerCase().replace(/^@/, '');

  const all = getAllCircles();
  const circleIndex = all.findIndex((c) => c.id === circleId);
  if (circleIndex === -1) {
    return { success: false, error: 'Circle not found.' };
  }

  const circle = all[circleIndex];
  if ((circle.adminUsername || '').toLowerCase().replace(/^@/, '') !== cleanAdmin) {
    return { success: false, error: 'Only the circle admin can remove members.' };
  }

  if (cleanTarget === cleanAdmin) {
    return { success: false, error: 'Circle admin cannot be removed. You can delete the circle instead.' };
  }

  const updatedMembers = (circle.members || []).filter(
    (m) => (m.username || '').toLowerCase().replace(/^@/, '') !== cleanTarget
  );

  const updatedCircle = {
    ...circle,
    members: updatedMembers,
  };

  all[circleIndex] = updatedCircle;
  saveAllCircles(all);
  saveUserCircles(cleanTarget, getUserCircles(cleanTarget));

  return { success: true, circle: updatedCircle };
}

/**
 * Remove a member from a circle and sync with backend / Supabase
 */
export async function removeMemberFromCircleAsync(adminUsername, circleId, targetUsername) {
  const localRes = removeMemberFromCircle(adminUsername, circleId, targetUsername);
  if (!localRes.success) return localRes;

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    try {
      const res = await fetch('/api/circles/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUsername, circleId, targetUsername }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.circle) {
          const all = getAllCircles();
          const idx = all.findIndex((c) => c.id === data.circle.id);
          if (idx !== -1) {
            all[idx] = data.circle;
            saveAllCircles(all);
          }
          const cleanTarget = targetUsername.trim().toLowerCase().replace(/^@/, '');
          saveUserCircles(cleanTarget, getUserCircles(cleanTarget));
        }
      }
    } catch (e) {
      console.warn('Could not sync member removal to server:', e);
    }
  }

  return localRes;
}

/**
 * Non-admin member leaves a circle
 * @param {string} username 
 * @param {string} circleId 
 */
export function leaveCircle(username, circleId) {
  if (!username || !circleId) return { success: false, error: 'Missing parameters.' };
  const cleanUser = username.trim().toLowerCase().replace(/^@/, '');

  const all = getAllCircles();
  const circleIndex = all.findIndex((c) => c.id === circleId);
  if (circleIndex === -1) return { success: false, error: 'Circle not found.' };

  const circle = all[circleIndex];
  if ((circle.adminUsername || '').toLowerCase().replace(/^@/, '') === cleanUser) {
    return { success: false, error: 'Admins cannot leave their own circle. You can delete the circle.' };
  }

  const updatedMembers = (circle.members || []).filter(
    (m) => (m.username || '').toLowerCase().replace(/^@/, '') !== cleanUser
  );

  const updatedCircle = { ...circle, members: updatedMembers };
  all[circleIndex] = updatedCircle;
  saveAllCircles(all);
  saveUserCircles(cleanUser, getUserCircles(cleanUser));

  return { success: true, circle: updatedCircle };
}

/**
 * Member leaves a circle and syncs with backend / Supabase
 */
export async function leaveCircleAsync(username, circleId) {
  const localRes = leaveCircle(username, circleId);
  if (!localRes.success) return localRes;

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    try {
      const res = await fetch('/api/circles/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, circleId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.circle) {
          const all = getAllCircles();
          const idx = all.findIndex((c) => c.id === data.circle.id);
          if (idx !== -1) {
            all[idx] = data.circle;
            saveAllCircles(all);
          }
          const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
          saveUserCircles(cleanUser, getUserCircles(cleanUser));
        }
      }
    } catch (e) {
      console.warn('Could not sync leave circle to server:', e);
    }
  }

  return localRes;
}

/**
 * Delete a circle (Admin only)
 * @param {string} adminUsername 
 * @param {string} circleId 
 */
export function deleteCircle(adminUsername, circleId) {
  if (!adminUsername || !circleId) return { success: false, error: 'Missing parameters.' };
  const cleanAdmin = adminUsername.trim().toLowerCase().replace(/^@/, '');

  const all = getAllCircles();
  const circle = all.find((c) => c.id === circleId);
  if (!circle) return { success: false, error: 'Circle not found.' };

  if ((circle.adminUsername || '').toLowerCase().replace(/^@/, '') !== cleanAdmin) {
    return { success: false, error: 'Only the circle admin can delete this circle.' };
  }

  // Mark as permanently deleted
  markCircleDeletedLocally(circleId);

  const updated = all.filter((c) => c.id !== circleId);
  saveAllCircles(updated);

  // Clear from all cached user circle keys
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${STORAGE_KEY_CIRCLES}_`)) {
          try {
            const userCircles = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(userCircles)) {
              const filtered = userCircles.filter((c) => c.id !== circleId);
              if (filtered.length !== userCircles.length) {
                localStorage.setItem(key, JSON.stringify(filtered));
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  // Clear pending invites referencing this circle across all users
  const allUsers = getUsers();
  allUsers.forEach((u) => {
    const invites = getPendingCircleInvites(u.username);
    const filtered = invites.filter((inv) => inv.circleId !== circleId);
    if (filtered.length !== invites.length) {
      savePendingCircleInvites(u.username, filtered);
    }
  });

  return { success: true };
}

/**
 * Delete a circle and sync deletion with backend / Supabase
 */
export async function deleteCircleAsync(adminUsername, circleId) {
  const localRes = deleteCircle(adminUsername, circleId);
  if (!localRes.success) return localRes;

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    try {
      const res = await fetch('/api/circles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUsername, circleId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.deletedCircleIds)) {
          const current = new Set(getDeletedCircleIds());
          data.deletedCircleIds.forEach((id) => current.add(id));
          saveDeletedCircleIds(Array.from(current));
        }
      }
    } catch (e) {
      console.warn('Could not sync circle deletion to server:', e);
    }
  }

  return { success: true };
}

/**
 * Get pending circle invites for user
 */
export function getPendingCircleInvites(username) {
  if (!username) return [];
  const clean = username.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_INVITES}_${clean}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Error reading pending invites:', e);
  }
  return [];
}

/**
 * Save pending invites
 */
export function savePendingCircleInvites(username, invites) {
  if (!username) return;
  const clean = username.trim().toLowerCase();
  try {
    localStorage.setItem(`${STORAGE_KEY_INVITES}_${clean}`, JSON.stringify(invites));
  } catch (e) {
    console.error('Error saving pending invites:', e);
  }
}

/**
 * Send an invitation to a user for a circle
 */
export function sendCircleInvite(inviterUsername, targetUsername, circleId, circleName) {
  if (!inviterUsername || !targetUsername || !circleId) return { success: false, error: 'Invalid parameters' };
  let targetClean = targetUsername.trim().toLowerCase();

  // If target looks like email, resolve against registered users
  if (targetClean.includes('@')) {
    const allUsers = getUsers();
    const found = allUsers.find((u) => (u.email || '').toLowerCase() === targetClean);
    if (found && found.username) {
      targetClean = found.username.toLowerCase();
    }
  }

  const privacy = getUserPrivacySettings(targetClean);

  if (privacy.allowStrangerInvites === false) {
    return {
      success: false,
      error: `@${targetUsername} has opted out of receiving invitations from non-friends.`,
    };
  }

  const circle = getCircleById(circleId);
  if (circle) {
    // Check if target is already a member
    if (circle.members?.some((m) => (m.username || '').toLowerCase() === targetClean)) {
      return { success: false, error: `@${targetUsername} is already a member of this circle.` };
    }
    // Check capacity
    const max = circle.maxMembers || DEFAULT_MAX_CIRCLE_MEMBERS;
    if ((circle.members?.length || 0) >= max) {
      return { success: false, error: `Circle has reached its capacity limit of ${max} members.` };
    }
  }

  const existingInvites = getPendingCircleInvites(targetClean);
  if (existingInvites.some((inv) => inv.circleId === circleId)) {
    return { success: false, error: 'An invitation is already pending for this user.' };
  }

  const cleanInviter = inviterUsername.trim();
  const cName = circleName || circle?.name || 'Friend Circle';
  const newInvite = {
    id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    circleId,
    circleName: cName,
    inviterUsername: cleanInviter.toLowerCase(),
    targetUsername: targetClean,
    notificationText: `${cleanInviter} invited you in ${cName}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  savePendingCircleInvites(targetClean, [newInvite, ...existingInvites]);

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInvite),
    }).catch(() => {});
  }

  return { success: true, invite: newInvite };
}

/**
 * Send an invitation and await server confirmation
 */
export async function sendCircleInviteAsync(inviterUsername, targetUsername, circleId, circleName) {
  const localRes = sendCircleInvite(inviterUsername, targetUsername, circleId, circleName);
  if (localRes.invite && typeof window !== 'undefined' && window.navigator?.onLine) {
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localRes.invite),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.invite) {
          return { success: true, invite: data.invite };
        }
      }
    } catch (e) {
      console.warn('Could not sync invite immediately:', e);
    }
  }
  return localRes;
}

/**
 * Invite by email: checks if account exists, or creates direct invite link payload
 * @param {string} inviterUsername 
 * @param {string} circleId 
 * @param {string} email 
 */
export function inviteByEmail(inviterUsername, circleId, email) {
  if (!inviterUsername || !circleId || !email?.trim()) {
    return { success: false, error: 'Valid email address is required.' };
  }
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const circle = getCircleById(circleId);
  if (!circle) return { success: false, error: 'Circle not found.' };

  const allUsers = getUsers();
  const foundUser = allUsers.find((u) => (u.email || '').toLowerCase() === cleanEmail);

  if (foundUser) {
    return sendCircleInvite(inviterUsername, foundUser.username, circleId, circle.name);
  }

  // User is not yet registered; provide shareable invite code link
  return {
    success: true,
    isExternal: true,
    inviteCode: circle.inviteCode,
    message: `Invite prepared for ${cleanEmail}. They can join using code ${circle.inviteCode}.`,
  };
}

/**
 * Get all pending outgoing invites for a specific circle
 * @param {string} circleId 
 */
export function getCirclePendingInvites(circleId) {
  if (!circleId) return [];
  const allUsers = getUsers();
  const results = [];
  const seenIds = new Set();

  allUsers.forEach((u) => {
    const invites = getPendingCircleInvites(u.username);
    invites.forEach((inv) => {
      if (inv.circleId === circleId && !seenIds.has(inv.id)) {
        seenIds.add(inv.id);
        results.push(inv);
      }
    });
  });

  return results;
}

/**
 * Revoke/cancel a pending invite for a circle (Admin only)
 * @param {string} adminUsername 
 * @param {string} circleId 
 * @param {string} inviteId 
 */
export function revokeCircleInvite(adminUsername, circleId, inviteId) {
  if (!adminUsername || !circleId || !inviteId) {
    return { success: false, error: 'Missing parameters.' };
  }
  const circle = getCircleById(circleId);
  if (!circle) return { success: false, error: 'Circle not found.' };

  if ((circle.adminUsername || '').toLowerCase() !== adminUsername.trim().toLowerCase()) {
    return { success: false, error: 'Only the circle admin can revoke invitations.' };
  }

  const allUsers = getUsers();
  let found = false;

  allUsers.forEach((u) => {
    const invites = getPendingCircleInvites(u.username);
    const remaining = invites.filter((inv) => inv.id !== inviteId);
    if (remaining.length !== invites.length) {
      savePendingCircleInvites(u.username, remaining);
      found = true;
    }
  });

  return { success: found };
}

/**
 * Accept or decline a circle invite
 */
export function respondCircleInvite(username, inviteId, accept = true) {
  const cleanUser = username.trim().toLowerCase();
  const invites = getPendingCircleInvites(cleanUser);
  const targetInvite = invites.find((i) => i.id === inviteId);
  if (!targetInvite) return false;

  const remaining = invites.filter((i) => i.id !== inviteId);
  savePendingCircleInvites(cleanUser, remaining);

  if (accept) {
    const all = getAllCircles();
    const circleIndex = all.findIndex((c) => c.id === targetInvite.circleId);
    if (circleIndex !== -1) {
      const circle = all[circleIndex];
      const members = circle.members || [];
      if (!members.some((m) => (m.username || '').toLowerCase() === cleanUser)) {
        circle.members = [
          ...members,
          {
            username: cleanUser,
            role: 'member',
            joinedAt: new Date().toISOString(),
          },
        ];
        all[circleIndex] = circle;
        saveAllCircles(all);
      }
    } else {
      // Legacy fallback
      const userCircles = getUserCircles(cleanUser);
      const joined = {
        id: targetInvite.circleId,
        name: targetInvite.circleName,
        adminUsername: targetInvite.inviterUsername,
        maxMembers: DEFAULT_MAX_CIRCLE_MEMBERS,
        status: 'No active match',
        joinedAt: new Date().toISOString(),
        members: [
          { username: targetInvite.inviterUsername, role: 'admin' },
          { username: cleanUser, role: 'member', joinedAt: new Date().toISOString() },
        ],
      };
      saveUserCircles(cleanUser, [joined, ...userCircles]);
    }
  }

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    fetch('/api/invites/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUser, inviteId, accept }),
    }).catch(() => {});
  }

  return true;
}

/**
 * Respond to circle invite and await server confirmation
 */
export async function respondCircleInviteAsync(username, inviteId, accept = true) {
  const cleanUser = username.trim().toLowerCase();
  const invites = getPendingCircleInvites(cleanUser);
  const targetInvite = invites.find((i) => i.id === inviteId);
  const targetCircleId = targetInvite?.circleId;

  const localOk = respondCircleInvite(username, inviteId, accept);
  let circle = targetCircleId ? getCircleById(targetCircleId) : null;

  if (typeof window !== 'undefined' && window.navigator?.onLine) {
    try {
      const res = await fetch('/api/invites/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, inviteId, accept }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.circle) {
          circle = data.circle;
          const all = getAllCircles();
          const idx = all.findIndex((c) => c.id === circle.id);
          if (idx !== -1) all[idx] = circle;
          else all.unshift(circle);
          saveAllCircles(all);
          saveUserCircles(cleanUser, getUserCircles(cleanUser));
        }
      }
    } catch {
      // Fallback to local
    }
  }

  return { success: localOk, circle };
}

/**
 * Get recent team matches history
 */
export function getCircleMatchHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MATCH_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Error reading match history:', e);
  }
  return [];
}

/**
 * Check if the user has any pending invites or live matches
 * @param {string} username 
 * @returns {boolean}
 */
export function hasGroupChallengeNotification(username) {
  if (!username) return false;
  const clean = username.trim().toLowerCase();
  const invites = getPendingCircleInvites(clean);
  if (invites.length > 0) return true;
  const circles = getUserCircles(clean);
  return circles.some((c) => c.status === 'Match live');
}

/* ==========================================================================
   STAGE 3 & 4: TEAM FORMATION, CAPTAINS & CHALLENGE CONFIGURATION
   ========================================================================== */

const STORAGE_KEY_CHALLENGES = 'codelife_group_challenges';

export const TEAM_SIZE_MODES = {
  BALANCED: 'balanced',
  FLEXIBLE: 'flexible',
};

export const FORMATION_MODES = {
  RANDOM: 'random',
  MANUAL: 'manual',
  CAPTAINS_PICK: 'captains_pick',
};

export const CHALLENGE_MODES = {
  SHARED_POOL: 'shared_pool',
  ASSIGNED: 'assigned',
};

export const PROBLEM_SOURCES = {
  AUTO: 'auto',
  MANUAL: 'manual',
};

export const TIME_LIMIT_PRESETS = [15, 30, 45, 60, 90, 120];
export const DEFAULT_TIME_LIMIT_MINUTES = 30;

export const DEFAULT_SCORING_CONFIG = {
  pointsPerDifficulty: {
    Easy: 100,
    Medium: 200,
    Hard: 300,
  },
  timeBonusMaxPoints: 50,
  wrongSubmissionPenalty: 10,
  enableTimeBonus: true,
  enableWrongPenalty: true,
  normalizeBySize: false,
};

/**
 * Single Configurable Scoring Formula
 * Computes the score for an accepted problem solution:
 * Base Points (Easy 100, Med 200, Hard 300) + Time Bonus - Wrong Penalty
 * Enforces a positive floor (at least 10% base or 10 pts) so accepted solve is never <= 0.
 *
 * @param {object} params
 * @param {string} [params.difficulty='Easy']
 * @param {number} [params.timeRemainingSeconds=0]
 * @param {number} [params.totalTimeSeconds=1800]
 * @param {number} [params.wrongSubmissionsCount=0]
 * @param {object} [params.scoringConfig=DEFAULT_SCORING_CONFIG]
 * @returns {number}
 */
export function calculateProblemScore({
  difficulty = 'Easy',
  timeRemainingSeconds = 0,
  totalTimeSeconds = 1800,
  wrongSubmissionsCount = 0,
  scoringConfig = DEFAULT_SCORING_CONFIG,
} = {}) {
  const pointsMap = scoringConfig?.pointsPerDifficulty || DEFAULT_SCORING_CONFIG.pointsPerDifficulty;
  const basePoints = pointsMap[difficulty] ?? pointsMap.Easy ?? 100;

  let timeBonus = 0;
  if (scoringConfig?.enableTimeBonus && totalTimeSeconds > 0 && timeRemainingSeconds > 0) {
    const fraction = Math.min(1, Math.max(0, timeRemainingSeconds / totalTimeSeconds));
    const maxBonus = scoringConfig.timeBonusMaxPoints ?? 50;
    timeBonus = Math.round(fraction * maxBonus);
  }

  let penalty = 0;
  if (scoringConfig?.enableWrongPenalty && wrongSubmissionsCount > 0) {
    const penaltyPerWrong = scoringConfig.wrongSubmissionPenalty ?? 10;
    penalty = wrongSubmissionsCount * penaltyPerWrong;
  }

  const rawScore = basePoints + timeBonus - penalty;
  const minScore = Math.max(10, Math.round(basePoints * 0.1));
  return Math.max(minScore, rawScore);
}

/**
 * Fairness score normalization for unequal teams.
 * When normalizeBySize is true, score is normalized by player count (average per player).
 *
 * @param {number} teamRawScore
 * @param {number} teamSize
 * @param {number} otherTeamSize
 * @param {boolean} normalizeBySize
 * @returns {number}
 */
export function calculateTeamFinalScore(teamRawScore = 0, teamSize = 1, otherTeamSize = 1, normalizeBySize = false) {
  const safeSize = Math.max(1, teamSize);
  if (normalizeBySize) {
    const avg = teamRawScore / safeSize;
    return Number(avg.toFixed(1));
  }
  return teamRawScore;
}

/**
 * Derive default challenge problem count from participant team sizes: max(3, team size)
 * @param {number} teamA_size 
 * @param {number} teamB_size 
 * @returns {number}
 */
export function deriveDefaultProblemCount(teamA_size = 2, teamB_size = 2) {
  const maxTeam = Math.max(teamA_size || 2, teamB_size || 2);
  return Math.max(3, maxTeam);
}

/**
 * Gather solved problem IDs and titles for participant usernames
 * @param {string[]} participants 
 * @returns {Set<string>}
 */
export function getParticipantsSolvedProblems(participants = []) {
  const solvedSet = new Set();
  if (!Array.isArray(participants)) return solvedSet;

  participants.forEach((uname) => {
    try {
      const streak = getUserStreakData(uname);
      if (streak && Array.isArray(streak.solvedChallengeIds)) {
        streak.solvedChallengeIds.forEach((idOrTitle) => {
          if (idOrTitle !== undefined && idOrTitle !== null) {
            solvedSet.add(String(idOrTitle).toLowerCase().trim());
          }
        });
      }
    } catch {
      // ignore
    }
  });

  return solvedSet;
}

/**
 * Retrieve candidate problems from curated catalog and optionally admin's code store,
 * with optional exclusion of problems solved by any match participant.
 *
 * @param {object} options
 * @param {string[]} [options.participants=[]]
 * @param {boolean} [options.excludeSolved=true]
 * @param {string} [options.adminUsername='']
 * @returns {Array}
 */
export function getAvailableChallengeProblems({
  participants = [],
  excludeSolved = true,
  adminUsername = '',
} = {}) {
  let catalog = [...CURATED_PROBLEMS];

  if (adminUsername) {
    try {
      const custom = getCodeStoreProblems(adminUsername);
      if (Array.isArray(custom) && custom.length > 0) {
        custom.forEach((cp) => {
          if (!catalog.some((p) => p.id === cp.id || p.title.toLowerCase() === (cp.title || '').toLowerCase())) {
            catalog.push(cp);
          }
        });
      }
    } catch {
      // ignore
    }
  }

  if (!excludeSolved || !Array.isArray(participants) || participants.length === 0) {
    return catalog;
  }

  const solvedSet = getParticipantsSolvedProblems(participants);
  return catalog.filter((p) => {
    const idStr = String(p.id).toLowerCase();
    const titleStr = String(p.title || '').toLowerCase().trim();
    return !solvedSet.has(idStr) && !solvedSet.has(titleStr);
  });
}

/**
 * Auto-select problems randomly by difficulty distribution, excluding problems solved by any participant.
 *
 * @param {object} params
 * @param {number} [params.count=3]
 * @param {object} [params.difficultyMix={ Easy: 1, Medium: 1, Hard: 1 }]
 * @param {string[]} [params.participants=[]]
 * @param {boolean} [params.excludeSolved=true]
 * @param {string} [params.adminUsername='']
 * @returns {Array}
 */
export function autoSelectChallengeProblems({
  count = 3,
  difficultyMix = { Easy: 1, Medium: 1, Hard: 1 },
  participants = [],
  excludeSolved = true,
  adminUsername = '',
} = {}) {
  let pool = getAvailableChallengeProblems({ participants, excludeSolved, adminUsername });

  // If pool has fewer problems than requested count and excludeSolved was active, fallback to full catalog
  if (pool.length < count && excludeSolved) {
    pool = getAvailableChallengeProblems({ participants, excludeSolved: false, adminUsername });
  }

  const byDifficulty = {
    Easy: pool.filter((p) => (p.difficulty || 'Easy').toLowerCase() === 'easy'),
    Medium: pool.filter((p) => (p.difficulty || '').toLowerCase() === 'medium'),
    Hard: pool.filter((p) => (p.difficulty || '').toLowerCase() === 'hard'),
  };

  const selected = [];
  const selectedIds = new Set();
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

  // 1. Fulfill requested difficulty mix
  ['Easy', 'Medium', 'Hard'].forEach((diff) => {
    const requested = difficultyMix?.[diff] ?? 0;
    const candidates = shuffle(byDifficulty[diff] || []);
    let added = 0;
    for (const p of candidates) {
      if (added >= requested || selected.length >= count) break;
      if (!selectedIds.has(p.id)) {
        selected.push(p);
        selectedIds.add(p.id);
        added++;
      }
    }
  });

  // 2. If count not yet met, fill with random remaining problems
  if (selected.length < count) {
    const remaining = shuffle(pool.filter((p) => !selectedIds.has(p.id)));
    for (const p of remaining) {
      if (selected.length >= count) break;
      selected.push(p);
      selectedIds.add(p.id);
    }
  }

  return selected;
}

/**
 * Distribute challenge problems across team members (Assigned mode round-robin)
 * @param {Array} problems 
 * @param {string[]} teamMembers 
 * @returns {Record<string, Array>}
 */
export function distributeProblemsRoundRobin(problems = [], teamMembers = []) {
  const distribution = {};
  teamMembers.forEach((m) => {
    distribution[m] = [];
  });
  if (teamMembers.length === 0 || problems.length === 0) return distribution;

  problems.forEach((prob, index) => {
    const assignee = teamMembers[index % teamMembers.length];
    distribution[assignee].push(prob);
  });
  return distribution;
}

/**
 * Validate challenge configuration
 * @param {object} config 
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateChallengeConfig(config) {
  const errors = [];
  if (!config) return { isValid: false, errors: ['Configuration is missing.'] };

  if (!config.problemCount || typeof config.problemCount !== 'number' || config.problemCount < 1) {
    errors.push('At least 1 problem must be configured for the challenge.');
  }

  if (Array.isArray(config.problems) && config.problems.length < 1) {
    errors.push('At least 1 problem must be selected.');
  }

  const timeLimit = config.timeLimitMinutes;
  if (!timeLimit || typeof timeLimit !== 'number' || timeLimit < 5 || timeLimit > 300) {
    errors.push('Time limit must be between 5 and 300 minutes.');
  }

  if (config.mode && ![CHALLENGE_MODES.SHARED_POOL, CHALLENGE_MODES.ASSIGNED].includes(config.mode)) {
    errors.push(`Invalid challenge mode: ${config.mode}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get all challenges from storage
 */
export function getAllChallenges() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CHALLENGES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading challenges:', e);
  }
  return [];
}

/**
 * Save challenges
 */
export function saveAllChallenges(challenges) {
  try {
    localStorage.setItem(STORAGE_KEY_CHALLENGES, JSON.stringify(challenges));
  } catch (e) {
    console.error('Error saving challenges:', e);
  }
}

/**
 * Get a specific challenge by ID
 */
export function getChallengeById(challengeId) {
  if (!challengeId) return null;
  const all = getAllChallenges();
  return all.find((ch) => ch.id === challengeId) || null;
}

/**
 * Get active non-completed challenge for a circle
 */
export function getActiveChallengeForCircle(circleId) {
  if (!circleId) return null;
  const all = getAllChallenges();
  return all.find(
    (ch) => ch.circleId === circleId && ch.status !== 'completed' && ch.status !== 'cancelled'
  ) || null;
}

/**
 * Validate team formation rules
 * - Each team has at least MIN_TEAM_SIZE (2) players
 * - Each team has exactly one captain who is a member of that team
 * - If balanced mode: Team A and Team B have equal size
 * - No player is in both teams
 * 
 * @param {object} teams { teamA: { members, captainUsername }, teamB: { members, captainUsername } }
 * @param {string} [teamSizeMode='balanced']
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateTeamFormation(teams, teamSizeMode = 'balanced') {
  const errors = [];
  if (!teams || !teams.teamA || !teams.teamB) {
    return { isValid: false, errors: ['Both Team A and Team B must be configured.'] };
  }

  const { teamA, teamB } = teams;
  const membersA = Array.isArray(teamA.members) ? teamA.members : [];
  const membersB = Array.isArray(teamB.members) ? teamB.members : [];

  // Rule 1: Minimum team size
  if (membersA.length < MIN_TEAM_SIZE) {
    errors.push(`Team A has only ${membersA.length} player(s). Minimum is ${MIN_TEAM_SIZE}.`);
  }
  if (membersB.length < MIN_TEAM_SIZE) {
    errors.push(`Team B has only ${membersB.length} player(s). Minimum is ${MIN_TEAM_SIZE}.`);
  }

  // Rule 2: Balanced size check
  if (teamSizeMode === 'balanced' && membersA.length !== membersB.length) {
    errors.push(`Balanced mode requires equal team sizes. Team A has ${membersA.length}, Team B has ${membersB.length}.`);
  }

  // Rule 3: Exactly one captain per team, and captain must be in the team
  if (!teamA.captainUsername || !teamA.captainUsername.trim()) {
    errors.push('Team A must have a designated captain.');
  } else if (!membersA.some((m) => (m || '').toLowerCase() === teamA.captainUsername.trim().toLowerCase())) {
    errors.push(`Team A captain (@${teamA.captainUsername}) must be a member of Team A.`);
  }

  if (!teamB.captainUsername || !teamB.captainUsername.trim()) {
    errors.push('Team B must have a designated captain.');
  } else if (!membersB.some((m) => (m || '').toLowerCase() === teamB.captainUsername.trim().toLowerCase())) {
    errors.push(`Team B captain (@${teamB.captainUsername}) must be a member of Team B.`);
  }

  // Rule 4: No duplicate assignments across teams
  const setA = new Set(membersA.map((m) => (m || '').toLowerCase()));
  for (const m of membersB) {
    if (setA.has((m || '').toLowerCase())) {
      errors.push(`Player @${m} cannot be assigned to both teams.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Auto-promote a replacement captain if current captain leaves or is invalid
 */
export function autoPromoteCaptain(team) {
  if (!team || !Array.isArray(team.members) || team.members.length === 0) {
    return { ...team, captainUsername: null };
  }
  const cleanCaptain = (team.captainUsername || '').trim().toLowerCase();
  const hasCaptain = team.members.some((m) => (m || '').toLowerCase() === cleanCaptain);
  if (!hasCaptain) {
    return {
      ...team,
      captainUsername: team.members[0],
    };
  }
  return team;
}

/**
 * Randomly split participants into Team A and Team B
 * @param {string[]} participants 
 * @param {string} [teamSizeMode='balanced'] 
 * @param {string|null} [captainA=null] 
 * @param {string|null} [captainB=null] 
 */
export function randomSplitTeams(participants = [], teamSizeMode = 'balanced', captainA = null, captainB = null) {
  const pool = [...participants];
  // Shuffle array using Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const cleanCapA = captainA ? captainA.trim().toLowerCase() : null;
  const cleanCapB = captainB ? captainB.trim().toLowerCase() : null;

  const teamAMembers = [];
  const teamBMembers = [];

  if (cleanCapA && pool.some((p) => p.toLowerCase() === cleanCapA)) {
    teamAMembers.push(pool.find((p) => p.toLowerCase() === cleanCapA));
  }
  if (cleanCapB && pool.some((p) => p.toLowerCase() === cleanCapB)) {
    teamBMembers.push(pool.find((p) => p.toLowerCase() === cleanCapB));
  }

  const remaining = pool.filter(
    (p) => p.toLowerCase() !== cleanCapA && p.toLowerCase() !== cleanCapB
  );

  const targetSizeA = teamSizeMode === 'balanced'
    ? Math.floor(pool.length / 2)
    : Math.floor(pool.length / 2);

  while (remaining.length > 0) {
    if (teamAMembers.length < targetSizeA) {
      teamAMembers.push(remaining.shift());
    } else {
      teamBMembers.push(remaining.shift());
    }
  }

  const finalCapA = cleanCapA || teamAMembers[0];
  const finalCapB = cleanCapB || teamBMembers[0];

  return {
    teamA: {
      id: 'team_a',
      name: 'Team Alpha',
      captainUsername: finalCapA,
      members: teamAMembers,
      strategyNote: '',
      isReady: false,
      submitAuthority: 'all',
    },
    teamB: {
      id: 'team_b',
      name: 'Team Beta',
      captainUsername: finalCapB,
      members: teamBMembers,
      strategyNote: '',
      isReady: false,
      submitAuthority: 'all',
    },
  };
}

/**
 * Create a new team challenge draft & configure lobby
 * @param {string} circleId 
 * @param {string} adminUsername 
 * @param {string[]} participants 
 * @param {object} [formationConfig={}] 
 */
export function createChallengeDraft(circleId, adminUsername, participants, formationConfig = {}) {
  if (!circleId || !adminUsername || !Array.isArray(participants)) {
    return { success: false, error: 'Invalid challenge draft parameters.' };
  }
  const cleanAdmin = adminUsername.trim().toLowerCase();
  const circle = getCircleById(circleId);
  if (!circle) return { success: false, error: 'Circle not found.' };

  if ((circle.adminUsername || '').toLowerCase() !== cleanAdmin) {
    return { success: false, error: 'Only the circle admin can start a challenge.' };
  }

  if (participants.length < MIN_PLAYERS_PER_CIRCLE) {
    return {
      success: false,
      error: `At least ${MIN_PLAYERS_PER_CIRCLE} participants are required (2 teams × 2 players). Selected: ${participants.length}.`,
    };
  }

  const teamSizeMode = formationConfig.teamSizeMode || 'balanced';
  const formationMode = formationConfig.formationMode || 'random';
  const teams = formationConfig.teams || randomSplitTeams(participants, teamSizeMode);

  const validation = validateTeamFormation(teams, teamSizeMode);
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.errors.join(' '),
      errors: validation.errors,
    };
  }

  const teamA_size = teams.teamA?.members?.length || 0;
  const teamB_size = teams.teamB?.members?.length || 0;
  const isUnequal = teamA_size !== teamB_size;
  const defaultProblemCount = deriveDefaultProblemCount(teamA_size, teamB_size);

  const problemSource = formationConfig.problemSource || PROBLEM_SOURCES.AUTO;
  const problemCount = formationConfig.problemCount || defaultProblemCount;
  const difficultyMix = formationConfig.difficultyMix || {
    Easy: Math.max(1, Math.floor(problemCount / 2)),
    Medium: Math.max(1, Math.floor(problemCount / 3)),
    Hard: Math.max(0, problemCount - Math.max(1, Math.floor(problemCount / 2)) - Math.max(1, Math.floor(problemCount / 3))),
  };
  const excludeSolved = formationConfig.excludeSolved !== undefined ? Boolean(formationConfig.excludeSolved) : true;
  const timeLimitMinutes = formationConfig.timeLimitMinutes || DEFAULT_TIME_LIMIT_MINUTES;
  const mode = formationConfig.mode || CHALLENGE_MODES.SHARED_POOL;

  // Resolve scoring config
  const scoringConfig = {
    ...DEFAULT_SCORING_CONFIG,
    ...(formationConfig.scoringConfig || {}),
    // Fairness normalization: default to true whenever team sizes differ!
    normalizeBySize: formationConfig.scoringConfig?.normalizeBySize !== undefined
      ? Boolean(formationConfig.scoringConfig.normalizeBySize)
      : isUnequal,
  };

  // Resolve problems
  let problems = [];
  if (Array.isArray(formationConfig.problems) && formationConfig.problems.length > 0) {
    problems = formationConfig.problems;
  } else {
    problems = autoSelectChallengeProblems({
      count: problemCount,
      difficultyMix,
      participants,
      excludeSolved,
      adminUsername: cleanAdmin,
    });
  }

  // Resolve assignments if Assigned mode
  let assignments = null;
  if (mode === CHALLENGE_MODES.ASSIGNED) {
    assignments = {
      teamA: distributeProblemsRoundRobin(problems, teams.teamA.members),
      teamB: distributeProblemsRoundRobin(problems, teams.teamB.members),
    };
  }

  const newChallenge = {
    id: `chal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    circleId,
    circleName: circle.name,
    adminUsername: cleanAdmin,
    status: 'lobby', // 'forming' | 'lobby' | 'in_progress' | 'completed' | 'cancelled'
    teamSizeMode,
    formationMode,
    teams: {
      teamA: autoPromoteCaptain(teams.teamA),
      teamB: autoPromoteCaptain(teams.teamB),
    },
    config: {
      problemSource,
      problemCount: problems.length || problemCount,
      difficultyMix,
      excludeSolved,
      timeLimitMinutes,
      mode,
      scoringConfig,
      fairnessNormalization: scoringConfig.normalizeBySize,
    },
    problems,
    assignments,
    createdAt: new Date().toISOString(),
  };

  const allChallenges = getAllChallenges();
  saveAllChallenges([newChallenge, ...allChallenges]);

  // Update circle status to 'Lobby open'
  const allCircles = getAllCircles();
  const circleIndex = allCircles.findIndex((c) => c.id === circleId);
  if (circleIndex !== -1) {
    allCircles[circleIndex].status = 'Lobby open';
    saveAllCircles(allCircles);
  }

  return { success: true, challenge: newChallenge };
}

/**
 * Update challenge configuration (Admin only)
 * @param {string} challengeId 
 * @param {string} requesterUsername 
 * @param {object} updates 
 */
export function updateChallengeConfig(challengeId, requesterUsername, updates = {}) {
  if (!challengeId || !requesterUsername) {
    return { success: false, error: 'Missing parameters.' };
  }
  const cleanRequester = requesterUsername.trim().toLowerCase();
  const allChallenges = getAllChallenges();
  const challengeIndex = allChallenges.findIndex((ch) => ch.id === challengeId);
  if (challengeIndex === -1) return { success: false, error: 'Challenge not found.' };

  const challenge = allChallenges[challengeIndex];
  if ((challenge.adminUsername || '').toLowerCase() !== cleanRequester) {
    return { success: false, error: 'Only the circle admin can update challenge configuration.' };
  }

  if (updates.timeLimitMinutes) {
    challenge.config.timeLimitMinutes = Number(updates.timeLimitMinutes);
  }
  if (updates.mode) {
    challenge.config.mode = updates.mode;
    if (updates.mode === CHALLENGE_MODES.ASSIGNED && challenge.problems?.length > 0) {
      challenge.assignments = {
        teamA: distributeProblemsRoundRobin(challenge.problems, challenge.teams.teamA.members),
        teamB: distributeProblemsRoundRobin(challenge.problems, challenge.teams.teamB.members),
      };
    }
  }
  if (updates.scoringConfig) {
    challenge.config.scoringConfig = {
      ...challenge.config.scoringConfig,
      ...updates.scoringConfig,
    };
    challenge.config.fairnessNormalization = challenge.config.scoringConfig.normalizeBySize;
  }
  if (Array.isArray(updates.problems)) {
    challenge.problems = updates.problems;
    challenge.config.problemCount = updates.problems.length;
    if (challenge.config.mode === CHALLENGE_MODES.ASSIGNED) {
      challenge.assignments = {
        teamA: distributeProblemsRoundRobin(updates.problems, challenge.teams.teamA.members),
        teamB: distributeProblemsRoundRobin(updates.problems, challenge.teams.teamB.members),
      };
    }
  }

  allChallenges[challengeIndex] = challenge;
  saveAllChallenges(allChallenges);
  return { success: true, challenge };
}

/**
 * Update team attributes (Captain permissions: rename team, strategy note, submit authority, reassign captain)
 * @param {string} challengeId 
 * @param {string} teamKey ('teamA' | 'teamB')
 * @param {object} updates 
 * @param {string} requesterUsername 
 */
export function updateTeamDetails(challengeId, teamKey, updates, requesterUsername) {
  if (!challengeId || !teamKey || !requesterUsername) {
    return { success: false, error: 'Missing parameters.' };
  }
  const cleanRequester = requesterUsername.trim().toLowerCase();
  const allChallenges = getAllChallenges();
  const challengeIndex = allChallenges.findIndex((ch) => ch.id === challengeId);
  if (challengeIndex === -1) return { success: false, error: 'Challenge not found.' };

  const challenge = allChallenges[challengeIndex];
  const team = challenge.teams?.[teamKey];
  if (!team) return { success: false, error: 'Team not found.' };

  const isCaptain = (team.captainUsername || '').toLowerCase() === cleanRequester;
  const isAdmin = (challenge.adminUsername || '').toLowerCase() === cleanRequester;

  if (!isCaptain && !isAdmin) {
    return { success: false, error: 'Only the team captain or challenge admin can update team details.' };
  }

  if (updates.name && updates.name.trim()) {
    team.name = updates.name.trim();
  }
  if (updates.strategyNote !== undefined) {
    team.strategyNote = String(updates.strategyNote).trim();
  }
  if (updates.submitAuthority) {
    team.submitAuthority = updates.submitAuthority === 'captain_only' ? 'captain_only' : 'all';
  }
  if (updates.captainUsername) {
    const newCap = updates.captainUsername.trim().toLowerCase();
    if (team.members.some((m) => m.toLowerCase() === newCap)) {
      team.captainUsername = newCap;
    }
  }

  challenge.teams[teamKey] = team;
  allChallenges[challengeIndex] = challenge;
  saveAllChallenges(allChallenges);

  return { success: true, team };
}

/**
 * Set team ready state in the lobby
 * @param {string} challengeId 
 * @param {string} teamKey 
 * @param {boolean} isReady 
 * @param {string} requesterUsername 
 */
export function setTeamReady(challengeId, teamKey, isReady, requesterUsername) {
  if (!challengeId || !teamKey || !requesterUsername) {
    return { success: false, error: 'Missing parameters.' };
  }
  const cleanRequester = requesterUsername.trim().toLowerCase();
  const allChallenges = getAllChallenges();
  const challengeIndex = allChallenges.findIndex((ch) => ch.id === challengeId);
  if (challengeIndex === -1) return { success: false, error: 'Challenge not found.' };

  const challenge = allChallenges[challengeIndex];
  const team = challenge.teams?.[teamKey];
  if (!team) return { success: false, error: 'Team not found.' };

  const isCaptain = (team.captainUsername || '').toLowerCase() === cleanRequester;
  const isAdmin = (challenge.adminUsername || '').toLowerCase() === cleanRequester;

  if (!isCaptain && !isAdmin) {
    return { success: false, error: 'Only the team captain or challenge admin can set team readiness.' };
  }

  team.isReady = Boolean(isReady);
  challenge.teams[teamKey] = team;
  allChallenges[challengeIndex] = challenge;
  saveAllChallenges(allChallenges);

  return { success: true, challenge };
}

/**
 * Cancel a challenge draft and reset circle status
 * @param {string} challengeId 
 * @param {string} requesterUsername 
 */
export function cancelChallenge(challengeId, requesterUsername) {
  if (!challengeId || !requesterUsername) return { success: false, error: 'Missing parameters.' };
  const cleanRequester = requesterUsername.trim().toLowerCase();
  const allChallenges = getAllChallenges();
  const challengeIndex = allChallenges.findIndex((ch) => ch.id === challengeId);
  if (challengeIndex === -1) return { success: false, error: 'Challenge not found.' };

  const challenge = allChallenges[challengeIndex];
  if ((challenge.adminUsername || '').toLowerCase() !== cleanRequester) {
    return { success: false, error: 'Only the challenge admin can cancel this match.' };
  }

  challenge.status = 'cancelled';
  allChallenges[challengeIndex] = challenge;
  saveAllChallenges(allChallenges);

  // Reset circle status
  const allCircles = getAllCircles();
  const circleIndex = allCircles.findIndex((c) => c.id === challenge.circleId);
  if (circleIndex !== -1) {
    allCircles[circleIndex].status = 'No active match';
    saveAllCircles(allCircles);
  }

  return { success: true };
}
