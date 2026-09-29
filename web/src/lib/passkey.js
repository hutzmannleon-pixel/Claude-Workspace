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
  try { response = await startAuthentication({ optionsJSON: options }); }
  catch (e) {
    // Android/iOS melden „keine Passkeys verfügbar“ ebenfalls als NotAllowedError
    if (e?.name === 'NotAllowedError') throw new Error(role === 'admin'
      ? 'Kein Passkey gefunden. Beim ersten Mal bitte mit Code per E-Mail entsperren – danach wird der Passkey eingerichtet.'
      : 'Kein Passkey gefunden (oder abgebrochen). Melden Sie sich einmal mit Code per E-Mail an und richten Sie den Passkey unter „Mehr“ ein.');
    throw friendly(e);
  }
  try { await api('/api/passkey/login/verify', { body: { role, challengeId, response } }); }
  catch (e) {
    // Passkey liegt noch auf dem Gerät, ist auf dem Server aber gelöscht → Gerät soll ihn vergessen
    if (e.code === 'passkey_unknown' && window.PublicKeyCredential?.signalUnknownCredential)
      window.PublicKeyCredential.signalUnknownCredential({ rpId: options.rpId, credentialId: response.id }).catch(() => {});
    throw e;
  }
}

/** Nach dem Entfernen: dem Passwortmanager des Geräts mitteilen, welche Passkeys noch gelten */
export function syncPasskeys(list) {
  if (!list?.userId || !window.PublicKeyCredential?.signalAllAcceptedCredentials) return;
  window.PublicKeyCredential.signalAllAcceptedCredentials({ rpId: list.rpId, userId: list.userId, allAcceptedCredentialIds: list.accepted }).catch(() => {});
}

// Nach Anmeldung/Registrierung per E-Mail-Code einmal anbieten, einen Passkey einzurichten
const OFFER = 'kf-passkey-offer', NO = 'kf-passkey-no-';
const store = (s, fn) => { try { return fn(s()); } catch { return null; } };
export const markPasskeyOffer = role => store(() => sessionStorage, s => s.setItem(OFFER, role));
export const takePasskeyOffer = role => store(() => sessionStorage, s => { const on = s.getItem(OFFER) === role; if (on) s.removeItem(OFFER); return on; });
export const passkeyDeclined = role => store(() => localStorage, s => s.getItem(NO + role) === '1');
export const declinePasskey = role => store(() => localStorage, s => s.setItem(NO + role, '1'));
