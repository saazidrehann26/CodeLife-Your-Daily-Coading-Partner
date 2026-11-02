/**
 * Dashboard & Platform Service
 * - Stateless Date-Math Algorithm for Today's Challenge
 * - Daily Coding Streak Calculation
 * - Audio-Spectrum Bar Graph Generator (proportional heights algorithm)
 * - Code Store CRUD & Recent Problems Feed
 * - User Profile & Personal Details Management
 */

import { findUser } from './dbService.js';

const STORAGE_KEY_CODE_STORE = 'codelife_code_store_problems';
const STORAGE_KEY_STREAK = 'codelife_user_streaks';
const STORAGE_KEY_PROFILES = 'codelife_user_profiles';
const STORAGE_KEY_CURRENT_USER = 'codelife_active_user';

/**
 * Default web brand logo used for user profiles when no custom photo is provided
 */
export const DEFAULT_PROFILE_PHOTO = '/codelife_logo_white_bg.png';

/**
 * Curated Pool of n Problems for the Daily Challenge
 * Sorted in a fixed order by id.
 */
export const CURATED_PROBLEMS = [
  {
    id: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    category: 'Arrays & Hashing',
    tags: ['Array', 'Hash Table', 'Math'],
    description:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume each input has exactly one solution.',
    examples: [
      { input: 'nums = [2, 7, 11, 15], target = 9', output: '[0, 1]' },
      { input: 'nums = [3, 2, 4], target = 6', output: '[1, 2]' },
    ],
    starterSnippet: {
      Python: 'def twoSum(nums: list[int], target: int) -> list[int]:\n    lookup = {}\n    for i, n in enumerate(nums):\n        diff = target - n\n        if diff in lookup:\n            return [lookup[diff], i]\n        lookup[n] = i\n    return []',
      'C++': 'vector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int, int> seen;\n    for (int i = 0; i < nums.size(); i++) {\n        int comp = target - nums[i];\n        if (seen.count(comp)) return {seen[comp], i};\n        seen[nums[i]] = i;\n    }\n    return {};\n}',
      C: 'int* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n    // Linear search or hash table implementation\n    *returnSize = 2;\n    int* res = (int*)malloc(sizeof(int) * 2);\n    for(int i = 0; i < numsSize; i++) {\n        for(int j = i + 1; j < numsSize; j++) {\n            if (nums[i] + nums[j] == target) { res[0] = i; res[1] = j; return res; }\n        }\n    }\n    return NULL;\n}',
    },
  },
  {
    id: 2,
    title: 'Valid Palindrome',
    difficulty: 'Easy',
    category: 'Two Pointers',
    tags: ['String', 'Two Pointers'],
    description:
      'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward.',
    examples: [
      { input: 's = "A man, a plan, a canal: Panama"', output: 'true' },
      { input: 's = "race a car"', output: 'false' },
    ],
    starterSnippet: {
      Python: 'def isPalindrome(s: str) -> bool:\n    clean = [c.lower() for c in s if c.isalnum()]\n    return clean == clean[::-1]',
      'C++': 'bool isPalindrome(string s) {\n    int l = 0, r = s.size() - 1;\n    while (l < r) {\n        while (l < r && !isalnum(s[l])) l++;\n        while (l < r && !isalnum(s[r])) r--;\n        if (tolower(s[l]) != tolower(s[r])) return false;\n        l++; r--;\n    }\n    return true;\n}',
      C: 'bool isPalindrome(char* s) {\n    int l = 0, r = strlen(s) - 1;\n    while (l < r) {\n        while (l < r && !isalnum(s[l])) l++;\n        while (l < r && !isalnum(s[r])) r--;\n        if (tolower(s[l]) != tolower(s[r])) return false;\n        l++; r--;\n    }\n    return true;\n}',
    },
  },
  {
    id: 3,
    title: 'Maximum Subarray (Kadane’s Algorithm)',
    difficulty: 'Medium',
    category: 'Dynamic Programming',
    tags: ['Array', 'Dynamic Programming', 'Divide and Conquer'],
    description:
      'Given an integer array nums, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum.',
    examples: [
      { input: 'nums = [-2,1,-3,4,-1,2,1,-5,4]', output: '6 (Subarray [4,-1,2,1])' },
      { input: 'nums = [5,4,-1,7,8]', output: '23' },
    ],
    starterSnippet: {
      Python: 'def maxSubArray(nums: list[int]) -> int:\n    max_sum = curr_sum = nums[0]\n    for n in nums[1:]:\n        curr_sum = max(n, curr_sum + n)\n        max_sum = max(max_sum, curr_sum)\n    return max_sum',
      'C++': 'int maxSubArray(vector<int>& nums) {\n    int max_s = nums[0], curr_s = nums[0];\n    for (size_t i = 1; i < nums.size(); ++i) {\n        curr_s = max(nums[i], curr_s + nums[i]);\n        max_s = max(max_s, curr_s);\n    }\n    return max_s;\n}',
      C: 'int maxSubArray(int* nums, int numsSize) {\n    int max_s = nums[0], curr_s = nums[0];\n    for(int i = 1; i < numsSize; i++) {\n        curr_s = (nums[i] > curr_s + nums[i]) ? nums[i] : curr_s + nums[i];\n        if(curr_s > max_s) max_s = curr_s;\n    }\n    return max_s;\n}',
    },
  },
  {
    id: 4,
    title: 'Reverse Linked List',
    difficulty: 'Easy',
    category: 'Linked List',
    tags: ['Linked List', 'Recursion'],
    description:
      'Given the head of a singly linked list, reverse the list, and return the reversed list.',
    examples: [
      { input: 'head = [1,2,3,4,5]', output: '[5,4,3,2,1]' },
      { input: 'head = [1,2]', output: '[2,1]' },
    ],
    starterSnippet: {
      Python: 'def reverseList(head: Optional[ListNode]) -> Optional[ListNode]:\n    prev, curr = None, head\n    while curr:\n        nxt = curr.next\n        curr.next = prev\n        prev = curr\n        curr = nxt\n    return prev',
      'C++': 'ListNode* reverseList(ListNode* head) {\n    ListNode *prev = nullptr, *curr = head;\n    while (curr) {\n        ListNode* nxt = curr->next;\n        curr->next = prev;\n        prev = curr;\n        curr = nxt;\n    }\n    return prev;\n}',
      C: 'struct ListNode* reverseList(struct ListNode* head) {\n    struct ListNode *prev = NULL, *curr = head;\n    while (curr) {\n        struct ListNode* nxt = curr->next;\n        curr->next = prev;\n        prev = curr;\n        curr = nxt;\n    }\n    return prev;\n}',
    },
  },
  {
    id: 5,
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    category: 'Sliding Window',
    tags: ['Hash Table', 'String', 'Sliding Window'],
    description:
      'Given a string s, find the length of the longest substring without repeating characters.',
    examples: [
      { input: 's = "abcabcbb"', output: '3 ("abc")' },
      { input: 's = "pwwkew"', output: '3 ("wke")' },
    ],
    starterSnippet: {
      Python: 'def lengthOfLongestSubstring(s: str) -> int:\n    used = {}\n    max_len = start = 0\n    for i, c in enumerate(s):\n        if c in used and start <= used[c]:\n            start = used[c] + 1\n        else:\n            max_len = max(max_len, i - start + 1)\n        used[c] = i\n    return max_len',
      'C++': 'int lengthOfLongestSubstring(string s) {\n    vector<int> last(128, -1);\n    int left = 0, res = 0;\n    for (int i = 0; i < s.size(); ++i) {\n        if (last[s[i]] >= left) left = last[s[i]] + 1;\n        last[s[i]] = i;\n        res = max(res, i - left + 1);\n    }\n    return res;\n}',
      C: 'int lengthOfLongestSubstring(char* s) {\n    int last[128]; memset(last, -1, sizeof(last));\n    int left = 0, res = 0, len = strlen(s);\n    for(int i = 0; i < len; i++) {\n        if(last[(unsigned char)s[i]] >= left) left = last[(unsigned char)s[i]] + 1;\n        last[(unsigned char)s[i]] = i;\n        if(i - left + 1 > res) res = i - left + 1;\n    }\n    return res;\n}',
    },
  },
  {
    id: 6,
    title: 'Binary Search',
    difficulty: 'Easy',
    category: 'Binary Search',
    tags: ['Array', 'Binary Search'],
    description:
      'Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, return its index. Otherwise, return -1.',
    examples: [
      { input: 'nums = [-1,0,3,5,9,12], target = 9', output: '4' },
      { input: 'nums = [-1,0,3,5,9,12], target = 2', output: '-1' },
    ],
    starterSnippet: {
      Python: 'def search(nums: list[int], target: int) -> int:\n    left, right = 0, len(nums) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if nums[mid] == target: return mid\n        elif nums[mid] < target: left = mid + 1\n        else: right = mid - 1\n    return -1',
      'C++': 'int search(vector<int>& nums, int target) {\n    int l = 0, r = nums.size() - 1;\n    while (l <= r) {\n        int m = l + (r - l) / 2;\n        if (nums[m] == target) return m;\n        if (nums[m] < target) l = m + 1;\n        else r = m - 1;\n    }\n    return -1;\n}',
      C: 'int search(int* nums, int numsSize, int target) {\n    int l = 0, r = numsSize - 1;\n    while(l <= r) {\n        int m = l + (r - l)/2;\n        if(nums[m] == target) return m;\n        if(nums[m] < target) l = m + 1;\n        else r = m - 1;\n    }\n    return -1;\n}',
    },
  },
  {
    id: 7,
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    category: 'Stack',
    tags: ['String', 'Stack'],
    description:
      'Given a string s containing just the characters "(", ")", "{", "}", "[" and "]", determine if the input string is valid.',
    examples: [
      { input: 's = "()[]{}"', output: 'true' },
      { input: 's = "(]"', output: 'false' },
    ],
    starterSnippet: {
      Python: 'def isValid(s: str) -> bool:\n    stack = []\n    mapping = {")": "(", "}": "{", "]": "["}\n    for char in s:\n        if char in mapping:\n            top = stack.pop() if stack else "#"\n            if mapping[char] != top: return False\n        else: stack.append(char)\n    return not stack',
      'C++': 'bool isValid(string s) {\n    stack<char> st;\n    for (char c : s) {\n        if (c == \'(\' || c == \'{\' || c == \'[\') st.push(c);\n        else {\n            if (st.empty()) return false;\n            if (c == \')\' && st.top() != \'(\') return false;\n            if (c == \'}\' && st.top() != \'{\') return false;\n            if (c == \']\' && st.top() != \'[\') return false;\n            st.pop();\n        }\n    }\n    return st.empty();\n}',
      C: 'bool isValid(char* s) {\n    int len = strlen(s);\n    char* st = (char*)malloc(len + 1);\n    int top = -1;\n    for(int i = 0; i < len; i++) {\n        char c = s[i];\n        if(c == \'(\' || c == \'{\' || c == \'[\') st[++top] = c;\n        else {\n            if(top < 0) { free(st); return false; }\n            if(c == \')\' && st[top] != \'(\') { free(st); return false; }\n            if(c == \'}\' && st[top] != \'{\') { free(st); return false; }\n            if(c == \']\' && st[top] != \'[\') { free(st); return false; }\n            top--;\n        }\n    }\n    bool valid = (top == -1);\n    free(st); return valid;\n}',
    },
  },
  {
    id: 8,
    title: 'Climbing Stairs',
    difficulty: 'Easy',
    category: 'Dynamic Programming',
    tags: ['Math', 'Dynamic Programming', 'Memoization'],
    description:
      'You are climbing a staircase. It takes n steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?',
    examples: [
      { input: 'n = 2', output: '2' },
      { input: 'n = 3', output: '3' },
    ],
    starterSnippet: {
      Python: 'def climbStairs(n: int) -> int:\n    if n <= 2: return n\n    a, b = 1, 2\n    for _ in range(3, n + 1):\n        a, b = b, a + b\n    return b',
      'C++': 'int climbStairs(int n) {\n    if (n <= 2) return n;\n    int a = 1, b = 2;\n    for (int i = 3; i <= n; ++i) {\n        int c = a + b; a = b; b = c;\n    }\n    return b;\n}',
      C: 'int climbStairs(int n) {\n    if (n <= 2) return n;\n    int a = 1, b = 2;\n    for(int i = 3; i <= n; i++) {\n        int c = a + b; a = b; b = c;\n    }\n    return b;\n}',
    },
  },
];

/**
 * Normalizes a date to local YYYY-MM-DD string to avoid UTC/timezone boundary drift.
 */
export function getLocalDateKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 1. Stateless Date-Math Algorithm (Zero Database Writes)
 * Calculates the active problem dynamically based on calendar date.
 * If user hasn't started practice yet, dayNumber is 0. Once practice begins,
 * it tracks days passed since practice inception.
 */
export function getTodaysChallenge(username = 'default', _version = 0, customDate = new Date()) {
  const data = getUserStreakData(username, _version);
  const now = new Date(customDate);
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  let daysPassed = 0;
  let dayNumber = 0;

  if (data.first_practice_date) {
    const firstDate = new Date(data.first_practice_date);
    const firstUTC = Date.UTC(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
    daysPassed = Math.max(0, Math.floor((todayUTC - firstUTC) / (1000 * 60 * 60 * 24)));
    dayNumber = daysPassed + 1;
  } else {
    // User hasn't started practice yet
    daysPassed = 0;
    dayNumber = 0;
  }

  const index = daysPassed % CURATED_PROBLEMS.length;

  const dateString = now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return {
    ...CURATED_PROBLEMS[index],
    dailyIndex: index,
    daysPassed,
    dayNumber,
    isPracticeStarted: Boolean(data.first_practice_date),
    dateKey: getLocalDateKey(now),
    dateString,
  };
}

/**
 * 2. Audio-Spectrum Bar Graph Generator
 * Outputs proportional heights (scaled to highest peak = 100%)
 */
export function generateBarGraphData(submissionDates = [], daysToTrack = 30) {
  // 1. Create a frequency map of the user's activity
  const activityMap = {};
  submissionDates.forEach((dateStr) => {
    activityMap[dateStr] = (activityMap[dateStr] || 0) + 1;
  });

  const rawData = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let maxCount = 0;

  // 2. Generate the timeline and track the highest peak
  for (let i = daysToTrack - 1; i >= 0; i--) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);
    const dateKey = getLocalDateKey(targetDate);

    const count = activityMap[dateKey] || 0;
    if (count > maxCount) maxCount = count;

    rawData.push({ date: dateKey, count: count });
  }

  // Prevent division by zero if the user has 0 total activity
  const scaleReference = maxCount > 0 ? maxCount : 1;

  // 3. Calculate percentage heights for the UI bars (zero activity days remain flat at 0%)
  return rawData.map((day) => ({
    date: day.date,
    count: day.count,
    heightPercentage: day.count === 0 ? 0 : Math.max(12, (day.count / scaleReference) * 100),
  }));
}

/**
 * 3. Daily Streak Logic
 * Tracks current_streak, longest_streak, last_active_date and submission dates.
 * A new user starts at ZERO across all parameters until they start practicing.
 */
export function getUserStreakData(username = 'default', _version = 0) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_STREAK}_${username}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure any user who hasn't started practice yet is strictly at ZERO
      if (!parsed.practice_started) {
        parsed.current_streak = 0;
        parsed.longest_streak = 0;
        parsed.total_problems_solved = 0;
        parsed.submissionDates = [];
        parsed.solvedChallengeIds = [];
        parsed.last_active_date = null;
        parsed.first_practice_date = null;
        saveUserStreakData(username, parsed);
        return parsed;
      }
      return parsed;
    }
  } catch (e) {
    console.error('Error reading streak data:', e);
  }

  // All information starts at ZERO when any user signs up
  const initial = {
    current_streak: 0,
    longest_streak: 0,
    total_problems_solved: 0,
    last_active_date: null,
    submissionDates: [],
    solvedChallengeIds: [],
    practice_started: false,
    first_practice_date: null,
  };

  saveUserStreakData(username, initial);
  return initial;
}

export function saveUserStreakData(username = 'default', streakData) {
  try {
    localStorage.setItem(`${STORAGE_KEY_STREAK}_${username}`, JSON.stringify(streakData));
  } catch (e) {
    console.error('Error saving streak data:', e);
  }
}

/**
 * Initializes a new user's dashboard data completely to zero,
 * and sets up a clean profile containing only name, username, email, and the official web logo.
 */
export function initializeNewUserData(username, userData = {}) {
  if (!username) return;
  const initialStreak = {
    current_streak: 0,
    longest_streak: 0,
    total_problems_solved: 0,
    last_active_date: null,
    submissionDates: [],
    solvedChallengeIds: [],
    practice_started: false,
    first_practice_date: null,
  };
  saveUserStreakData(username, initialStreak);
  saveCodeStoreProblems(username, []);

  // Initialize clean user profile with strictly name, username, email, and the official web logo
  const resolvedName = userData.name || username;
  const names = resolvedName.trim().split(/\s+/);
  const secondName = names.length > 1 ? names[names.length - 1] : names[0] || 'Coder';

  const cleanProfile = {
    fullName: resolvedName,
    secondName,
    username,
    email: userData.email || `${username}@codelife.dev`,
    photoUrl: DEFAULT_PROFILE_PHOTO,
    age: '',
    interest: '',
    classGrade: '',
    institution: '',
    bio: '',
    memberSince: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  };
  saveUserProfile(username, cleanProfile);
}

/**
 * Apply the Streak & Problem Increment Logic whenever user solves or saves any problem
 * Both streak days and total solved problem number start from the moment user begins practice.
 */
export function recordProblemSolved(username = 'default', problemId = null) {
  const data = getUserStreakData(username);
  const now = new Date();
  const todayKey = getLocalDateKey(now);

  let newCurrentStreak = 1;

  if (data.last_active_date) {
    const lastActive = new Date(data.last_active_date);
    const today = new Date(todayKey);
    const diffDays = Math.round((today - lastActive) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Already active today: keep streak count
      newCurrentStreak = data.current_streak || 1;
    } else if (diffDays === 1) {
      // Solved yesterday: increment streak by 1
      newCurrentStreak = (data.current_streak || 0) + 1;
    } else {
      // Missed one or more days: reset streak to 1
      newCurrentStreak = 1;
    }
  } else {
    // First practice session: start streak at 1
    newCurrentStreak = 1;
  }

  const newLongestStreak = Math.max(data.longest_streak || 0, newCurrentStreak);
  const prevTotal = data.total_problems_solved || 0;
  const newTotalProblems = prevTotal + 1;

  // Record submission date for activity graph
  const updatedSubmissions = [...(data.submissionDates || []), todayKey];
  const updatedSolvedIds = problemId && !(data.solvedChallengeIds || []).includes(problemId)
    ? [...(data.solvedChallengeIds || []), problemId]
    : data.solvedChallengeIds || [];

  const updatedStreak = {
    current_streak: newCurrentStreak,
    longest_streak: newLongestStreak,
    total_problems_solved: newTotalProblems,
    last_active_date: todayKey,
    submissionDates: updatedSubmissions,
    solvedChallengeIds: updatedSolvedIds,
    practice_started: true,
    first_practice_date: data.first_practice_date || todayKey,
  };

  saveUserStreakData(username, updatedStreak);
  return updatedStreak;
}

/**
 * 4. Code Store Persistence & Recent Problems
 * New users start with 0 stored problems.
 */
export function getCodeStoreProblems(username = 'default', _version = 0) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_CODE_STORE}_${username}`);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter out any legacy dummy seed problems
        const clean = parsed.filter((p) => !p.id?.startsWith?.('seed-'));
        if (clean.length !== parsed.length) {
          saveCodeStoreProblems(username, clean);
          return clean;
        }
        return clean;
      }
    }
  } catch (e) {
    console.error('Error reading code store:', e);
  }

  // Brand new users start with an empty code store (0 problems)
  const empty = [];
  saveCodeStoreProblems(username, empty);
  return empty;
}

export function saveCodeStoreProblems(username = 'default', problems) {
  try {
    localStorage.setItem(`${STORAGE_KEY_CODE_STORE}_${username}`, JSON.stringify(problems));
  } catch (e) {
    console.error('Error saving code store:', e);
  }
}

export function addCodeStoreProblem(username = 'default', problem) {
  const existing = getCodeStoreProblems(username);
  const now = new Date();
  const loc = (problem.location || problem.filePath || '').trim();
  const defaultPath = `solutions/${problem.problemName.toLowerCase().replace(/\s+/g, '_')}`;
  const newProblem = {
    id: `code_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    problemName: problem.problemName.trim(),
    language: problem.language || 'Python',
    location: loc || 'Practice Area',
    filePath: loc || defaultPath,
    code: problem.code || '// Stored code snippet\n',
    createdAt: now.toISOString(),
    formattedDateTime: now.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + ' at ' + now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };

  const updated = [newProblem, ...existing];
  saveCodeStoreProblems(username, updated);

  // Also count as a problem activity!
  recordProblemSolved(username);

  return newProblem;
}

/**
 * Delete a problem from the user's Code Store
 */
export function deleteCodeStoreProblem(username = 'default', problemId) {
  const existing = getCodeStoreProblems(username);
  const updated = existing.filter((p) => p.id !== problemId);
  saveCodeStoreProblems(username, updated);
  return updated;
}

/**
 * Update an existing problem in the user's Code Store
 */
export function updateCodeStoreProblem(username = 'default', problemId, updates = {}) {
  const existing = getCodeStoreProblems(username);
  let updatedProblem = null;
  const updated = existing.map((p) => {
    if (p.id === problemId) {
      updatedProblem = {
        ...p,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return updatedProblem;
    }
    return p;
  });
  saveCodeStoreProblems(username, updated);
  return updatedProblem;
}

/**
 * Returns latest 2 problems added by the user
 */
export function getRecentProblems(username = 'default', _version = 0) {
  const all = getCodeStoreProblems(username, _version);
  return all.slice(0, 2);
}

/**
 * 5. User Profile Management (Full Name, 2nd Name, Photo, Personal Details)
 */
export function getUserProfile(userOrUsername = 'coder') {
  let targetUsername =
    typeof userOrUsername === 'string'
      ? userOrUsername
      : userOrUsername?.username || 'coder';
  let targetUser =
    typeof userOrUsername === 'object' && userOrUsername
      ? userOrUsername
      : findUser(targetUsername);

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PROFILES}_${targetUsername}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      let modified = false;

      // Update old company logo fallback to the web logo
      if (!parsed.photoUrl || parsed.photoUrl === '/company_logo_clean.png' || parsed.photoUrl === '/company_logo.png') {
        parsed.photoUrl = DEFAULT_PROFILE_PHOTO;
        modified = true;
      }
      // Remove legacy hardcoded dummy details if user did not explicitly enter them
      if (parsed.interest === 'Competitive Programming, Data Structures & Algorithms, Full Stack') {
        parsed.interest = '';
        modified = true;
      }
      if (parsed.bio === 'Dedicated coder striving for a daily practice streak on CodeLife.') {
        parsed.bio = '';
        modified = true;
      }
      if (parsed.classGrade === 'Computer Science Student' || parsed.classGrade === 'CodeLife Academy') {
        parsed.classGrade = '';
        modified = true;
      }
      if (parsed.age === 21 && !parsed.age_customized) {
        parsed.age = '';
        modified = true;
      }

      // Synchronize exact logged-in user name if available
      if (
        targetUser?.name &&
        (!parsed.fullName || parsed.fullName !== targetUser.name)
      ) {
        parsed.fullName = targetUser.name;
        const names = targetUser.name.trim().split(/\s+/);
        parsed.secondName = names.length > 1 ? names[names.length - 1] : names[0];
        if (targetUser.email) parsed.email = targetUser.email;
        modified = true;
      }

      if (modified) {
        saveUserProfile(targetUsername, parsed);
      }
      return parsed;
    }
  } catch (e) {
    console.error('Error reading user profile:', e);
  }

  const resolvedName = targetUser?.name || targetUsername;
  const names = resolvedName.trim().split(/\s+/);
  const secondName = names.length > 1 ? names[names.length - 1] : names[0] || 'Coder';

  // Only store name, username, email and official web logo for new user
  const initial = {
    fullName: resolvedName,
    secondName: secondName,
    username: targetUsername,
    email: targetUser?.email || `${targetUsername}@codelife.dev`,
    photoUrl: DEFAULT_PROFILE_PHOTO,
    age: '',
    interest: '',
    classGrade: '',
    institution: '',
    bio: '',
    memberSince: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  };

  saveUserProfile(targetUsername, initial);
  return initial;
}

export function saveUserProfile(username = 'coder', profile) {
  try {
    // Ensure secondName is always derived from fullName
    const names = (profile.fullName || '').trim().split(/\s+/);
    const secondName = names.length > 1 ? names[names.length - 1] : names[0] || 'Coder';
    const completeProfile = {
      ...profile,
      secondName,
    };
    localStorage.setItem(`${STORAGE_KEY_PROFILES}_${username}`, JSON.stringify(completeProfile));
    return completeProfile;
  } catch (e) {
    console.error('Error saving user profile:', e);
    return profile;
  }
}

/**
 * Active Logged-in User Session Helper
 */
export function getActiveUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed?.name?.toLowerCase() === 'alex johnson' ||
        parsed?.username?.toLowerCase() === 'love_code' ||
        parsed?.email?.toLowerCase() === 'lovecode@gmail.com'
      ) {
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
        return null;
      }

      // Strict database check: Ensure active user is registered in database
      const identifier = parsed?.username || parsed?.email;
      if (!identifier) {
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
        return null;
      }

      const userInDb = findUser(identifier);
      if (!userInDb) {
        // User is not in the database! Invalidate session immediately
        console.warn(`[Auth] User "${identifier}" not found in database. Inactive session cleared.`);
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
        return null;
      }

      return {
        ...parsed,
        ...userInDb,
      };
    }
  } catch {
    // Return null if uninitialized
  }
  return null;
}

export function setActiveUser(user) {
  try {
    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}

/**
 * Returns a standard file extension based on programming language.
 */
export function getFileExtension(lang = '') {
  const normalized = (lang || '').toLowerCase().trim();
  switch (normalized) {
    case 'python':
      return 'py';
    case 'c++':
    case 'cpp':
      return 'cpp';
    case 'c':
      return 'c';
    case 'javascript':
    case 'js':
      return 'js';
    case 'typescript':
    case 'ts':
      return 'ts';
    case 'java':
      return 'java';
    case 'rust':
      return 'rs';
    case 'go':
      return 'go';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    default:
      return 'txt';
  }
}
