import type { Messages } from "../en";

/** Camera permission overlay – French */
export const camera: Messages["camera"] = {
  illustration: "Caméra",
  waiting: "En attente de l'accès à la caméra…",
  allow: "Veuillez autoriser la caméra pour scanner le livre.",
  denied: "L'accès à la caméra a été refusé.",
  enable: "Pour scanner le livre et afficher le contenu interactif, veuillez autoriser la caméra dans les réglages de votre navigateur.",
  chromeTitle: "Pour autoriser la caméra dans Chrome :",
  chromeSteps: [
    "Touchez l'icône de cadenas / réglages dans la barre d'adresse",
    "Choisissez « Paramètres des sites »",
    "Autorisez la caméra",
    "Rechargez la page",
  ],
  firefoxTitle: "Pour autoriser la caméra dans Firefox :",
  firefoxSteps: [
    "Touchez l'icône de cadenas dans la barre d'adresse",
    "Effacez le réglage actuel",
    "Rechargez la page et autorisez l'accès lorsque c'est demandé",
  ],
  safariTitle: "Pour autoriser la caméra dans Safari :",
  safariSteps: [
    "Ouvrez les réglages de la page (« aA » dans la barre d'adresse) ou les réglages de Safari",
    "Allez dans Sites web > Caméra",
    "Trouvez ce site et choisissez « Autoriser »",
    "Rechargez la page",
  ],
  otherTitle: "Pour autoriser la caméra :",
  otherSteps: [
    "Vérifiez les autorisations de caméra dans les réglages de votre navigateur",
    "Autorisez ce site à utiliser votre caméra",
    "Rechargez la page",
  ],
};
