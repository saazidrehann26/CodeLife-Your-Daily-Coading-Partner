/**
 * Supabase Client Configuration (Client-Safe)
 * 
 * SECURITY NOTICE:
 * Only the Publishable / Anon key is used here.
 * The SUPABASE_SECRET_KEY (service_role) has admin privileges and is strictly
 * restricted to the backend server (server.js). It is NEVER exposed to the frontend bundle.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  'https://dbbkdoaemwuoducpvxog.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  'sb_publishable_xKlpKWUqZxRqV6m5o3aSvg__Ly2PRJD';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Check if Supabase client is properly configured
 */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Sign in user with email and password via Supabase Auth
 * @param {string} email
 * @param {string} password
 */
export async function supabaseSignIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, user: data.user, session: data.session };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Sign up a new user with email, password, and custom metadata
 * @param {string} email
 * @param {string} password
 * @param {object} metadata - { name, username, institution, trustedDevices }
 */
export async function supabaseSignUp(email, password, metadata = {}) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          name: metadata.name || '',
          username: metadata.username || '',
          institution: metadata.institution || '',
          trustedDevices: Array.isArray(metadata.trustedDevices) ? metadata.trustedDevices : [],
        },
      },
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, user: data.user, session: data.session };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update authenticated user's metadata (e.g. adding trusted device)
 * @param {object} metadata
 */
export async function supabaseUpdateUserMetadata(metadata) {
  try {
    const { data, error } = await supabase.auth.updateUser({
      data: metadata,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update user password
 * @param {string} newPassword
 */
export async function supabaseUpdatePassword(newPassword) {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default supabase;
