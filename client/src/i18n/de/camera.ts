import type { Messages } from "../en";

/** Camera permission overlay – German */
export const camera: Messages["camera"] = {
  illustration: "Kamera",
  waiting: "Warte auf Kamerazugriff…",
  allow: "Bitte erlaube die Kamera, um das Buch zu scannen.",
  denied: "Der Kamerazugriff wurde verweigert.",
  enable: "Um das Buch zu scannen und interaktive Inhalte anzuzeigen, erlaube bitte die Kamera in den Einstellungen deines Browsers.",
  chromeTitle: "Kamerazugriff in Chrome erlauben:",
  chromeSteps: [
    "Tippe auf das Schloss- bzw. Einstellungssymbol in der Adressleiste",
    "Wähle „Website-Einstellungen“",
    "Erlaube die Kamera",
    "Lade die Seite neu",
  ],
  firefoxTitle: "Kamerazugriff in Firefox erlauben:",
  firefoxSteps: [
    "Tippe auf das Schlosssymbol in der Adressleiste",
    "Lösche die aktuelle Einstellung",
    "Lade die Seite neu und erlaube den Zugriff, wenn du gefragt wirst",
  ],
  safariTitle: "Kamerazugriff in Safari erlauben:",
  safariSteps: [
    "Öffne die Seiteneinstellungen („aA“ in der Adressleiste) oder die Safari-Einstellungen",
    "Gehe zu Websites > Kamera",
    "Suche diese Website und wähle „Erlauben“",
    "Lade die Seite neu",
  ],
  otherTitle: "Kamerazugriff erlauben:",
  otherSteps: [
    "Prüfe die Kameraberechtigungen in den Einstellungen deines Browsers",
    "Erlaube dieser Website, deine Kamera zu verwenden",
    "Lade die Seite neu",
  ],
};
