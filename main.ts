import {
  App,
  debounce,
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
import { afterClose, moveIndex, moveItem, type AfterClose, type MoveTarget } from './src/tabs.ts';

interface TabHistorySettings {
  persistHistory: boolean;
  maxEntries: number;
  mouseButtons: boolean;
  afterClose: AfterClose;
}

const DEFAULT_SETTINGS: TabHistorySettings = {
  persistHistory: true,
  maxEntries: 50,
  mouseButtons: true,
  afterClose: 'adjacent',
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
  history?: Partial<RawHistory>;
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

    this.app.workspace.onLayoutReady(() => this.restoreHistory());
  }

  onunload() {
    this.clearMaximize();
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
    this.clearButton(new Setting(containerEl).setName(TEXT.clear.name).setDesc(TEXT.clear.desc));
  }
}
