# Robots aspiradores Ultenic en Gladys

Esta integración lleva sus robots aspiradores **Ultenic** a Gladys: ve su estado,
su batería y sus estadísticas de limpieza, y puede iniciar una limpieza,
detenerla, cambiar el nivel de aspiración o enviarlos de vuelta a su base —
desde el panel, desde una escena o desde el chat.

## Cómo funciona y por qué necesita una cuenta de Tuya

Los robots aspiradores Ultenic están construidos sobre la plataforma **Tuya**: la
aplicación Ultenic es una aplicación Tuya con marca propia, y los aspiradores
hablan con la nube de Tuya, no con su red local. No existe ningún protocolo
local documentado, así que esta integración pasa por la **nube IoT de Tuya** — el
mismo camino que siguen Home Assistant y las demás integraciones de código
abierto para el hardware basado en Tuya.

En concreto: crea un **proyecto Cloud** gratuito en la Tuya IoT Platform, lo
autoriza a través de la cuenta de la aplicación a la que pertenece el aspirador,
y le da a Gladys el Access ID y el Access Secret del proyecto. Gladys lee y
controla entonces sus aspiradores a través de ese proyecto.

Ese paso de autorización es precisamente el que falla con Ultenic — lea la
siguiente sección antes de empezar, de ella depende el resto del procedimiento.

> Todo lo que sigue es gratuito. El periodo de prueba de un proyecto Cloud de
> Tuya debe prolongarse manualmente cada pocos meses (un botón en la consola) —
> consulte la sección de solución de problemas.

## ⚠️ Lea esto primero: la aplicación Ultenic no puede escanear el código QR de Tuya

El procedimiento oficial de Tuya le pide escanear un código QR desde la
aplicación para vincular su cuenta al proyecto Cloud. **Ese escáner no existe en
la aplicación Ultenic.** El que encuentra en la gestión de grupos / hogares es
otro escáner: solo lee invitaciones para unirse a un hogar. Muéstrele el código
QR de la consola de Tuya y simplemente no lo reconoce — la ventana se cierra y
vuelve a la pantalla anterior, sin ningún mensaje de error.

No ha hecho nada mal: Tuya solo hace que ese código QR sea legible por las
aplicaciones **Tuya Smart** y **Smart Life**, además de unas pocas aplicaciones
de marca expresamente autorizadas. Ultenic no es una de ellas.

Dos caminos, por orden de preferencia:

| Camino                                    | Lo que cuesta                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| **A. Pasar el aspirador a Smart Life** ✅ | Restablecer y volver a emparejar el aspirador; sale de la aplicación Ultenic |
| **B. Modo «cuenta de la aplicación»**     | Sin código QR, pero en la práctica solo funciona con una cuenta Smart Life   |

El camino A es el que funciona de forma fiable. El camino B se describe más
abajo: evita el código QR, pero no soluciona el hecho de que Tuya no autoriza un
proyecto de terceros a través del esquema de una aplicación de marca.

## Paso 1 — Emparejar el aspirador en Smart Life

Instale **Smart Life** (la aplicación gratuita de Tuya, para iOS y Android) y
empareje allí su aspirador, en una red Wi-Fi de **2,4 GHz**.

Un dispositivo Tuya pertenece a una sola cuenta a la vez: para pasarlo de
Ultenic a Smart Life tiene que **eliminarlo de la aplicación Ultenic** (o pulsar
su botón de restablecimiento, normalmente de 5 a 10 segundos) y después
emparejarlo en Smart Life como un dispositivo nuevo.

Lo que pierde: las funciones propias de la aplicación Ultenic (mapa, zonas
prohibidas en algunos modelos). Lo que conserva: la limpieza, la programación,
la potencia de aspiración y la vuelta a la base — es decir, todo lo que controla
esta integración.

> Compartir el dispositivo no sirve como alternativa: el proyecto Cloud solo ve
> los dispositivos que **pertenecen** a la cuenta vinculada, no los que se han
> compartido con ella.

Compruebe que puede iniciar y detener el aspirador desde Smart Life antes de
continuar: si la aplicación no puede controlarlo, Gladys tampoco.

## Paso 2 — Crear un proyecto Cloud de Tuya

1. Cree una cuenta en la [Tuya IoT Platform](https://iot.tuya.com/) (es la
   consola para desarrolladores, una cuenta distinta de la de la aplicación).
2. Vaya a **Cloud → Development → Create Cloud Project**.
3. Póngale el nombre que quiera. En **Industry** elija _Smart Home_, en
   **Development Method** elija _Smart Home_.
4. En **Data Center**, elija aquel en el que está su cuenta Ultenic — es el campo
   en el que más gente se equivoca:
   - Europa → _Central Europe_
   - Reino Unido → _Western Europe_
   - Estados Unidos → _Western America_ (o _Eastern America_)
   - India → _India_
   - China → _China_
5. En la pantalla siguiente, asegúrese de que los servicios de API **IoT Core** y
   **Authorization** están activados para el proyecto (lo están por defecto).

En la página **Overview** del proyecto tiene ahora un **Access ID / Client ID**
y un **Access Secret / Client Secret**. Téngalos a mano.

## Paso 3 — Vincular su cuenta Smart Life al proyecto

1. En el proyecto, abra la pestaña **Devices** y después **Link App Account**.
2. Haga clic en **Add App Account**: aparece un código QR.
3. En **Smart Life**, abra la pestaña **Yo** (perfil) y use el icono de escaneo
   **arriba a la derecha** — no el de la gestión del hogar. Escanee el código QR
   y confirme.
4. Sus dispositivos aparecen en la lista **All Devices** del proyecto. Si su
   aspirador no está, el centro de datos del proyecto no coincide con el de su
   cuenta — vuelva a crear el proyecto en el centro de datos correcto.

Ya que está en esta pantalla, anote el **UID** que aparece junto a la cuenta
vinculada: es opcional, pero útil si ha vinculado varias cuentas y solo quiere
una de ellas en Gladys.

### Si el código QR no funciona: el modo «cuenta de la aplicación»

El código QR caduca rápido y algunas cuentas simplemente lo rechazan. En ese
caso, la integración puede autenticarse **directamente como el usuario de la
aplicación**, sin ningún código QR: ponga el campo **Modo de autorización** en
_Cuenta de la aplicación_ e indique el correo electrónico, la contraseña, el
prefijo del país y el esquema de la aplicación.

El **esquema** es el código Tuya de la aplicación a la que pertenece la cuenta:
`smartlife` para Smart Life, `tuyaSmart` para Tuya Smart.

Una advertencia honesta sobre este modo: no es una puerta trasera para mantener
el aspirador en la aplicación Ultenic. Una aplicación de marca tiene su propio
esquema, y Tuya normalmente no permite que un proyecto Cloud de terceros se
autentique con él — el intento devuelve «user not exist» o «permission deny». El
campo es de texto libre, así que nada le impide probarlo antes de cambiar el
aspirador de aplicación: el botón **Probar la conexión** responde en unos
segundos.

## Paso 4 — Configurar la integración en Gladys

Instale la integración Ultenic, abra su pestaña **Configuración** y rellene:

| Campo                          | Qué poner                                                              |
| ------------------------------ | ---------------------------------------------------------------------- |
| **Centro de datos de Tuya**    | El que eligió en el paso 2                                             |
| **Access ID**                  | De la página Overview del proyecto                                     |
| **Access Secret**              | De la página Overview del proyecto                                     |
| **Modo de autorización**       | _Cuenta vinculada_ si el QR funcionó; si no, _Cuenta de la aplicación_ |
| **UID de usuario de Tuya**     | Opcional — déjelo vacío para tomar todas las cuentas vinculadas        |
| **Intervalo de actualización** | Cada cuánto se leen los aspiradores (30 s es un buen valor)            |

En el modo _Cuenta de la aplicación_ se usan cuatro campos más: **Esquema de la
aplicación** (`smartlife`), **Correo de la cuenta de la aplicación**,
**Contraseña de la cuenta de la aplicación** y **Prefijo del país** (`34` para
España, `33` para Francia). En el modo _Cuenta vinculada_ se ignoran.

Haga clic en **Guardar configuración** y luego en **Probar la conexión**. La respuesta debería indicar el
número de aspiradores encontrados y sus nombres.

## Paso 5 — Crear los dispositivos

Abra la pestaña **Descubrir** de la integración: sus aspiradores aparecen allí.
Haga clic en **Añadir a Gladys** en cada uno que quiera tener en Gladys,
asígnele una habitación y listo.

## Lo que obtiene

Cada aspirador se convierte en un dispositivo de Gladys con:

- **Estado de funcionamiento** (solo lectura) — detenido, en marcha, en pausa,
  error, volviendo a la base, cargando, en la base.
- **Modo de funcionamiento** — póngalo en _Limpiar_ para iniciar una limpieza,
  en _Inactivo_ para detenerla.
- **Modo de limpieza** — el nivel de aspiración, asociado a los modos de
  limpieza de Gladys (_Fregar_ = aspiración desactivada, _Silencioso_ = suave,
  _Auto_ = normal, _Limpieza profunda_ = fuerte/máxima). Solo se aceptan los
  niveles que admite su modelo.
- **Volver a la base** — envía el aspirador a casa.
- **Batería**, en porcentaje.
- **Superficie limpiada**, **Tiempo de limpieza** y **Vida útil restante del
  filtro**, cuando el modelo los informa.

Los sensores solo se añaden si su aspirador los publica realmente, así que dos
modelos Ultenic distintos no ofrecen necesariamente la misma lista de funciones.

En el dispositivo se muestra una insignia **Nube**: pasa a **Inaccesible**
cuando la nube de Tuya informa de que el aspirador está desconectado (base
desenchufada, Wi-Fi caído).

## Solución de problemas

**«Tuya ha rechazado las credenciales (sign invalid)»** — el Access ID o el
Access Secret son incorrectos, o se pegó un espacio junto con ellos. Vuelva a
copiarlos desde la página Overview del proyecto.

**«No se ha encontrado ningún robot aspirador»** — tres causas habituales: el
centro de datos del proyecto no coincide con su cuenta, la cuenta de la
aplicación no está vinculada al proyecto, o el aspirador está emparejado en una
cuenta de la aplicación distinta de la vinculada (lo típico: sigue en la
aplicación Ultenic mientras se vinculó una cuenta Smart Life).

**Escanear el código QR cierra la ventana y no hace nada** — está usando el
escáner de la gestión de grupos de la aplicación Ultenic, que solo lee
invitaciones a un hogar. Ese código QR solo lo pueden leer Tuya Smart y Smart
Life: consulte el recuadro al principio de esta página.

**«user not exist» / «permission deny» en el modo cuenta de la aplicación** — el
esquema de la aplicación no corresponde a la cuenta, o Tuya no autoriza su
proyecto Cloud a través de ese esquema (el caso de una aplicación de marca como
Ultenic). Use una cuenta Smart Life con el esquema `smartlife`.

**«permission deny» / código 1106** — los servicios de API del proyecto no
incluyen IoT Core, o la cuenta vinculada ha caducado. Vuelva a vincular la
cuenta de la aplicación.

**Funcionaba y dejó de hacerlo al cabo de unos meses** — un proyecto Cloud de
Tuya funciona con una suscripción de prueba que caduca. Abra **Cloud →
Development → su proyecto → Service API** y prolongue la prueba (es gratuito y
basta con un clic).

**El estado va por detrás de la aplicación** — la integración consulta la nube
de Tuya con el intervalo que haya configurado. Redúzcalo si quiere una respuesta
más rápida; una sola llamada a la API actualiza todos los aspiradores, así que un
intervalo corto sigue siendo económico.

**El modo Mapear no hace nada** — el modo de funcionamiento de Gladys ofrece el
valor _Mapear_, pero la API de la nube de Tuya no expone ningún comando estándar
de «mapear sin limpiar». La integración lo rechaza explícitamente en lugar de
hacer otra cosa en silencio.
