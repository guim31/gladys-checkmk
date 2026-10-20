# Checkmk

Hol dein [Checkmk](https://checkmk.com/)-Monitoring in Gladys: Jeder Host wird
ein Gerät (erreichbar, Services in WARN, CRIT und UNKNOWN, unbehandelte
Probleme, Wartungszeit), ein Gerät „Checkmk“ fasst die ganze Site zusammen, und
deine Szenen reagieren, wenn ein Host ausfällt oder ein Service ein Problem hat
— ein rotes Licht, wenn das NAS ausfällt, eine Nachricht, wenn eine Festplatte
CRIT ist. Eine Szene kann auch die Probleme eines Hosts quittieren, und ein
Widget im Dashboard listet die laufenden Probleme auf.

Die Integration liest die REST-API deiner Checkmk-Site in deinem lokalen
Netzwerk, mit einem Automationsbenutzer. Nichts läuft über eine Cloud.

Getestet mit einem echten Checkmk 2.5 Community (offizielles Docker-Image, ein
von seinem Agenten überwachter Host, Hosts DOWN und UNREACH, auf WARN und CRIT
gezwungene lokale Checks, eine Wartungszeit); 2.2 bis 2.4 nur über dieselbe
dokumentierte API. Rückmeldungen sind willkommen:
[github.com/guim31/gladys-checkmk/issues](https://github.com/guim31/gladys-checkmk/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Checkmk 2.2 oder neuer, jede Edition (Community, früher Raw, inklusive),
  erreichbar vom Gladys-Rechner aus.
- Einen Automationsbenutzer für Gladys. Die Rolle „Normal monitoring user“
  genügt: Er sieht die Hosts seiner Kontaktgruppen und darf ihre Probleme
  quittieren.

## Erste Schritte

### 1. Einen Automationsbenutzer anlegen

Öffne in Checkmk **Setup → Users → Add user**:

- **Username**: z. B. `gladys`;
- **Authentication**: „Automation secret for machine accounts“, und kopiere
  das Geheimnis;
- **Roles**: „Normal monitoring user“;
- **Contact groups**: die Gruppen der Hosts, die du verfolgen willst
  (standardmäßig `all`).

Speichere und **aktiviere dann die Änderungen**.

### 2. Die Integration konfigurieren

Öffne in Gladys die Konfiguration der Integration:

- **Adresse der Site**: die Adresse, mit der du Checkmk öffnest, samt Namen
  der Site, z. B. `http://192.168.1.2/meinesite`. Jede aus dem Browser
  kopierte Seite der Site funktioniert auch.
- **Automationsbenutzer** und **Automationsgeheimnis**: der Benutzer aus
  Schritt 1.
- **Ordner (optional)**: der Pfad eines Setup-Ordners, z. B. `/homelab`,
  Unterordner inklusive. Das ist der Pfad des Ordners (sein Name in der URL),
  nicht immer sein Titel. Leer: alle Hosts, die der Benutzer sieht.
- **Host-Labels (optional)**: `schlüssel:wert`, durch Kommas getrennt, z. B.
  `gladys:yes`; ein Host muss alle tragen. Ein Schlüssel allein akzeptiert
  jeden Wert.
- **Aktualisierungsintervall**: 30 Sekunden bis 5 Minuten (standardmäßig
  1 Minute).
- **Quittieren aus Szenen erlauben**: Deaktiviere es, um die Aktion zum
  Quittieren auszuschalten.
- **Selbstsignierte Zertifikate akzeptieren**: für eine `https://`-Adresse,
  deren Zertifikat auch dein Browser nicht anerkennt.
- **Sprache der Namen**: Sprache der Funktionsnamen und der Szenen-Ergebnisse.

Speichere und klicke dann auf **Verbindung testen**: Das zeigt die Version
von Checkmk, die Anzahl der Hosts, der ausgefallenen Hosts und der Services
mit Problem.

### 3. Die Geräte hinzufügen

Öffne den Tab **Entdecken** der Integration und füge die Hosts hinzu, die du
verfolgen willst, und das Gerät „Checkmk“, wenn du die Summen möchtest. Die
Szenen-Auslöser funktionieren für jeden Host, ob in Gladys angelegt oder
nicht.

## Die Geräte

Jeder **Host**:

| Funktion              | Wert                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| Host UP               | 1 UP, 0 DOWN oder UNREACH; leer, solange der Host PENDING ist          |
| Services WARN         | Anzahl der Services in WARN                                            |
| Services CRIT         | Anzahl der Services in CRIT                                            |
| Services UNKNOWN      | Anzahl der Services in UNKNOWN                                         |
| Unbehandelte Probleme | Host- und Service-Probleme, weder quittiert noch in einer Wartungszeit |
| In Wartungszeit       | 1, solange der Host in einer geplanten Wartungszeit ist                |

Das Gerät **Checkmk**: Hosts DOWN (DOWN oder UNREACH), Services WARN, Services
CRIT, Services UNKNOWN und Unbehandelte Probleme, über die Hosts der
Konfiguration.

Die Werte werden nur an Gladys gesendet, wenn sie sich ändern, sonst alle
6 Stunden.

## Dashboard

Das Widget **Checkmk-Probleme** zeigt drei Kacheln — „Hosts DOWN“, „Services
CRIT“, „Unbehandelt“ — und die Probleme: Hosts DOWN, dann UNREACH, dann
Services CRIT, UNKNOWN und WARN, die neuesten zuerst. Jede Zeile nennt den
Service und seinen Zustand, den Host, ✓ wenn quittiert und ⏸ in einer
Wartungszeit. Höchstens zehn Zeilen. **Aktualisieren** liest Checkmk neu. In
seinen Einstellungen kannst du Hosts wählen, um nur deren Probleme zu zeigen
(leer: alle Hosts).

## Szenen

### Auslöser

- **Ein Host fällt aus**: Ein Host wird DOWN oder UNREACH. Filter: Hosts
  (leer: beliebig). Variablen: Hostname, Zustand (DOWN, UNREACH). Ein Host,
  der von DOWN zu UNREACH wechselt, wird nicht zweimal gemeldet.
- **Ein Host ist wieder da**: Ein als ausgefallen gemeldeter Host ist wieder
  UP. Variablen: Hostname, Dauer in Minuten.
- **Ein Service hat ein Problem**: Ein Service wird WARN, CRIT oder UNKNOWN
  oder wechselt zwischen ihnen (zum Beispiel von WARN zu CRIT). Filter: Hosts,
  Zustände (leer: beliebig; für „nur CRIT“ wähle CRIT). Variablen: Hostname,
  Service, Zustand, Check-Ausgabe.
- **Ein Service ist wieder OK**: Ein als Problem gemeldeter Service ist wieder
  OK. Filter: Hosts, der zuletzt gemeldete Problemzustand. Variablen:
  Hostname, Service, letzter Problemzustand, Dauer in Minuten.
- **Checkmk antwortet nicht mehr**: Die REST-API antwortet zweimal
  hintereinander nicht (Variablen: Adresse der Site, Fehler).

Probleme, die beim Start der Integration schon bestehen, werden nicht
gemeldet. Eine Änderung, die passiert, während Gladys oder die Integration neu
startet, wird beim nächsten Lesen einmal gemeldet. Ein Problem in einer
Wartungszeit (des Service oder seines Hosts) wird nicht gemeldet, da Checkmk
es auch nicht meldet; besteht es am Ende der Wartungszeit noch, wird es dann
gemeldet.

### Aktionen

- **Probleme eines Hosts quittieren**: quittiert in Checkmk das Host-Problem
  (DOWN, UNREACH) und jeden seiner Services mit Problem, der noch nicht
  quittiert ist, mit einem Kommentar (leer: „In Gladys quittiert“). Die
  Quittierung ist dauerhaft (bis der Host UP oder der Service OK ist) und
  sendet keine Benachrichtigung. Gibt die Anzahl der Quittierungen zurück.
  Ausschalten mit „Quittieren aus Szenen erlauben“.
- **Probleme lesen**: zählt und listet die Probleme eines Hosts oder aller
  Hosts für die nächsten Aktionen: Anzahl, unbehandelt, Hosts DOWN, Services
  CRIT, WARN und UNKNOWN, und die Liste „Host: Problem“.

### Szenen-Ideen

- **Ein rotes Licht, wenn das NAS ausfällt**: Auslöser „Ein Host fällt aus“,
  Host NAS → schalte die Wohnzimmerlampe auf Rot und sende
  `{{triggerEvent.data.host}}: {{triggerEvent.data.state_name}}`.
- **Nur kritische Services**: Auslöser „Ein Service hat ein Problem“, Zustand
  CRIT → Nachricht `{{triggerEvent.data.host}} / {{triggerEvent.data.service}}:
{{triggerEvent.data.output}}`.
- **Morgenbericht**: jeden Tag um 8:00 Uhr „Probleme lesen“ → sende die Anzahl
  und die Liste, wenn die Anzahl über 0 liegt.
- **Vom Sofa aus gesehen**: Ein Button im Dashboard oder eine
  Zigbee-Fernbedienung startet „Probleme eines Hosts quittieren“ für das NAS.

## Fehlerbehebung

- **„Benutzer oder Automationsgeheimnis abgelehnt“**: Prüfe den Benutzer (ein
  Automationsbenutzer, kein Benutzer mit Passwort) und sein Geheimnis unter
  Setup → Users, und ob die Änderungen aktiviert sind.
- **„Checkmk antwortet nicht“**: Prüfe die Adresse vom Gladys-Rechner aus.
  `localhost` ist der Container der Integration selbst: Nimm die IP-Adresse
  des Checkmk-Rechners.
- **„keine Checkmk-Site unter dieser Adresse“**: Der Name der Site fehlt in
  der Adresse oder ist falsch: Er ist der erste Teil des Pfads, `/meinesite`
  in `http://192.168.1.2/meinesite/check_mk/`.
- **„kein Host sichtbar“**: Der Monitoring-Kern der Site ist gestoppt (`omd
status`), oder der Benutzer ist in keiner Kontaktgruppe der Hosts.
- **„Zertifikat abgelehnt“**: Aktiviere „Selbstsignierte Zertifikate
  akzeptieren“, oder nimm die `http://`-Adresse im lokalen Netzwerk.
- **Ein Host fehlt**: Er liegt außerhalb des Ordners oder der Labels, oder er
  ist in keiner Kontaktgruppe des Benutzers.
- **Die Quittierung wird abgelehnt**: Die Rolle des Benutzers braucht die
  Berechtigung, Probleme zu quittieren („Normal monitoring user“ hat sie).

## Grenzen

- Eine Checkmk-Site pro Integration (die Hosts entfernter Sites, wenn der
  Benutzer sie von der zentralen Site aus sieht, sind inbegriffen).
- Nur Host- und Service-Zustände: keine Metriken, kein Inventar.
- „Ein Service ist wieder OK“ wird auch ausgelöst, wenn ein Service mit
  Problem aus dem Monitoring entfernt wird; ein aus Checkmk oder aus dem
  Bereich entfernter Host endet still.
- Höchstens 30 Szenen-Ereignisse pro Lesevorgang: Ein Netzwerkausfall kann
  Dutzende auf einmal auslösen; der Rest folgt bei den nächsten Lesevorgängen.
- Kein Kontingent für die REST-API: Jedes Lesen sendet zwei Anfragen (einmal
  pro Stunde drei, für die Version).

Nicht mit der Checkmk GmbH verbunden. Checkmk ist eine Marke der Checkmk GmbH.
