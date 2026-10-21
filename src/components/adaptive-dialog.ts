// A dialog that sits in the page on a wide screen and opens over the board on
// a phone: the settings of a game, the choice of pieces and the stats. On a
// wide screen it is shown in place, as part of the left-hand column; on a
// phone it stays closed until it is asked for. It then opens as a modal, or,
// given a place over the board, stands on the board as part of the page, so
// the visitor can still scroll and use the rest of it. The breakpoint is the
// one the stylesheets switch to three columns at.

/** The media query of a screen wide enough for the three columns. */
export const WIDE_SCREEN = '(min-width: 960px)';

export interface AdaptiveDialog {
  /** On a phone, opens the dialog over the board or the page; on a wide screen it is already in view. */
  openOnPhone(): void;
  /** On a phone, closes it, once the visitor has chosen. */
  closeOnPhone(): void;
  /** Whether a wide screen shows the dialog in place; a game in progress hides its settings, for instance. */
  showOnWideScreen(shown: boolean): void;
}

/**
 * Takes charge of the dialog, shown in place on a wide screen to begin with
 * when asked. On a phone it opens in overBoard when one is given, as a modal
 * otherwise. The dialog's button marked data-dialog-close closes it; the
 * stylesheet shows that button only while the dialog stands apart from the
 * column, as a modal or over the board.
 */
export function adaptiveDialog(
  dialog: HTMLDialogElement,
  shownOnWideScreen: boolean,
  overBoard?: HTMLElement,
): AdaptiveDialog {
  const wideScreen = window.matchMedia(WIDE_SCREEN);
  let isShownInPlace = shownOnWideScreen;
  // Marks where the dialog sits in the column, so that it goes back there
  // when a phone turns into a wide screen.
  const home = document.createComment('adaptive dialog');
  dialog.before(home);

  function isOverBoard(): boolean {
    return dialog.classList.contains('over-board');
  }

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
      if (isOverBoard()) {
        dialog.classList.remove('over-board');
        home.after(dialog);
      }
      dialog.toggleAttribute('open', isShownInPlace);
      return;
    }
    if (dialog.open && !isModal && !isOverBoard()) {
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
      if (wideScreen.matches || dialog.open) {
        return;
      }
      if (overBoard === undefined) {
        dialog.showModal();
        return;
      }
      overBoard.append(dialog);
      dialog.classList.add('over-board');
      // Through its attribute, as in place: the page may have just loaded.
      dialog.toggleAttribute('open', true);
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
