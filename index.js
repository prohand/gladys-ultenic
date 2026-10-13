// -----------------------------------------------------------------------------
// Entry point of the Ultenic integration for Gladys Assistant.
//
// This file holds NO vacuum logic: it wires the SDK to the device registry
// (src/devices/) which owns the catalog, and to the Tuya client
// (src/ultenic/) which owns the protocol. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, discovers the vacuums and starts the refresh loop.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './src/config.js';
import { DeviceRegistry } from './src/devices/index.js';
import { AUTH_MODES } from './src/ultenic/client.js';

const gladys = new GladysIntegration();
const registry = new DeviceRegistry(gladys);

// Current configuration (hot-reloaded through onConfigUpdated).
let config = normalizeConfig();

// Last application-level status reported to Gladys, so a refresh loop running
// every 30 seconds does not rewrite the same status forever.
let lastReportedStatus = null;

const NOT_CONFIGURED_MESSAGE = {
  en: 'Fill in your Tuya Cloud Access ID and Access Secret to connect your Ultenic vacuums. In app account mode, the e-mail, password and app schema are needed too.',
  fr: 'Renseignez l’Access ID et l’Access Secret de votre projet Tuya Cloud pour connecter vos aspirateurs Ultenic. En mode compte applicatif, l’e-mail, le mot de passe et le schéma sont également nécessaires.',
  de: 'Trage die Access ID und das Access Secret deines Tuya-Cloud-Projekts ein, um deine Ultenic-Saugroboter zu verbinden. Im Modus App-Konto werden außerdem E-Mail-Adresse, Passwort und App-Schema benötigt.',
  es: 'Indique el Access ID y el Access Secret de su proyecto Tuya Cloud para conectar sus aspiradores Ultenic. En el modo cuenta de la aplicación, también se necesitan el correo electrónico, la contraseña y el esquema de la aplicación.',
};

/**
 * Report the application-level status, shown in the Configuration screen.
 * Distinct from the container state machine: the container can be RUNNING
 * while the Tuya cloud refuses our credentials.
 * @param {boolean} connected true when the cloud answered
 * @param {object} [message] multi-language reason, when disconnected
 * @returns {Promise<void>} resolves once the status is reported
 */
async function reportConnectionStatus(connected, message) {
  // Same status AND same reason as last time: nothing new to say.
  const status = `${connected}|${message?.en ?? ''}`;
  if (lastReportedStatus === status) {
    return;
  }
  lastReportedStatus = status;
  await gladys.setConnectionStatus(connected, message).catch((err) => {
    logger.error('setConnectionStatus failed', err);
  });
}

/**
 * Turn an error into the multi-language reason shown in the Configuration
 * screen. Tuya business codes are opaque on their own, so the frequent ones
 * are translated into something actionable.
 * @param {Error & { code?: number }} err the error to explain
 * @returns {object} the multi-language message
 */
function explainError(err) {
  if (err.code === 1004 || err.code === 1005) {
    return {
      en: 'Tuya refused the credentials (sign invalid): check the Access ID and Access Secret.',
      fr: 'Tuya a refusé les identifiants (sign invalid) : vérifiez l’Access ID et l’Access Secret.',
      de: 'Tuya hat die Zugangsdaten abgelehnt (sign invalid): Prüfe die Access ID und das Access Secret.',
      es: 'Tuya ha rechazado las credenciales (sign invalid): compruebe el Access ID y el Access Secret.',
    };
  }
  if (err.code === 1106 || err.code === 1114) {
    // Same Tuya code, two very different things to go and check depending on
    // how the project was authorized over the account.
    if (config.auth_mode === AUTH_MODES.USER_CREDENTIALS) {
      return {
        en: 'Tuya refused the app account: check the e-mail, the password, the country code and the app schema (smartlife for Smart Life). A branded app schema is usually not authorized for a third-party project.',
        fr: "Tuya a refusé le compte applicatif : vérifiez l'e-mail, le mot de passe, l'indicatif pays et le schéma (smartlife pour Smart Life). Le schéma d'une application de marque n'est en général pas autorisé pour un projet tiers.",
        de: 'Tuya hat das App-Konto abgelehnt: Prüfe E-Mail-Adresse, Passwort, Ländervorwahl und App-Schema (smartlife für Smart Life). Das Schema einer Marken-App ist für ein Drittprojekt in der Regel nicht freigegeben.',
        es: 'Tuya ha rechazado la cuenta de la aplicación: compruebe el correo electrónico, la contraseña, el prefijo del país y el esquema (smartlife para Smart Life). El esquema de una aplicación de marca no suele estar autorizado para un proyecto de terceros.',
      };
    }
    return {
      en: 'Tuya refused the request: check that the app account is linked to the Cloud project and that the data center matches.',
      fr: 'Tuya a refusé la requête : vérifiez que le compte applicatif est lié au projet Cloud et que le centre de données correspond.',
      de: 'Tuya hat die Anfrage abgelehnt: Prüfe, ob das App-Konto mit dem Cloud-Projekt verknüpft ist und ob das Rechenzentrum übereinstimmt.',
      es: 'Tuya ha rechazado la solicitud: compruebe que la cuenta de la aplicación está vinculada al proyecto Cloud y que el centro de datos coincide.',
    };
  }
  return {
    en: `Could not reach the Tuya cloud: ${err.message}`,
    fr: `Impossible de joindre le cloud Tuya : ${err.message}`,
    de: `Die Tuya-Cloud ist nicht erreichbar: ${err.message}`,
    es: `No se puede contactar con la nube de Tuya: ${err.message}`,
  };
}

/**
 * (Re)build the catalog and (re)start the refresh loop. Called on connection
 * and after every configuration change.
 * @returns {Promise<void>} resolves once the integration is running
 */
async function initialize() {
  registry.stopRefreshLoop();
  registry.setConfig(config);

  if (!isConfigured(config)) {
    logger.warn('Integration not configured yet, waiting for the credentials');
    await reportConnectionStatus(false, NOT_CONFIGURED_MESSAGE);
    return;
  }

  try {
    await registry.discover();
    await registry.publishCatalog();
    await reportConnectionStatus(true);
  } catch (err) {
    logger.error(`Initialization failed: ${err.message}`);
    await reportConnectionStatus(false, explainError(err));
  }

  // The loop starts even after a failed first pass: the cloud may just have
  // been unreachable for a minute, and the next cycle recovers on its own.
  registry.startRefreshLoop((err) => {
    if (err) {
      reportConnectionStatus(false, explainError(err));
      return;
    }
    reportConnectionStatus(true);
  });
}

/**
 * Find the vacuum a Gladys device belongs to, or fail loudly: throwing makes
 * the SDK send a `success: false` acknowledgement, which the UI shows.
 * @param {object} device the Gladys device
 * @returns {object} the vacuum blueprint
 */
function requireVacuum(device) {
  const vacuum = registry.findByExternalId(device.external_id);
  if (!vacuum) {
    throw new Error(`Unknown vacuum ${device.external_id}`);
  }
  return vacuum;
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> reading the vacuums from the Tuya cloud');
  await registry.discover();
  await registry.publishCatalog();
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  const vacuum = requireVacuum(device);
  await vacuum.onSetValue(gladys, { device, feature, value, client: registry.requireClient() });
  // The vacuum takes a few seconds to react: re-read it afterwards so the UI
  // converges on reality rather than on the optimistic value.
  registry.scheduleRefreshAfterCommand(vacuum);
});

// --- Polling: Gladys asks to refresh one device ------------------------------
// The registry refreshes the whole fleet on its own timer, so this only fires
// if the user sets a poll frequency on the device in Gladys. Honoring it costs
// one extra call and keeps the UI's "refresh" button meaningful.
gladys.onPoll(async (device) => {
  await registry.refreshOne(requireVacuum(device));
});

// --- The user added (or updated) a vacuum in Gladys --------------------------
// States published before the device existed were dropped by the core:
// publish its current values again, from memory.
async function republishDevice(device) {
  logger.info(`Device saved in Gladys -> publishing ${device.external_id}`);
  await registry.republishDevice(device.external_id);
}
gladys.onDeviceCreated(republishDevice);
gladys.onDeviceUpdated(republishDevice);

// --- Manifest actions: buttons in the Configuration screen -------------------
gladys.onAction('test_connection', async () => {
  if (!isConfigured(config)) {
    return NOT_CONFIGURED_MESSAGE;
  }
  registry.setConfig(config);
  const vacuums = await registry.requireClient().listVacuums();
  if (vacuums.length === 0) {
    return {
      en: 'Connected to the Tuya cloud, but no robot vacuum was found. Check the data center and that your Ultenic account is linked to the Cloud project.',
      fr: 'Connexion au cloud Tuya réussie, mais aucun aspirateur robot trouvé. Vérifiez le centre de données et que votre compte Ultenic est bien lié au projet Cloud.',
      de: 'Verbindung zur Tuya-Cloud hergestellt, aber kein Saugroboter gefunden. Prüfe das Rechenzentrum und ob dein Ultenic-Konto mit dem Cloud-Projekt verknüpft ist.',
      es: 'Conexión con la nube de Tuya establecida, pero no se ha encontrado ningún robot aspirador. Compruebe el centro de datos y que su cuenta Ultenic está vinculada al proyecto Cloud.',
    };
  }
  const names = vacuums.map((device) => device.name).join(', ');
  return {
    en: `Connected: ${vacuums.length} vacuum(s) found (${names}).`,
    fr: `Connexion réussie : ${vacuums.length} aspirateur(s) trouvé(s) (${names}).`,
    de: `Verbunden: ${vacuums.length} Saugroboter gefunden (${names}).`,
    es: `Conectado: ${vacuums.length} aspirador(es) encontrado(s) (${names}).`,
  };
});

gladys.onAction('refresh_devices', async () => {
  if (!isConfigured(config)) {
    return NOT_CONFIGURED_MESSAGE;
  }
  registry.setConfig(config);
  const vacuums = await registry.discover();
  await registry.publishCatalog();
  return {
    en: `${vacuums.length} vacuum(s) published to the Discover tab.`,
    fr: `${vacuums.length} aspirateur(s) publié(s) dans l’écran Découverte.`,
    de: `${vacuums.length} Saugroboter im Tab „Entdecken“ veröffentlicht.`,
    es: `${vacuums.length} aspirador(es) publicado(s) en la pestaña «Descubrir».`,
  };
});

// The `locate` action targets ONE vacuum chosen by the user: its manifest
// field declares `"source": "devices"`, so the Configuration screen fills the
// select with the integration's own created devices and the handler receives
// the chosen external_id — no identifier to copy by hand.
gladys.onAction('locate', async (fields) => {
  logger.info(`Action locate <- ${fields.device}`);
  const vacuum = registry.findByExternalId(fields.device);
  if (!vacuum) {
    return {
      en: 'This vacuum is not known by the integration anymore. Refresh the vacuum list.',
      fr: 'Cet aspirateur n’est plus connu de l’intégration. Rafraîchissez la liste des aspirateurs.',
      de: 'Dieser Saugroboter ist der Integration nicht mehr bekannt. Aktualisiere die Liste der Saugroboter.',
      es: 'La integración ya no conoce este aspirador. Actualice la lista de aspiradores.',
    };
  }
  await vacuum.locate(registry.requireClient());
  return {
    en: 'Listen: the vacuum is beeping.',
    fr: 'Écoutez : l’aspirateur émet un signal sonore.',
    de: 'Hör hin: Der Saugroboter piept.',
    es: 'Escuche: el aspirador está emitiendo un pitido.',
  };
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await initialize();
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK logs the WebSocket lifecycle itself (under the `gladys-sdk` name):
// these handlers only run the integration's own (re)initialization.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await initialize();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await reportConnectionStatus(false, explainError(err));
  }
});

gladys.on('disconnected', () => {
  registry.stopRefreshLoop();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  registry.stopRefreshLoop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Ultenic integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
