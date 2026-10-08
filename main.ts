import {
  App,
  debounce,
  Menu,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  View,
  WorkspaceLeaf,
  WorkspaceTabs,
} from 'obsidian';

import {
  emptySaved,
  isEmptyTab,
  parseSaved,
  renameInSaved,
  sameSaved,
  sanitizeTab,
  snapshot,
  type SavedHistory,
  type TabHistory,
} from './src/history.ts';
import { blocksActivation, jumpDelta, menuEntries, navLabel, type NavKind } from './src/nav.ts';
import { afterClose, moveIndex, moveItem, type AfterClose, type MoveTarget } from './src/tabs.ts';

interface TabHistorySettings {
  persistHistory: boolean;
  maxEntries: number;
  mouseButtons: boolean;
  afterClose: AfterClose;
  focusLock: boolean;
}

const DEFAULT_SETTINGS: TabHistorySettings = {
  persistHistory: true,
  maxEntries: 50,
  mouseButtons: true,
  afterClose: 'adjacent',
  focusLock: false,
};

interface StoredData extends Partial<TabHistorySettings> {
  history?: unknown;
}

/**
 * `leaf.history` is not in the public typings. `serialize()` and `deserialize()`
 * are what Obsidian itself uses to hand a history over, so the plugin only
 * relies on those two and checks they exist before using them.
 */
interface RawHistory {
  serialize(): { backHistory?: unknown[]; forwardHistory?: unknown[] };
  deserialize(data: { backHistory: unknown[]; forwardHistory: unknown[] }): void;
}

/** Internals the tab commands touch. Each use is feature-checked. */
interface TabsInternals {
  children: WorkspaceLeaf[];
  containerEl: HTMLElement;
  tabHeaderContainerEl?: HTMLElement;
  tabHeaderEls?: HTMLElement[];
}

interface LeafInternals {
  id?: string;
  view?: { backButtonEl?: HTMLElement; forwardButtonEl?: HTMLElement };
  history?: Partial<RawHistory> & { go?: (delta: number) => unknown };
  tabHeaderEl?: HTMLElement;
  activeTime?: number;
  pinned?: boolean;
}

const MAX_CLASS = 'tab-history-hidden';
const MAX_BODY_CLASS = 'tab-history-has-maximized';

function rawHistory(leaf: WorkspaceLeaf): RawHistory | null {
  const history = (leaf as unknown as LeafInternals).history;
  return history && typeof history.serialize === 'function' && typeof history.deserialize === 'function'
    ? (history as RawHistory)
    : null;
}

function leafId(leaf: WorkspaceLeaf): string | null {
  const id = (leaf as unknown as LeafInternals).id;
  return typeof id === 'string' ? id : null;
}

function toTabHistory(raw: ReturnType<RawHistory['serialize']>): TabHistory {
  return {
    back: Array.isArray(raw.backHistory) ? (raw.backHistory as TabHistory['back']) : [],
    forward: Array.isArray(raw.forwardHistory) ? (raw.forwardHistory as TabHistory['forward']) : [],
  };
}

export default class TabHistoryPlugin extends Plugin {
  settings: TabHistorySettings = { ...DEFAULT_SETTINGS };
  private saved: SavedHistory = emptySaved();
  private restored = false;
  private historySupported = true;
  private maximized: { tabs: HTMLElement; hidden: HTMLElement[] } | null = null;
  private focusPatch: { original: unknown; wrapped: unknown; own: boolean } | null = null;
  private revealing = false;
  private lastMenuAt = 0;

  private requestSave = debounce(() => void this.saveHistory(), 1500, true);

  async onload() {
    const data = (await this.loadData()) as StoredData | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
    this.saved = parseSaved(data?.history);

    this.addSettingTab(new TabHistorySettingTab(this.app, this));
    this.registerCommands();

    this.registerEvent(this.app.workspace.on('layout-change', () => {
      this.dropStaleMaximize();
      this.requestSave();
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.requestSave()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.requestSave()));
    // Obsidian waits for what is added here before it closes.
    this.registerEvent(this.app.workspace.on('quit', (tasks) => tasks.addPromise(this.saveHistory())));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      renameInSaved(this.saved, oldPath, file.path);
      this.requestSave();
    }));

    // The main window and every popout window, since each one handles its own mouse buttons.
    this.listenToMouse(window);
    this.registerEvent(this.app.workspace.on('window-open', (_, win) => this.listenToMouse(win)));

    this.installFocusLock();

    this.app.workspace.onLayoutReady(() => this.restoreHistory());
  }

  onunload() {
    this.clearMaximize();
    this.removeFocusLock();
    // Last chance to keep what the user did this session.
    if (this.restored) void this.saveHistory();
  }

  // ---- history persistence -------------------------------------------------

  private exists = (path: string) => this.app.vault.getAbstractFileByPath(path) !== null;

  private liveTabs() {
    const live: { id: string; history: TabHistory }[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      const history = rawHistory(leaf);
      const id = leafId(leaf);
      if (history && id) live.push({ id, history: toTabHistory(history.serialize()) });
    });
    return live;
  }

  private restoreHistory() {
    if (!this.settings.persistHistory) {
      this.restored = true;
      return;
    }
    let supported = true;
    let any = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const history = rawHistory(leaf);
      if (!history) {
        supported = false;
        return;
      }
      const id = leafId(leaf);
      const tab = id ? this.saved.tabs[id] : undefined;
      if (!tab) return;
      try {
        const current = toTabHistory(history.serialize());
        if (!isEmptyTab(current)) return; // the tab already has history of its own
        const clean = sanitizeTab(tab, this.exists, this.settings.maxEntries);
        if (isEmptyTab(clean)) return;
        history.deserialize({ backHistory: clean.back, forwardHistory: clean.forward });
        any = true;
      } catch (error) {
        supported = false;
        console.error('Tab history: could not restore a tab', error);
      }
    });
    if (!supported) {
      this.historySupported = false;
      new Notice('Tab history: this version of Obsidian keeps tab history differently, so saving it is turned off. The tab commands still work.');
    }
    this.restored = true;
    if (any) this.app.workspace.requestSaveLayout();
    this.requestSave();
  }

  private async saveHistory() {
    // Until restore has run, tabs are still empty and would overwrite what is saved.
    if (!this.restored || !this.historySupported) return;
    const next = this.settings.persistHistory
      ? snapshot(this.liveTabs(), this.exists, this.settings.maxEntries)
      : emptySaved();
    if (sameSaved(next, this.saved)) return;
    this.saved = next;
    await this.persist();
  }

  private async persist() {
    const data: StoredData = { ...this.settings, history: this.saved };
    await this.saveData(data);
  }

  async saveSettings() {
    this.settings.maxEntries = Math.max(1, Math.min(500, Math.round(this.settings.maxEntries) || DEFAULT_SETTINGS.maxEntries));
    this.saved = this.settings.persistHistory ? this.saved : emptySaved();
    await this.persist();
    this.requestSave();
    if (this.settings.focusLock) this.leaveSidebar();
  }

  async clearHistory() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      rawHistory(leaf)?.deserialize({ backHistory: [], forwardHistory: [] });
    });
    this.saved = emptySaved();
    await this.persist();
    new Notice('Tab history: cleared the back and forward history of every tab.');
  }

  // ---- commands --------------------------------------------------------------

  private activeTabs(): { leaf: WorkspaceLeaf; tabs: WorkspaceTabs & TabsInternals; index: number } | null {
    const leaf = this.app.workspace.getActiveViewOfType(View)?.leaf ?? this.app.workspace.getMostRecentLeaf();
    if (!leaf) return null;
    const tabs = leaf.parent as unknown;
    if (!(tabs instanceof WorkspaceTabs)) return null;
    const internal = tabs as WorkspaceTabs & TabsInternals;
    if (!Array.isArray(internal.children)) return null;
    const index = internal.children.indexOf(leaf);
    return index === -1 ? null : { leaf, tabs: internal, index };
  }

  private registerCommands() {
    const move = (id: string, name: string, icon: string, target: MoveTarget) => {
      this.addCommand({
        id,
        name,
        icon,
        checkCallback: (checking) => {
          const active = this.activeTabs();
          if (!active || moveIndex(active.index, active.tabs.children.length, target) === null) return false;
          if (!checking) this.moveActiveTab(target);
          return true;
        },
      });
    };
    move('move-tab-left', 'Move tab left', 'arrow-left', { kind: 'left' });
    move('move-tab-right', 'Move tab right', 'arrow-right', { kind: 'right' });
    for (let position = 1; position <= 8; position++) {
      move(`move-tab-to-${position}`, `Move tab to position ${position}`, 'arrow-left-to-line', { kind: 'position', position });
    }
    move('move-tab-to-last', 'Move tab to last position', 'arrow-right-to-line', { kind: 'last' });

    this.addCommand({
      id: 'toggle-maximize-tab',
      name: 'Toggle maximize active tab',
      icon: 'maximize',
      callback: () => this.toggleMaximize(),
    });

    this.addCommand({
      id: 'close-tab-and-activate-adjacent',
      name: 'Close tab and activate the next one',
      icon: 'x',
      checkCallback: (checking) => {
        const active = this.activeTabs();
        if (!active) return false;
        if (!checking) this.closeActiveTab(active);
        return true;
      },
    });

    this.addCommand({
      id: 'toggle-sidebar-focus-lock',
      name: 'Toggle sidebar focus lock',
      icon: 'lock',
      callback: async () => {
        this.settings.focusLock = !this.settings.focusLock;
        await this.saveSettings();
        new Notice(this.settings.focusLock ? 'Tab history: sidebars no longer take the focus.' : 'Tab history: sidebars take the focus again.');
      },
    });

    this.addCommand({
      id: 'clear-history',
      name: 'Clear back and forward history of all tabs',
      icon: 'eraser',
      callback: () => void this.clearHistory(),
    });
  }

  private moveActiveTab(target: MoveTarget) {
    const active = this.activeTabs();
    if (!active) return;
    const { leaf, tabs, index } = active;
    const to = moveIndex(index, tabs.children.length, target);
    if (to === null) return;
    const header = (leaf as unknown as LeafInternals).tabHeaderEl;
    // The headers sit in an inner element of tabHeaderContainerEl.
    const container = header?.parentElement;
    if (!header || !container || !tabs.tabHeaderContainerEl?.contains(container)) {
      new Notice('Tab history: this version of Obsidian arranges tabs differently, so tabs cannot be moved.');
      return;
    }
    // Reorder the model and the headers together, then let Obsidian save the layout.
    tabs.children.splice(0, tabs.children.length, ...moveItem(tabs.children, index, to));
    if (Array.isArray(tabs.tabHeaderEls)) {
      tabs.tabHeaderEls.splice(0, tabs.tabHeaderEls.length, ...moveItem(tabs.tabHeaderEls, index, to));
    }
    const siblings = Array.from(container.children).filter((el) => el !== header);
    container.insertBefore(header, siblings[to] ?? null);
    this.app.workspace.requestSaveLayout();
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private closeActiveTab(active: { leaf: WorkspaceLeaf; tabs: WorkspaceTabs & TabsInternals; index: number }) {
    const { leaf, tabs, index } = active;
    if ((leaf as unknown as LeafInternals).pinned) {
      new Notice('Tab history: this tab is pinned.');
      return;
    }
    const times = tabs.children.map((child) => (child as unknown as LeafInternals).activeTime ?? 0);
    const nextIndex = afterClose(index, times, this.settings.afterClose);
    const next = nextIndex === null ? null : tabs.children[nextIndex];
    leaf.detach();
    if (next) this.app.workspace.setActiveLeaf(next, { focus: true });
  }

  // ---- sidebar focus lock -------------------------------------------------------

  private isSidebar(leaf: WorkspaceLeaf): boolean {
    const root = leaf.getRoot();
    return root === this.app.workspace.leftSplit || root === this.app.workspace.rightSplit;
  }

  /** The leaf that has the focus, if it sits in the main area. */
  private activeMainLeaf(): WorkspaceLeaf | null {
    const leaf = this.app.workspace.getActiveViewOfType(View)?.leaf ?? null;
    return leaf && leaf.getRoot() === this.app.workspace.rootSplit ? leaf : null;
  }

  /**
   * Wraps `workspace.setActiveLeaf`, the one call Obsidian makes whenever a
   * sidebar view is clicked or opened. With the lock on, a sidebar leaf is only
   * revealed (so commands that open a sidebar still show it) and the main-area
   * leaf stays active, so typing goes on in the editor. Everything else passes
   * through unchanged. If the method is missing, the setting does nothing.
   */
  private installFocusLock() {
    const workspace = this.app.workspace as unknown as Record<string, unknown>;
    const found = workspace.setActiveLeaf;
    if (typeof found !== 'function' || this.focusPatch) return;
    const original = found as (...args: unknown[]) => unknown;
    const wrapped = (leaf: WorkspaceLeaf, ...rest: unknown[]): unknown => {
      const blocked =
        leaf instanceof WorkspaceLeaf &&
        blocksActivation(this.settings.focusLock, this.isSidebar(leaf), this.activeMainLeaf() !== null);
      if (!blocked) return original.call(this.app.workspace, leaf, ...rest) as unknown;
      if (!this.revealing) {
        this.revealing = true;
        try {
          this.app.workspace.revealLeaf(leaf).catch(() => undefined);
        } finally {
          this.revealing = false;
        }
      }
    };
    this.focusPatch = { original, wrapped, own: Object.prototype.hasOwnProperty.call(workspace, 'setActiveLeaf') as boolean };
    workspace.setActiveLeaf = wrapped;
  }

  private removeFocusLock() {
    const patch = this.focusPatch;
    if (!patch) return;
    this.focusPatch = null;
    const workspace = this.app.workspace as unknown as Record<string, unknown>;
    // Someone may have wrapped it again on top of ours; then leave that alone
    // (the lock is off for good, since the setting is no longer read).
    if (workspace.setActiveLeaf !== patch.wrapped) return;
    if (patch.own) workspace.setActiveLeaf = patch.original;
    else delete workspace.setActiveLeaf;
  }

  /** Turning the lock on while a sidebar has the focus gives it back to the editor. */
  private leaveSidebar() {
    const active = this.app.workspace.getActiveViewOfType(View)?.leaf;
    if (!active || !this.isSidebar(active)) return;
    const main = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    if (main) this.app.workspace.setActiveLeaf(main, { focus: true });
  }

  // ---- maximize ----------------------------------------------------------------

  /**
   * Hides every sibling on the way from the active tab group up to the main
   * area, so the group fills it. Only a CSS class, no layout changes.
   */
  private toggleMaximize() {
    if (this.maximized) {
      this.clearMaximize();
      return;
    }
    const active = this.activeTabs();
    if (!active) return;
    const tabsEl = active.tabs.containerEl;
    const hidden: HTMLElement[] = [];
    let node: HTMLElement | null = tabsEl;
    while (node && !node.classList.contains('mod-root')) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== node && sibling.instanceOf(HTMLElement)) hidden.push(sibling);
      }
      node = parent;
    }
    if (!node || !node.classList.contains('mod-root')) {
      new Notice('Tab history: only tabs in the main area can be maximized.');
      return;
    }
    if (hidden.length === 0) {
      new Notice('Tab history: this is the only tab group, so there is nothing to hide.');
      return;
    }
    for (const el of hidden) el.classList.add(MAX_CLASS);
    tabsEl.ownerDocument.body.classList.add(MAX_BODY_CLASS);
    this.maximized = { tabs: tabsEl, hidden };
  }

  private clearMaximize() {
    if (!this.maximized) return;
    for (const el of this.maximized.hidden) el.classList.remove(MAX_CLASS);
    this.maximized.tabs.ownerDocument.body.classList.remove(MAX_BODY_CLASS);
    this.maximized = null;
  }

  /** The maximized group was closed: put the layout back. */
  private dropStaleMaximize() {
    if (this.maximized && !this.maximized.tabs.isConnected) this.clearMaximize();
  }

  // ---- mouse buttons -------------------------------------------------------------

  private listenToMouse(win: Window) {
    this.registerDomEvent(win, 'pointerdown', (event) => this.onPointerDown(event), { capture: true });
    // The arrows' tooltip is filled in as the pointer arrives, so it is never out of date.
    this.registerDomEvent(win, 'pointerover', (event) => this.onNavHover(event), { capture: true });
    this.registerDomEvent(win, 'pointerdown', (event) => this.onNavTouch(event), { capture: true });
    this.registerDomEvent(win, 'contextmenu', (event) => this.onNavContext(event), { capture: true });
  }

  // ---- back and forward arrows ---------------------------------------------------

  /** The leaf and direction of a back or forward arrow in a tab header, or null. */
  private navTarget(el: EventTarget | null): { leaf: WorkspaceLeaf; kind: NavKind; button: HTMLElement } | null {
    const button = (el as HTMLElement | null)?.closest?.('.view-header-nav-buttons button') as HTMLElement | null;
    if (!button) return null;
    let found: { leaf: WorkspaceLeaf; kind: NavKind; button: HTMLElement } | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found) return;
      const view = (leaf as unknown as LeafInternals).view;
      if (view?.backButtonEl === button) found = { leaf, kind: 'back', button };
      else if (view?.forwardButtonEl === button) found = { leaf, kind: 'forward', button };
    });
    return found;
  }

  private entriesOf(leaf: WorkspaceLeaf, kind: NavKind): TabHistory['back'] | null {
    const history = rawHistory(leaf);
    if (!history) return null;
    try {
      const tab = toTabHistory(history.serialize());
      return kind === 'back' ? tab.back : tab.forward;
    } catch {
      return null;
    }
  }

  private onNavHover(event: PointerEvent) {
    const target = this.navTarget(event.target);
    if (!target) return;
    const entries = this.entriesOf(target.leaf, target.kind);
    if (!entries) return;
    const { button, kind } = target;
    button.dataset.tabHistoryBase ??= button.getAttribute('aria-label') ?? (kind === 'back' ? 'Navigate back' : 'Navigate forward');
    button.setAttribute('aria-label', navLabel(kind, entries, button.dataset.tabHistoryBase));
  }

  private onNavContext(event: MouseEvent) {
    const target = this.navTarget(event.target);
    if (!target) return;
    const go = (target.leaf as unknown as LeafInternals).history?.go;
    const entries = this.entriesOf(target.leaf, target.kind);
    if (typeof go !== 'function' || !entries) return;
    event.preventDefault();
    event.stopPropagation();
    this.openHistoryMenu(target.leaf, target.kind, entries, event.clientX, event.clientY);
  }

  /**
   * Long-press on an arrow (touch screens). Android also sends `contextmenu`
   * after a long-press and iOS does not, so this one opens the menu itself and
   * `openHistoryMenu` ignores a second request right after.
   */
  private onNavTouch(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    const target = this.navTarget(event.target);
    if (!target) return;
    const win = (target.button.ownerDocument.defaultView ?? window) as Window;
    const { clientX, clientY } = event;
    const cancel = () => {
      win.clearTimeout(timer);
      for (const type of ['pointerup', 'pointercancel', 'pointermove'] as const) win.removeEventListener(type, onEnd, true);
    };
    const onEnd = (e: PointerEvent) => {
      if (e.type === 'pointermove' && Math.hypot(e.clientX - clientX, e.clientY - clientY) < 10) return;
      cancel();
    };
    const timer = win.setTimeout(() => {
      cancel();
      const entries = this.entriesOf(target.leaf, target.kind);
      if (!entries || typeof (target.leaf as unknown as LeafInternals).history?.go !== 'function') return;
      // The tap that ends the press must not also navigate.
      target.button.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true, once: true });
      this.openHistoryMenu(target.leaf, target.kind, entries, clientX, clientY);
    }, 500);
    for (const type of ['pointerup', 'pointercancel', 'pointermove'] as const) win.addEventListener(type, onEnd, true);
  }

  private openHistoryMenu(leaf: WorkspaceLeaf, kind: NavKind, entries: TabHistory['back'], x: number, y: number) {
    const items = menuEntries(entries);
    if (items.length === 0 || Date.now() - this.lastMenuAt < 800) return;
    this.lastMenuAt = Date.now();
    const menu = new Menu();
    for (const item of items) {
      menu.addItem((menuItem) =>
        menuItem
          .setTitle(item.title)
          .setIcon(item.icon)
          .onClick(() => {
            const history = (leaf as unknown as LeafInternals).history;
            if (typeof history?.go === 'function') void history.go(jumpDelta(kind, item.steps));
          }),
      );
    }
    menu.showAtPosition({ x, y });
  }

  /**
   * Obsidian itself reacts to mouse buttons 4 and 5 on `mousedown` (on every
   * platform but Linux) and moves the active tab. Cancelling `pointerdown` in
   * the capture phase stops the browser from sending the `mousedown` and
   * `mouseup` that follow, so only the tab under the pointer moves.
   */
  private onPointerDown(event: PointerEvent) {
    if (!this.settings.mouseButtons || (event.button !== 3 && event.button !== 4)) return;
    const header = (event.target as HTMLElement | null)?.closest?.('.workspace-tab-header');
    if (!header) return;
    let found: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if ((leaf as unknown as LeafInternals).tabHeaderEl === header) found = leaf;
    });
    const leaf = found as WorkspaceLeaf | null;
    const history = leaf ? rawHistory(leaf) : null;
    if (!leaf || !history) return;
    event.preventDefault();
    event.stopPropagation();
    const nav = leaf as unknown as { history: { back(): void; forward(): void } };
    if (event.button === 3) nav.history.back();
    else nav.history.forward();
  }
}

const TEXT = {
  persistHistory: {
    name: 'Remember history across restarts',
    desc: "Save each tab's back and forward history and restore it when Obsidian starts.",
  },
  maxEntries: {
    name: 'Entries kept per tab',
    desc: 'The oldest entries are dropped beyond this number (1 to 500).',
  },
  mouseButtons: {
    name: 'Mouse buttons 4 and 5',
    desc: 'Go back or forward in the tab under the pointer when you click its header with the back or forward mouse button.',
  },
  afterClose: {
    name: 'After closing a tab, activate',
    desc: 'Used by the command that closes a tab and activates another.',
  },
  focusLock: {
    name: 'Sidebar focus lock',
    desc: 'Clicking in a sidebar, or opening a note from one, keeps the focus in the editor so your next keystrokes go to the note. Commands that open a sidebar still show it.',
  },
  clear: {
    name: 'Clear history',
    desc: 'Forget the back and forward history of every open tab and everything saved.',
  },
};

const AFTER_CLOSE_OPTIONS: Record<string, string> = {
  adjacent: 'The next tab (or the previous at the end)',
  recent: 'The most recently used tab',
};

class TabHistorySettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: TabHistoryPlugin,
  ) {
    super(app, plugin);
  }

  /** The settings, described. Obsidian 1.13 and later draws and indexes them; older versions call `display()`. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const d = DEFAULT_SETTINGS;
    return [
      { ...TEXT.persistHistory, control: { type: 'toggle', key: 'persistHistory', defaultValue: d.persistHistory } },
      { ...TEXT.maxEntries, control: { type: 'number', key: 'maxEntries', defaultValue: d.maxEntries, min: 1, max: 500, step: 1 } },
      { ...TEXT.mouseButtons, control: { type: 'toggle', key: 'mouseButtons', defaultValue: d.mouseButtons } },
      {
        ...TEXT.afterClose,
        control: { type: 'dropdown', key: 'afterClose', defaultValue: d.afterClose, options: AFTER_CLOSE_OPTIONS },
      },
      { ...TEXT.focusLock, control: { type: 'toggle', key: 'focusLock', defaultValue: d.focusLock } },
      {
        ...TEXT.clear,
        searchable: false,
        render: (setting: Setting) => this.clearButton(setting),
      },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    Object.assign(this.plugin.settings, { [key]: value });
    await this.plugin.saveSettings();
  }

  private clearButton(setting: Setting) {
    setting.addButton((button) => button.setButtonText('Clear').onClick(() => void this.plugin.clearHistory()));
  }

  /** The pre-1.13 rendering, from the same text. Obsidian skips it once `getSettingDefinitions()` returns anything. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;

    new Setting(containerEl)
      .setName(TEXT.persistHistory.name)
      .setDesc(TEXT.persistHistory.desc)
      .addToggle((t) => t.setValue(settings.persistHistory).onChange((v) => this.setControlValue('persistHistory', v)));
    new Setting(containerEl)
      .setName(TEXT.maxEntries.name)
      .setDesc(TEXT.maxEntries.desc)
      .addText((t) =>
        t.setValue(String(settings.maxEntries)).onChange(async (value) => {
          const number = Number(value);
          if (Number.isFinite(number) && number >= 1) await this.setControlValue('maxEntries', number);
        }),
      );
    new Setting(containerEl)
      .setName(TEXT.mouseButtons.name)
      .setDesc(TEXT.mouseButtons.desc)
      .addToggle((t) => t.setValue(settings.mouseButtons).onChange((v) => this.setControlValue('mouseButtons', v)));
    new Setting(containerEl)
      .setName(TEXT.afterClose.name)
      .setDesc(TEXT.afterClose.desc)
      .addDropdown((d) =>
        d.addOptions(AFTER_CLOSE_OPTIONS).setValue(settings.afterClose).onChange((v) => this.setControlValue('afterClose', v)),
      );
    new Setting(containerEl)
      .setName(TEXT.focusLock.name)
      .setDesc(TEXT.focusLock.desc)
      .addToggle((t) => t.setValue(settings.focusLock).onChange((v) => this.setControlValue('focusLock', v)));
    this.clearButton(new Setting(containerEl).setName(TEXT.clear.name).setDesc(TEXT.clear.desc));
  }
}
