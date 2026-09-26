import type { Messages } from "../en";

/** Camera permission overlay – Dutch */
export const camera: Messages["camera"] = {
  illustration: "Camera",
  waiting: "Wachten op toegang tot de camera…",
  allow: "Sta de camera toe om het boek te scannen.",
  denied: "Toegang tot de camera is geweigerd.",
  enable: "Sta de camera toe in de instellingen van je browser om het boek te scannen en interactieve inhoud te tonen.",
  chromeTitle: "Cameratoegang inschakelen in Chrome:",
  chromeSteps: [
    "Tik op het slot-/instellingenpictogram in de adresbalk",
    "Kies 'Site-instellingen'",
    "Sta de camera toe",
    "Vernieuw de pagina",
  ],
  firefoxTitle: "Cameratoegang inschakelen in Firefox:",
  firefoxSteps: [
    "Tik op het slotpictogram in de adresbalk",
    "Wis de huidige instelling",
    "Vernieuw de pagina en sta toegang toe wanneer daarom wordt gevraagd",
  ],
  safariTitle: "Cameratoegang inschakelen in Safari:",
  safariSteps: [
    "Open de pagina-instellingen ('aA' in de adresbalk) of de Safari-instellingen",
    "Ga naar Websites > Camera",
    "Zoek deze website en kies 'Sta toe'",
    "Vernieuw de pagina",
  ],
  otherTitle: "Cameratoegang inschakelen:",
  otherSteps: [
    "Controleer de camerarechten in de instellingen van je browser",
    "Sta deze site toe je camera te gebruiken",
    "Vernieuw de pagina",
  ],
};
