import { useId, useRef } from "react";

export interface SettingsTab {
  readonly id: string;
  readonly label: string;
  readonly panel: React.ReactNode;
}

/**
 * The Settings page's subjects, one at a time.
 *
 * Settings started as one scrolling column and grew four unrelated subjects:
 * provider keys, appearance, stored data, and version information. Someone who
 * came to change the theme had to scroll past a wall of API-key entry to reach
 * it, and the page gave no sense of how much of it there was.
 *
 * Built here rather than reached for from a library so the keyboard contract is
 * the real one: a tablist is ONE stop in the page's tab order and the arrow
 * keys move within it. Rendering four buttons and calling them tabs would put
 * four stops in the order and leave a screen reader with no idea they were
 * alternatives to each other.
 */
export function SettingsTabs({
  tabs,
  active,
  onActiveChange,
}: {
  tabs: readonly SettingsTab[];
  /**
   * Which tab is open, held by the shell.
   *
   * Not local state: this page unmounts on every sidebar click, so a local
   * selection sent the analyst back to the first tab every time they looked at
   * something else and returned.
   */
  active: number;
  onActiveChange: (index: number) => void;
}): React.JSX.Element {
  const setActive = onActiveChange;
  const baseId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const tabId = (index: number): string => `${baseId}-tab-${index}`;
  const panelId = (index: number): string => `${baseId}-panel-${index}`;

  /**
   * Arrow keys select AND move focus, which is the automatic-activation
   * pattern. It suits this page: every panel is cheap to render and nothing
   * here is destructive, so arrowing through them to look is the behaviour
   * somebody expects rather than a series of accidental commits.
   */
  const move = (delta: number): void => {
    const next = (active + delta + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      buttons.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(tabs.length - 1);
      buttons.current[tabs.length - 1]?.focus();
    }
  };

  return (
    <div className="settings-tabs">
      <div className="settings-tabs__list" role="tablist" aria-label="Settings sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tabId(index)}
            aria-selected={index === active}
            aria-controls={panelId(index)}
            /*
             * Only the selected tab is reachable with Tab. That is what makes
             * the tablist one stop rather than four, and it is why `move` has
             * to place focus itself — the browser cannot move to an element it
             * has been told to skip.
             */
            tabIndex={index === active ? 0 : -1}
            className={`settings-tabs__tab${index === active ? " settings-tabs__tab--active" : ""}`}
            onClick={() => setActive(index)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/*
        Every panel is mounted; the inactive ones are `hidden`.
        
        Unmounting them threw away their state — the catalogue panel's fetched
        balance and any error it was showing vanished the moment the analyst
        looked at another tab, and had to be fetched again. The original reason
        for unmounting was that hidden panels would keep running effects, and
        that reason went away when the catalogue's first fetch moved to the
        shell: no panel here fetches on mount any more.

        `hidden` rather than CSS, so the accessibility tree agrees with the
        screen and a query for a control on another tab finds nothing.
      */}
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(index)}
          aria-labelledby={tabId(index)}
          className="settings-tabs__panel"
          hidden={index !== active}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
