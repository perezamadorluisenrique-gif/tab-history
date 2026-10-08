# Tab History

Keeps each tab's back and forward history across restarts, and adds commands to move, maximize and close tabs.

Obsidian remembers where each tab has been, but only until you quit. With Tab History the back and forward arrows of every tab still work after a restart, and the commands Obsidian lacks for arranging tabs are there.

## History across restarts

Each tab's back and forward lists are saved as you work and put back when Obsidian starts, so the arrows and the "Navigate back" and "Navigate forward" commands pick up where you left off.

- Entries for notes that no longer exist are dropped.
- Each tab keeps its newest 50 entries (change it in the settings).
- Closing a tab forgets its history. Renaming a note keeps the saved entries pointing at it.
- If a future version of Obsidian changes how it keeps tab history, saving turns itself off with one notice and the commands keep working.

## Commands

| Command | What it does |
|---|---|
| Move tab left / right | Swaps the tab with its neighbour. |
| Move tab to position 1 to 8 | Puts the tab at that place in its tab group (or at the end if the group is shorter). |
| Move tab to last position | Puts the tab at the end of its tab group. |
| Toggle maximize active tab | Hides the other panes in the main area so the active tab group fills it. Run it again to bring them back. |
| Close tab and activate the next one | Closes the tab and focuses its neighbour, as a browser does (or the most recently used tab, see the settings). Pinned tabs stay. |
| Toggle sidebar focus lock | Turns the sidebar focus lock on or off. |
| Clear back and forward history of all tabs | Forgets the history of every open tab and everything saved. |

No hotkeys are set; assign your own in **Settings → Hotkeys**.

## Mouse buttons 4 and 5

Click a tab header with the back or forward button of your mouse to go back or forward in **that** tab, even when it is not the active one. You can turn it off in the settings.

## Back and forward arrows

Hover an arrow in the tab header to see where it goes and how many more entries are behind it, such as "Back to Meeting notes (3 more)". Right-click an arrow (or long-press it on a touch screen) to list that tab's back or forward history and jump straight to an entry.

## Sidebar focus lock

Off by default. When on, clicking in a sidebar or opening a note from one keeps the focus in the editor, so your next keystrokes go to the note. Commands that open a sidebar still show it. Toggle it from the settings or with the command **Toggle sidebar focus lock**.

## Settings

- **Remember history across restarts** (on)
- **Entries kept per tab** (50)
- **Mouse buttons 4 and 5** (on)
- **After closing a tab, activate**: the next tab, or the most recently used tab
- **Sidebar focus lock** (off)
- **Clear history**

## Installation

In Obsidian, open **Settings → Community plugins → Browse** and search for "Tab History".

## More plugins by Siulved54

| Plugin | What it does | Source |
| --- | --- | --- |
| [Shared Blocks](https://obsidian.md/plugins?id=shared-blocks) | Write a block of text once and reuse it in any note. Edit the source and every reference re-renders live. | [shared-blocks](https://github.com/perezamadorluisenrique-gif/shared-blocks) |
| [Text Case and Cleanup](https://obsidian.md/plugins?id=text-format) | Change case, make camelCase or slugs, sort lines and remove duplicates, and repair text pasted out of a PDF, without touching code or URLs. | [text-format](https://github.com/perezamadorluisenrique-gif/text-format) |
| [Typography as You Type](https://obsidian.md/plugins?id=typography-as-you-type) | Curly quotes, dashes and ellipses as you type, kept out of code and maths, with Backspace to take one back. | [smart-typography-plugin](https://github.com/perezamadorluisenrique-gif/smart-typography-plugin) |
| [Section Numbering](https://obsidian.md/plugins?id=section-numbering) | Number headings as an outline (1, 1.1, 1.2) and keep every link to them working when they renumber. | [section-numbering](https://github.com/perezamadorluisenrique-gif/section-numbering) |
| [Spreadsheet to Table](https://obsidian.md/plugins?id=spreadsheet-to-table) | Paste cells from Excel or Google Sheets as a Markdown table with a real header, insert CSV files, and copy tables back out. | [spreadsheet-to-table](https://github.com/perezamadorluisenrique-gif/spreadsheet-to-table) |
| [Hybrid Line Numbers](https://obsidian.md/plugins?id=hybrid-line-numbers) | Relative and hybrid line numbers for Vim-style jumps, where a folded section counts as one line. | [hybrid-line-numbers](https://github.com/perezamadorluisenrique-gif/hybrid-line-numbers) |
| [List Item Callouts](https://obsidian.md/plugins?id=list-item-callouts) | Colour a single list item as a callout by starting it with a character such as `&`, `!` or `?`. | [list-item-callouts](https://github.com/perezamadorluisenrique-gif/list-item-callouts) |
| [Folder Counts](https://obsidian.md/plugins?id=folder-counts) | See how many notes or files each folder holds, right in the file explorer, with a vault total and folder exclusions. | [folder-counts](https://github.com/perezamadorluisenrique-gif/folder-counts) |
| [Note Reading Time](https://obsidian.md/plugins?id=note-reading-time) | Reading time of the current note or your selection in the status bar, optionally saved to a property. | [note-reading-time](https://github.com/perezamadorluisenrique-gif/note-reading-time) |
| [Task Rollover](https://obsidian.md/plugins?id=task-rollover) | Roll unfinished tasks from your last daily note into today's when it is created, with a real undo. | [task-rollover](https://github.com/perezamadorluisenrique-gif/task-rollover) |
| [Zoom Into Section](https://obsidian.md/plugins?id=zoom-into-section) | Zoom into a heading or list item to see only it and its contents, with a breadcrumb bar to climb back out. | [zoom-into-section](https://github.com/perezamadorluisenrique-gif/zoom-into-section) |
| [Link Title on Paste](https://obsidian.md/plugins?id=link-title-on-paste) | Paste a web address and get a Markdown link with the page's title, fetched in the background and undone in one step. | [link-title-on-paste](https://github.com/perezamadorluisenrique-gif/link-title-on-paste) |
| [Update Radar](https://obsidian.md/plugins?id=update-radar) | Checks your installed community plugins for updates in the background, shows what changed, and flags the ones that look abandoned. | [community-update-checker](https://github.com/perezamadorluisenrique-gif/community-update-checker) |
| [Dataview to Bases](https://obsidian.md/plugins?id=dataview-to-bases) | Convert Dataview queries into Bases blocks, and see which queries in your vault can be converted. | [dataview-to-bases](https://github.com/perezamadorluisenrique-gif/dataview-to-bases) |
| [Line Editing Commands](https://obsidian.md/plugins?id=line-editing-commands) | Duplicate, join, sort and reverse lines, insert blank lines and jump to a line number, with multi-cursor support. | [line-editing-commands](https://github.com/perezamadorluisenrique-gif/line-editing-commands) |
| [Note Mover Rules](https://obsidian.md/plugins?id=note-mover-rules) | Move notes into folders by ordered rules on tags, properties, titles and paths, with a preview before any bulk move. | [note-mover-rules](https://github.com/perezamadorluisenrique-gif/note-mover-rules) |
| [URL Cards](https://obsidian.md/plugins?id=url-cards) | Shows web addresses as cards with title, description and image, and reads existing cardlink blocks. | [url-cards](https://github.com/perezamadorluisenrique-gif/url-cards) |
| [Vim Config](https://obsidian.md/plugins?id=vim-config) | Loads a vimrc-style file from your vault so your key mappings and editor commands are ready when vim mode starts. | [vim-config](https://github.com/perezamadorluisenrique-gif/vim-config) |
| [Task Archive](https://obsidian.md/plugins?id=task-archive) | Moves completed tasks, with their sub-items, into an archive section or note. | [task-archive](https://github.com/perezamadorluisenrique-gif/task-archive) |

All of them are in the community directory: Settings -> Community plugins ->
Browse, then search for the name.
