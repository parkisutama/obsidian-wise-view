import { App, Menu, TFile } from 'obsidian';

/**
 * Open a file in a new tab.
 * Standard single-click behavior across all Planner views.
 */
export function openFileInNewTab(app: App, path: string): void {
    void app.workspace.openLinkText(path, '', 'tab');
}

/**
 * Show a right-click context menu with file open location options.
 * Centralised for all Planner views.
 */
export function showOpenFileMenu(app: App, path: string, event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem(item =>
        item.setTitle('Open in new tab').setIcon('arrow-right')
            .onClick(() => void app.workspace.openLinkText(path, '', 'tab'))
    );

    menu.addItem(item =>
        item.setTitle('Open to the right').setIcon('separator-vertical')
            .onClick(() => void app.workspace.openLinkText(path, '', 'split'))
    );

    menu.addItem(item =>
        item.setTitle('Open below').setIcon('separator-horizontal')
            .onClick(() => {
                const activeLeaf = app.workspace.getLeaf(false);
                const leaf = app.workspace.createLeafBySplit(activeLeaf, 'horizontal');
                const file = app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    void leaf.openFile(file);
                }
            })
    );

    menu.addItem(item =>
        item.setTitle('Open to the left').setIcon('separator-vertical')
            .onClick(() => {
                const activeLeaf = app.workspace.getLeaf(false);
                const leaf = app.workspace.createLeafBySplit(activeLeaf, 'vertical', true);
                const file = app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    void leaf.openFile(file);
                }
            })
    );

    menu.addItem(item =>
        item.setTitle('Open in new window').setIcon('picture-in-picture-2')
            .onClick(() => void app.workspace.openLinkText(path, '', 'window'))
    );

    menu.showAtMouseEvent(event);
}
