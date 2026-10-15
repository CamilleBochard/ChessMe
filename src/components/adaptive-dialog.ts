// A dialog that sits in the page on a wide screen and opens over the board on
// a phone: the settings of a game and the choice of pieces. On a wide screen
// it is shown in place, as part of the left-hand column; on a phone it stays
// closed until the visitor asks for it, then opens as a modal. The breakpoint
// is the one the stylesheets switch to three columns at.

/** The media query of a screen wide enough for the three columns. */
export const WIDE_SCREEN = '(min-width: 960px)';

export interface AdaptiveDialog {
  /** On a phone, opens the dialog over the page; on a wide screen it is already in view. */
  openOnPhone(): void;
  /** On a phone, closes it, once the visitor has chosen. */
  closeOnPhone(): void;
  /** Whether a wide screen shows the dialog in place; a game in progress hides its settings, for instance. */
  showOnWideScreen(shown: boolean): void;
}

/**
 * Takes charge of the dialog, shown in place on a wide screen to begin with
 * when asked. The dialog's button marked data-dialog-close closes it; the
 * stylesheet shows that button only while the dialog is a modal.
 */
export function adaptiveDialog(dialog: HTMLDialogElement, shownOnWideScreen: boolean): AdaptiveDialog {
  const wideScreen = window.matchMedia(WIDE_SCREEN);
  let isShownInPlace = shownOnWideScreen;

  /**
   * Puts the dialog in the state the screen calls for. In place it is opened
   * through its attribute rather than show(), which would move the focus to
   * it as the page loads.
   */
  function place(): void {
    const isModal = dialog.open && dialog.matches(':modal');
    if (wideScreen.matches) {
      if (isModal) {
        dialog.close();
      }
      dialog.toggleAttribute('open', isShownInPlace);
      return;
    }
    if (dialog.open && !isModal) {
      dialog.removeAttribute('open');
    }
  }

  const closeButton = dialog.querySelector<HTMLButtonElement>('[data-dialog-close]');
  closeButton?.addEventListener('click', () => {
    dialog.close();
  });

  wideScreen.addEventListener('change', place);
  place();

  return {
    openOnPhone(): void {
      if (!wideScreen.matches && !dialog.open) {
        dialog.showModal();
      }
    },
    closeOnPhone(): void {
      if (!wideScreen.matches && dialog.open) {
        dialog.close();
      }
    },
    showOnWideScreen(shown: boolean): void {
      isShownInPlace = shown;
      place();
    },
  };
}
