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
import { getUserProfile, getUserStreakData, DEFAULT_PROFILE_PHOTO } from './dashboardService.js';

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

/**
 * Get circles belonging to or joined by the user
 */
export function getUserCircles(username) {
  if (!username) return [];
  const clean = username.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_CIRCLES}_${clean}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Error reading circles:', e);
  }
  return [];
}

/**
 * Save user's circles
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
 * Create a new circle
 */
export function createCircle(creatorUsername, circleName, maxMembers = 50) {
  if (!creatorUsername || !circleName?.trim()) return null;
  const circles = getUserCircles(creatorUsername);
  const newCircle = {
    id: `circle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: circleName.trim(),
    adminUsername: creatorUsername.trim().toLowerCase(),
    maxMembers,
    status: 'No active match', // 'No active match' | 'Lobby open' | 'Match live'
    createdAt: new Date().toISOString(),
    inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    members: [
      {
        username: creatorUsername.trim().toLowerCase(),
        role: 'admin',
        joinedAt: new Date().toISOString(),
      },
    ],
  };

  const updated = [newCircle, ...circles];
  saveUserCircles(creatorUsername, updated);
  return newCircle;
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
  const targetClean = targetUsername.trim().toLowerCase();
  const privacy = getUserPrivacySettings(targetClean);

  if (privacy.allowStrangerInvites === false) {
    return {
      success: false,
      error: `@${targetUsername} has opted out of receiving invitations from non-friends.`,
    };
  }

  const existingInvites = getPendingCircleInvites(targetClean);
  if (existingInvites.some((inv) => inv.circleId === circleId)) {
    return { success: false, error: 'An invitation is already pending for this user.' };
  }

  const newInvite = {
    id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    circleId,
    circleName: circleName || 'Friend Circle',
    inviterUsername: inviterUsername.trim().toLowerCase(),
    targetUsername: targetClean,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  savePendingCircleInvites(targetClean, [newInvite, ...existingInvites]);
  return { success: true, invite: newInvite };
}

/**
 * Accept or decline a circle invite
 */
export function respondCircleInvite(username, inviteId, accept = true) {
  const invites = getPendingCircleInvites(username);
  const targetInvite = invites.find((i) => i.id === inviteId);
  if (!targetInvite) return false;

  const remaining = invites.filter((i) => i.id !== inviteId);
  savePendingCircleInvites(username, remaining);

  if (accept) {
    const userCircles = getUserCircles(username);
    const joined = {
      id: targetInvite.circleId,
      name: targetInvite.circleName,
      adminUsername: targetInvite.inviterUsername,
      status: 'No active match',
      joinedAt: new Date().toISOString(),
      members: [
        { username: targetInvite.inviterUsername, role: 'admin' },
        { username: username.trim().toLowerCase(), role: 'member', joinedAt: new Date().toISOString() },
      ],
    };
    saveUserCircles(username, [joined, ...userCircles]);
  }

  return true;
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
