/**
 * The ☰ menu's way into the experiences page (#348): *New experience…* and *Import…* (the top bar's account menu, on the
 * experiences page) ask the page to open the New flow – with *From an export* chosen for Import. The page takes the request
 * and clears it.
 */
class ExperiencesMenu {
  request = $state<"new" | "import" | null>(null);

  ask(kind: "new" | "import"): void {
    this.request = kind;
  }

  /** The request, once – the page opens it */
  take(): "new" | "import" | null {
    const kind = this.request;
    this.request = null;
    return kind;
  }
}

export const experiencesMenu = new ExperiencesMenu();
