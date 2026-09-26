import type { Messages } from "../en";

/** Camera permission overlay – French */
export const camera: Messages["camera"] = {
  illustration: "Caméra",
  waiting: "En attente de l'accès à la caméra…",
  allow: "Autorise la caméra pour scanner le livre.",
  denied: "L'accès à la caméra a été refusé.",
  enable: "Pour scanner le livre et afficher le contenu interactif, autorise la caméra dans les réglages de ton navigateur.",
  chromeTitle: "Pour autoriser la caméra dans Chrome :",
  chromeSteps: [
    "Touche l'icône de cadenas / réglages dans la barre d'adresse",
    "Choisis « Paramètres des sites »",
    "Autorise la caméra",
    "Recharge la page",
  ],
  firefoxTitle: "Pour autoriser la caméra dans Firefox :",
  firefoxSteps: [
    "Touche l'icône de cadenas dans la barre d'adresse",
    "Efface le réglage actuel",
    "Recharge la page et autorise l'accès lorsque c'est demandé",
  ],
  safariTitle: "Pour autoriser la caméra dans Safari :",
  safariSteps: [
    "Ouvre les réglages de la page (« aA » dans la barre d'adresse) ou les réglages de Safari",
    "Va dans Sites web > Caméra",
    "Trouve ce site et choisis « Autoriser »",
    "Recharge la page",
  ],
  otherTitle: "Pour autoriser la caméra :",
  otherSteps: [
    "Vérifie les autorisations de caméra dans les réglages de ton navigateur",
    "Autorise ce site à utiliser ta caméra",
    "Recharge la page",
  ],
};
