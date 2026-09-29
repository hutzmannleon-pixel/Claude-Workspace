// Impressum und Datenschutzerklärung. Betreiberangaben kommen aus der Server-Konfiguration (OPERATOR_*).
import { useEffect, useState } from 'react';
import { sx, api } from './lib/core.js';
import { Shell, GLOW, Icon } from './ui.jsx';

const H = ({ children }) => <div style={sx('font-size:17px;font-weight:500;margin:22px 0 6px')}>{children}</div>;
const P = ({ children }) => <p style={sx('margin:0 0 10px;font-size:14px;color:var(--color-neutral-300);line-height:1.55;text-wrap:pretty')}>{children}</p>;
const Li = ({ children }) => <li style={sx('margin:0 0 6px;font-size:14px;color:var(--color-neutral-300);line-height:1.5')}>{children}</li>;

export default function Legal({ page }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api('/api/config').then(setCfg).catch(() => setCfg({})); }, []);
  const op = cfg?.operator || {};
  const who = <>
    {op.name || '[Name des Betreibers]'}<br />
    {(op.address || '[Anschrift]').split(/\s*[,;]\s*|\n/).map((l, i) => <span key={i}>{l}<br /></span>)}
    E-Mail: {op.email ? <a href={`mailto:${op.email}`}>{op.email}</a> : '[E-Mail]'}
  </>;
  const back = () => (history.length > 1 ? history.back() : (location.href = '/'));
  return (
    <Shell glow={GLOW.customer}>
      <div style={sx('display:flex;align-items:center;padding:4px 12px 0')}><button className="btn btn-icon" onClick={back} style={sx('width:44px;height:44px')} aria-label="Zurück"><Icon n="ph-caret-left" style={sx('font-size:22px')} /></button></div>
      <div style={sx('padding:6px 22px 32px')}>
        <span className="card-kicker">Kaminfeger Verwaltung</span>
        <div style={sx('font-size:28px;font-weight:500;letter-spacing:-0.02em;margin:6px 0 4px')}>{page === 'impressum' ? 'Impressum' : 'Datenschutz'}</div>
        {cfg?.restricted && <P><b style={sx('font-weight:500;color:var(--color-accent-300)')}>Testbetrieb:</b> Diese Anwendung ist ein nicht-kommerzielles Testprojekt und nur für eingeladene Testpersonen freigegeben.</P>}

        {page === 'impressum' ? <>
          <H>Angaben gemäß § 5 DDG</H>
          <P>{who}</P>
          <H>Verantwortlich für den Inhalt</H>
          <P>{op.name || '[Name des Betreibers]'}, Anschrift wie oben.</P>
        </> : <>
          <H>1. Verantwortlicher</H>
          <P>{who}</P>
          <H>2. Welche Daten wir verarbeiten</H>
          <ul style={sx('padding-left:20px;margin:0 0 10px')}>
            <Li><b style={sx('font-weight:500')}>Bewohner:</b> E-Mail-Adresse, Familienname, Anschrift, ggf. Kundennummer vom Feuerstättenbescheid, gebuchter Termin, Hinweis „Schlüssel beim Nachbarn“, Einstellungen zu Erinnerungen, gelesene Nachrichten.</Li>
            <Li><b style={sx('font-weight:500')}>Kaminfeger:</b> Name, Betriebsadresse, geschäftliche E-Mail, optional Telefonnummer, Kehrbezirk, Kehrbuch (Adressen, Eigentümer, Kundennummern, Telefon, E-Mail der Liegenschaften), Zeitfenster, Nachrichten.</Li>
            <Li><b style={sx('font-weight:500')}>Nachweisdokumente</b> (Bestellungsurkunde, Ausweis) nur zur Prüfung durch den Betreiber. Sie werden nach der Entscheidung, spätestens nach 14 Tagen, gelöscht.</Li>
            <Li><b style={sx('font-weight:500')}>Passkeys:</b> Wenn Sie einen Passkey einrichten, speichern wir nur dessen öffentlichen Schlüssel, Gerätetyp und Zeitpunkt der Nutzung. Fingerabdruck oder Gesichtsbild verlassen Ihr Gerät nie.</Li>
            <Li><b style={sx('font-weight:500')}>Feedback:</b> Nur wenn Sie den Feedback-Knopf nutzen: Ihr Text, die aufgerufene Ansicht, Bildschirmgröße und – wenn Sie es nicht abwählen – ein Bild der aktuellen Ansicht mit dem markierten Bereich. Ohne Anmeldung zusätzlich Ihre E-Mail, falls Sie eine angeben, und zur Abwehr von Missbrauch ein verschlüsselter Wert Ihrer IP-Adresse (die IP selbst wird nicht gespeichert). Nur der Betreiber sieht es; erledigtes Feedback wird nach 90 Tagen gelöscht, spätestens nach 180 Tagen, und mit Ihrem Konto.</Li>
            <Li><b style={sx('font-weight:500')}>Technisch:</b> Server-Protokolle (IP-Adresse, Zeitpunkt, aufgerufene Adresse) zur Fehleranalyse und Absicherung.</Li>
          </ul>
          <H>3. Zwecke und Rechtsgrundlagen</H>
          <P>Terminvereinbarung für die Feuerstättenschau, Anmeldung per E-Mail-Code, Prüfung, dass Bewohner bzw. Kaminfeger berechtigt sind, Erinnerungen und Mitteilungen zum Termin (Art. 6 Abs. 1 lit. b DSGVO). Server-Protokolle und Missbrauchsschutz (Art. 6 Abs. 1 lit. f DSGVO).</P>
          <H>4. Empfänger und Dienstleister</H>
          <ul style={sx('padding-left:20px;margin:0 0 10px')}>
            <Li><b style={sx('font-weight:500')}>Amazon Web Services EMEA SARL</b> (Luxemburg): Hosting des Servers im Rechenzentrum Stockholm (EU){cfg?.mailProvider === 'ses' ? ' und E-Mail-Versand (Amazon SES)' : ''}{cfg?.offsiteBackup ? ', verschlüsselte Sicherungskopien im Rechenzentrum Frankfurt (EU)' : ''}. Grundlage: Auftragsverarbeitungsvertrag.</Li>
            {cfg?.mailProvider === 'brevo' && <Li><b style={sx('font-weight:500')}>Brevo GmbH</b> (Köpenicker Str. 126, 10179 Berlin): Versand der E-Mails (Anmeldecodes, Terminbestätigungen, Erinnerungen) über Server in der EU (Frankreich, Deutschland, Belgien). Übermittelt werden E-Mail-Adresse und Inhalt der Nachricht. Grundlage: Auftragsverarbeitungsvertrag (Datenschutzvereinbarung von Brevo); soweit Unterauftragsverarbeiter mit Sitz außerhalb der EU beteiligt sind, auf Grundlage des EU-US Data Privacy Framework bzw. von Standardvertragsklauseln.</Li>}
            <Li><b style={sx('font-weight:500')}>Komoot GmbH</b> (Photon-Adresssuche): Während Sie eine Straße eintippen, wird der eingegebene Text an photon.komoot.io gesendet, um Vorschläge anzuzeigen.</Li>
            <Li><b style={sx('font-weight:500')}>Ihr Kaminfeger</b> sieht Name, Anschrift und gebuchten Termin der Haushalte seines Bezirks. Andere Bewohner sehen nur, welche Zeiten belegt sind, und am Termintag die Hausnummern der Route – keine Namen.</Li>
          </ul>
          <H>5. Cookies</H>
          <P>Wir setzen nur ein technisch notwendiges Anmelde-Cookie. Es gibt kein Tracking, keine Werbung und keine Analyse-Dienste. Schriftarten und Symbole werden vom eigenen Server geladen.</P>
          <H>6. Speicherdauer</H>
          <P>Kontodaten bis zur Löschung des Kontos. Anmeldecodes höchstens einen Tag, Nachweisdokumente höchstens 14 Tage. Nach einer Umzugsmeldung endet der Zugang zur bisherigen Adresse sofort.</P>
          <H>7. Ihre Rechte</H>
          <P>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Ihr Konto können Sie jederzeit selbst in der App unter <b style={sx('font-weight:500')}>Profil → Konto löschen</b> löschen oder per E-Mail an den Verantwortlichen.</P>
        </>}
        <div style={sx('display:flex;gap:16px;margin-top:26px;font-size:13px')}><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></div>
      </div>
    </Shell>
  );
}
