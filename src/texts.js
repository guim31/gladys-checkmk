// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// messages. Four languages, the four of the Gladys interface; German says
// "du", Spanish "usted". test/i18n.test.js checks every table.
//
// The states (UP, DOWN, UNREACH, OK, WARN, CRIT, UNKNOWN) stay the words of
// Checkmk: its interface does not translate them either.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './checkmk/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Checkmk site and an automation user in the configuration.',
    fr: "Saisissez l'adresse de votre site Checkmk et un utilisateur d'automatisation dans la configuration.",
    de: 'Gib die Adresse deiner Checkmk-Site und einen Automationsbenutzer in der Konfiguration ein.',
    es: 'Introduzca la dirección de su sitio Checkmk y un usuario de automatización en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2/mysite',
    fr: 'Adresse incomprise, ex. http://192.168.1.2/monsite',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2/meinesite',
    es: 'Dirección no válida, p. ej. http://192.168.1.2/misitio',
  },
};

// One short explanation per error kind (src/checkmk/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Checkmk does not answer',
    fr: 'Checkmk ne répond pas',
    de: 'Checkmk antwortet nicht',
    es: 'Checkmk no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'user or automation secret refused',
    fr: "utilisateur ou secret d'automatisation refusé",
    de: 'Benutzer oder Automationsgeheimnis abgelehnt',
    es: 'usuario o secreto de automatización rechazado',
  },
  [ERROR_KINDS.CREDENTIALS_MISSING]: {
    en: 'an automation user and its secret are needed',
    fr: "un utilisateur d'automatisation et son secret sont nécessaires",
    de: 'ein Automationsbenutzer und sein Geheimnis sind nötig',
    es: 'se necesitan un usuario de automatización y su secreto',
  },
  [ERROR_KINDS.NOT_CHECKMK]: {
    en: 'no Checkmk site at this address: check the site name',
    fr: 'pas de site Checkmk à cette adresse : vérifiez le nom du site',
    de: 'keine Checkmk-Site unter dieser Adresse: Prüfe den Namen der Site',
    es: 'no hay ningún sitio Checkmk en esta dirección: compruebe el nombre del sitio',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.VERSION]: {
    en: 'Checkmk 2.2 or later is needed',
    fr: 'Checkmk 2.2 ou plus récent est nécessaire',
    de: 'Checkmk 2.2 oder neuer ist nötig',
    es: 'se necesita Checkmk 2.2 o posterior',
  },
  [ERROR_KINDS.NO_HOSTS]: {
    en: 'no host visible: core stopped, or the user is in no contact group',
    fr: "aucun hôte visible : cœur arrêté, ou l'utilisateur n'est dans aucun groupe de contacts",
    de: 'kein Host sichtbar: Kern gestoppt, oder der Benutzer ist in keiner Kontaktgruppe',
    es: 'ningún host visible: núcleo detenido, o el usuario no está en ningún grupo de contactos',
  },
  [ERROR_KINDS.API]: {
    en: 'request refused by Checkmk, see the logs',
    fr: 'requête refusée par Checkmk, voir les logs',
    de: 'Anfrage von Checkmk abgelehnt, sieh in den Protokollen nach',
    es: 'petición rechazada por Checkmk, consulte los registros',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

export const HOST_STATE_NAMES = ['UP', 'DOWN', 'UNREACH'];
export const SERVICE_STATE_NAMES = ['OK', 'WARN', 'CRIT', 'UNKNOWN'];

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} host(s)` : `${count}/${total} host(s)`),
    problems: (down, services) => `${down} host(s) down, ${services} service problem(s)`,
  },
  fr: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} hôte(s)` : `${count}/${total} hôte(s)`),
    problems: (down, services) => `${down} hôte(s) DOWN, ${services} service(s) en problème`,
  },
  de: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} Host(s)` : `${count}/${total} Host(s)`),
    problems: (down, services) => `${down} Host(s) DOWN, ${services} Service-Problem(e)`,
  },
  es: {
    ok: 'OK',
    hosts: (count, total) => (count === total ? `${count} host(s)` : `${count}/${total} host(s)`),
    problems: (down, services) => `${down} host(s) DOWN, ${services} servicio(s) con problemas`,
  },
};

// Scene action messages (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Checkmk site is configured.',
    fr: "Aucun site Checkmk n'est configuré.",
    de: 'Keine Checkmk-Site ist konfiguriert.',
    es: 'No hay ningún sitio Checkmk configurado.',
  },
  unknownHost: {
    en: 'This device is not a Checkmk host.',
    fr: "Cet appareil n'est pas un hôte Checkmk.",
    de: 'Dieses Gerät ist kein Checkmk-Host.',
    es: 'Este dispositivo no es un host de Checkmk.',
  },
  acknowledgeDisabled: {
    en: 'Acknowledging is turned off in the configuration of the integration.',
    fr: "L'acquittement est désactivé dans la configuration de l'intégration.",
    de: 'Das Quittieren ist in der Konfiguration der Integration ausgeschaltet.',
    es: 'El reconocimiento está desactivado en la configuración de la integración.',
  },
  acknowledgeRefused: {
    en: 'Checkmk refused to acknowledge: check that the automation user may acknowledge problems.',
    fr: "Checkmk a refusé l'acquittement : vérifiez que l'utilisateur d'automatisation peut acquitter.",
    de: 'Checkmk hat das Quittieren abgelehnt: Prüfe, ob der Automationsbenutzer Probleme quittieren darf.',
    es: 'Checkmk rechazó el reconocimiento: compruebe que el usuario de automatización puede reconocer problemas.',
  },
  defaultComment: {
    en: 'Acknowledged from Gladys',
    fr: 'Acquitté depuis Gladys',
    de: 'In Gladys quittiert',
    es: 'Reconocido desde Gladys',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
