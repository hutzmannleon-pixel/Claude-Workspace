// Passkeys (WebAuthn) im Browser: Einrichten und Anmelden. Die Bibliothek wird erst bei Bedarf geladen.
import { api } from './core.js';

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext;

const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android-Handy';
  if (/Windows/.test(ua)) return 'Windows-PC';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Gerät';
};

/** Browser-Fehler in verständliche Meldungen übersetzen */
function friendly(e) {
  if (e?.name === 'NotAllowedError') return new Error('Abgebrochen oder Zeit abgelaufen. Bitte erneut versuchen.');
  if (e?.name === 'InvalidStateError') return new Error('Auf diesem Gerät ist bereits ein Passkey für Ihr Konto eingerichtet.');
  if (e?.name === 'SecurityError') return new Error('Passkeys funktionieren nur über https://kaminfeger-verwaltung.com.');
  return e;
}

export async function addPasskey(role) {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const { options, challengeId } = await api('/api/passkey/register/options', { body: { role } });
  let response;
  try { response = await startRegistration({ optionsJSON: options }); } catch (e) { throw friendly(e); }
  await api('/api/passkey/register/verify', { body: { role, challengeId, response, name: deviceName() } });
}

export async function loginPasskey(role) {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const { options, challengeId } = await api('/api/passkey/login/options', { body: { role } });
  let response;
  try { response = await startAuthentication({ optionsJSON: options }); } catch (e) { throw friendly(e); }
  await api('/api/passkey/login/verify', { body: { role, challengeId, response } });
}
