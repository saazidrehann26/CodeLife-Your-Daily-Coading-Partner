/**
 * Password Strength Evaluation Service
 *
 * Rules:
 * 1. Minimum 8 characters
 * 2. At least one uppercase letter (A-Z)
 * 3. At least one lowercase letter (a-z)
 * 4. At least one number (0-9)
 * 5. At least one special character (e.g., !@#$%^&*)
 */

export function evaluatePasswordStrength(password = '') {
  const criteria = [
    {
      id: 'length',
      label: '8+ chars',
      missingText: 'Minimum 8 characters needed',
      isMet: password.length >= 8,
    },
    {
      id: 'uppercase',
      label: 'Uppercase (A-Z)',
      missingText: 'Add an uppercase letter (A-Z)',
      isMet: /[A-Z]/.test(password),
    },
    {
      id: 'lowercase',
      label: 'Lowercase (a-z)',
      missingText: 'Add a lowercase letter (a-z)',
      isMet: /[a-z]/.test(password),
    },
    {
      id: 'number',
      label: 'Number (0-9)',
      missingText: 'Add a number (0-9)',
      isMet: /[0-9]/.test(password),
    },
    {
      id: 'special',
      label: 'Special symbol (!@#$)',
      missingText: 'Add a special character (e.g. !@#$%^&*)',
      isMet: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password),
    },
  ];

  const metCount = criteria.filter((c) => c.isMet).length;

  let strength = 'weak';
  let strengthLabel = 'Weak';
  let color = '#ef4444'; // Red (0-2 criteria)

  if (metCount >= 5) {
    strength = 'strong';
    strengthLabel = 'Strong';
    color = '#22c55e'; // Green (5 criteria)
  } else if (metCount >= 3) {
    strength = 'medium';
    strengthLabel = 'Fair / Medium';
    color = '#f59e0b'; // Yellow / Orange (3-4 criteria)
  }

  const firstMissing = criteria.find((c) => !c.isMet);
  const helperText =
    password.length === 0
      ? 'Enter a password meeting all 5 requirements'
      : strength === 'strong'
        ? 'Great! Strong password meeting all 5 criteria.'
        : `Missing: ${firstMissing?.missingText}`;

  return {
    metCount,
    criteria,
    strength,
    strengthLabel,
    color,
    isStrong: metCount === 5,
    helperText,
  };
}
