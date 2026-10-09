# Changelog

The release workflow uses the section named after the version being released
as the release description, so every version needs one. `npm version <x.y.z>`
renames the `Unreleased` heading below to that version.

## 0.3.0

- New commands "Switch to previous tab (most recently used)" and "Show recent tabs": switch tabs in most-recently-used order, across popout windows, remembered across restarts. Bind them to Ctrl+Tab and hold Ctrl to cycle.

## 0.2.0

- Back and forward arrows show the target and how many more entries there are, and a right-click or long-press lists the history to jump straight to an entry. New sidebar focus lock setting, and no more !important in the styles.

## 0.1.0

- Each tab's back and forward history is saved and restored across restarts, with a limit per tab and entries for deleted notes dropped.
- Commands to move a tab left, right, to position 1 to 8 or to the end, to toggle maximizing the active tab, and to close a tab and activate the next one (or the most recently used one).
- Mouse buttons 4 and 5 on a tab header go back or forward in that tab.
