import emailjs from '@emailjs/browser';

// EmailJS Credentials provided by the user
export const EMAILJS_CONFIG = {
  publicKey: '0yqLxQQTPjFwYwf9e',
  
  // 1. Password Reset Service & Template
  forgotPassword: {
    serviceId: 'resetpass_coadingweb',
    templateId: 'template_olho3md',
  },
  
  // 2. Sign-Up Mail Verification Service & Template
  signUpVerify: {
    serviceId: 'mailverify_coadingweb',
    templateId: 'template_ej77gs2',
  },
};

/**
 * Generate a secure 5-digit numeric OTP
 * @returns {string} 5-digit OTP string
 */
export function generateOtp() {
  const code = Math.floor(10000 + Math.random() * 90000);
  return String(code);
}

/**
 * Send Password Recovery OTP via EmailJS
 * @param {string} email - Recipient's registered email
 * @param {string} username - Registered username or identifier
 * @param {string} otp - 5-digit OTP
 */
export async function sendPasswordResetOtp(email, username, otp) {
  const templateParams = {
    to_email: email,
    email: email,
    user_email: email,
    recipient: email,
    to_name: username || email.split('@')[0],
    user_name: username || email.split('@')[0],
    name: username || email.split('@')[0],
    otp: otp,
    passcode: otp,
    code: otp,
    verification_code: otp,
    otp_code: otp,
    message: `Your account recovery OTP code is: ${otp}. It is valid for 3 minutes.`,
  };

  try {
    const response = await emailjs.send(
      EMAILJS_CONFIG.forgotPassword.serviceId,
      EMAILJS_CONFIG.forgotPassword.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );
    console.log('[EmailJS] Password reset OTP sent successfully:', response.status, response.text);
    return { success: true, response };
  } catch (error) {
    console.error('[EmailJS] Failed to send password reset OTP:', error);
    return {
      success: false,
      error,
      message: error?.text || error?.message || 'Failed to send OTP via EmailJS',
    };
  }
}

/**
 * Send Sign-Up Verification OTP via EmailJS
 * @param {string} email - New user email
 * @param {string} name - User display name
 * @param {string} otp - 5-digit OTP
 */
export async function sendSignUpVerificationOtp(email, name, otp) {
  const templateParams = {
    to_email: email,
    email: email,
    user_email: email,
    recipient: email,
    to_name: name || email.split('@')[0],
    user_name: name || email.split('@')[0],
    name: name || email.split('@')[0],
    otp: otp,
    passcode: otp,
    code: otp,
    verification_code: otp,
    otp_code: otp,
    message: `Your email verification OTP code is: ${otp}. It is valid for 3 minutes.`,
  };

  try {
    const response = await emailjs.send(
      EMAILJS_CONFIG.signUpVerify.serviceId,
      EMAILJS_CONFIG.signUpVerify.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );
    console.log('[EmailJS] Sign-up verification OTP sent successfully:', response.status, response.text);
    return { success: true, response };
  } catch (error) {
    console.error('[EmailJS] Failed to send sign-up verification OTP:', error);
    return {
      success: false,
      error,
      message: error?.text || error?.message || 'Failed to send verification OTP via EmailJS',
    };
  }
}

/**
 * Send Multi-Device Login Verification OTP via EmailJS
 * Sent whenever a user attempts to log in from a new/unrecognized device.
 *
 * @param {string} email - Recipient's registered email
 * @param {string} name - User's display name or username
 * @param {string} otp - 5-digit verification OTP
 * @param {string} deviceName - Name/platform of the unrecognized device (e.g. "Windows PC (Chrome)")
 */
export async function sendDeviceVerificationOtp(email, name, otp, deviceName = 'New Device') {
  const templateParams = {
    to_email: email,
    email: email,
    user_email: email,
    recipient: email,
    to_name: name || email.split('@')[0],
    user_name: name || email.split('@')[0],
    name: name || email.split('@')[0],
    device_name: deviceName,
    device: deviceName,
    otp: otp,
    passcode: otp,
    code: otp,
    verification_code: otp,
    otp_code: otp,
    message: `Security Alert: A sign-in was attempted from an unrecognized device (${deviceName}). Your 5-digit device verification code is: ${otp}. It is valid for 3 minutes. If you did not make this request, please change your password immediately.`,
  };

  try {
    const response = await emailjs.send(
      EMAILJS_CONFIG.signUpVerify.serviceId,
      EMAILJS_CONFIG.signUpVerify.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );
    console.log('[EmailJS] Device verification OTP sent successfully:', response.status, response.text);
    return { success: true, response };
  } catch (error) {
    console.error('[EmailJS] Failed to send device verification OTP:', error);
    return {
      success: false,
      error,
      message: error?.text || error?.message || 'Failed to send device verification OTP via EmailJS',
    };
  }
}
