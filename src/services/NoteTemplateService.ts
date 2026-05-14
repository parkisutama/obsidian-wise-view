import {
  App,
  BasesView,
  Notice,
  parseYaml,
  stringifyYaml,
  TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
} from 'obsidian';
import type { NoteTemplateDefaults } from '../types/settings';

export interface NoteTemplateContext {
  title: string;
  start?: Date;
  end?: Date | null;
  allDay?: boolean;
  frontmatter: Record<string, unknown>;
}

interface TemplateParts {
  frontmatter: Record<string, unknown>;
  body: string;
}

export class NoteTemplateService {
  constructor(
    private readonly app: App,
    private readonly settings: NoteTemplateDefaults,
  ) {}

  async createNote(view: BasesView, context: NoteTemplateContext): Promise<void> {
    const renderedTitle = this.renderTemplate(this.settings.titleFormat || context.title, context).trim() || context.title;
    const fileTitle = this.sanitizeFileName(renderedTitle) || 'Untitled';
    const template = await this.readTemplate(context);
    const frontmatter = { ...template.frontmatter, ...context.frontmatter };

    if (this.settings.targetFolder) {
      const file = await this.createDirectly(fileTitle, frontmatter, template.body);
      await this.app.workspace.getLeaf(false).openFile(file);
      return;
    }

    if (!this.settings.templatePath) {
      await view.createFileForView(fileTitle, (fm: Record<string, unknown>) => {
        Object.assign(fm, context.frontmatter);
      });
      return;
    }

    const createdFile = await this.createThroughBases(view, fileTitle, frontmatter);
    if (!createdFile) {
      new Notice('Could not apply the template because no new note was detected.');
      return;
    }

    await this.applyTemplateToFile(createdFile, frontmatter, template.body);
  }

  private async readTemplate(context: NoteTemplateContext): Promise<TemplateParts> {
    const templatePath = normalizePath(this.settings.templatePath);
    if (!templatePath) {
      return { frontmatter: {}, body: '' };
    }

    const file = this.getTemplateFile(templatePath);
    if (!file) {
      new Notice(`Template note not found: ${templatePath}`);
      return { frontmatter: {}, body: '' };
    }

    const content = this.renderTemplate(await this.app.vault.cachedRead(file), context);
    return this.parseTemplate(content);
  }

  private getTemplateFile(templatePath: string): TFile | null {
    return this.app.vault.getFileByPath(templatePath) ??
      this.app.vault.getFileByPath(`${templatePath}.md`);
  }

  private parseTemplate(content: string): TemplateParts {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const yaml = match[1] ?? '';
    const body = content.slice(match[0].length);
    try {
      const parsed = parseYaml(yaml);
      return {
        frontmatter: parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {},
        body,
      };
    } catch {
      new Notice('Could not parse the template frontmatter.');
      return { frontmatter: {}, body };
    }
  }

  private async createThroughBases(
    view: BasesView,
    title: string,
    frontmatter: Record<string, unknown>,
  ): Promise<TFile | null> {
    const created = this.waitForCreatedMarkdownFile();
    await view.createFileForView(title, (fm: Record<string, unknown>) => {
      Object.assign(fm, frontmatter);
    });
    return created;
  }

  private waitForCreatedMarkdownFile(): Promise<TFile | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (file: TFile | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        this.app.vault.offref(ref);
        resolve(file);
      };

      const ref = this.app.vault.on('create', (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === 'md') {
          finish(file);
        }
      });

      const timeoutId = window.setTimeout(() => finish(null), 30_000);
    });
  }

  private async createDirectly(
    title: string,
    frontmatter: Record<string, unknown>,
    body: string,
  ): Promise<TFile> {
    const folder = normalizePath(this.settings.targetFolder);
    await this.ensureFolder(folder);
    const path = await this.getAvailablePath(folder, title);
    return this.app.vault.create(path, this.composeContent(frontmatter, body));
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (!folder || this.app.vault.getFolderByPath(folder)) return;

    const parts = folder.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getFolderByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async getAvailablePath(folder: string, title: string): Promise<string> {
    const safeTitle = this.sanitizeFileName(title) || 'Untitled';
    let path = normalizePath(folder ? `${folder}/${safeTitle}.md` : `${safeTitle}.md`);
    let counter = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(folder ? `${folder}/${safeTitle} ${counter}.md` : `${safeTitle} ${counter}.md`);
      counter += 1;
    }
    return path;
  }

  private async applyTemplateToFile(
    file: TFile,
    frontmatter: Record<string, unknown>,
    body: string,
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      Object.assign(fm, frontmatter);
    });

    if (!body.trim()) return;
    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, this.replaceBody(content, body));
  }

  private replaceBody(content: string, body: string): string {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (!match) {
      return this.composeContent({}, body);
    }
    return `${match[0]}${body.trimStart()}`;
  }

  private composeContent(frontmatter: Record<string, unknown>, body: string): string {
    const yaml = stringifyYaml(frontmatter).trim();
    const renderedBody = body.trimStart();
    if (!yaml) return renderedBody;
    return `---\n${yaml}\n---\n${renderedBody}`;
  }

  private renderTemplate(template: string, context: NoteTemplateContext): string {
    const start = context.start;
    const end = context.end ?? undefined;
    const replacements: Record<string, string> = {
      title: context.title,
      date: start ? this.formatLocalDate(start) : '',
      time: start ? this.formatLocalTime(start) : '',
      start: start ? this.formatLocalDateTime(start, context.allDay ?? false) : '',
      end: end ? this.formatLocalDateTime(end, context.allDay ?? false) : '',
    };

    return template.replace(/\{\{\s*(title|date|time|start|end)\s*\}\}/g, (_, key: string) => replacements[key] ?? '');
  }

  private formatLocalDateTime(date: Date, allDay: boolean): string {
    if (allDay) return this.formatLocalDate(date);
    const tzOffset = date.getTimezoneOffset();
    const offsetHours = Math.abs(Math.floor(tzOffset / 60));
    const offsetMinutes = Math.abs(tzOffset % 60);
    const offsetSign = tzOffset <= 0 ? '+' : '-';
    return `${this.formatLocalDate(date)}T${this.formatLocalTime(date)}:00${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
  }

  private formatLocalDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private formatLocalTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private sanitizeFileName(title: string): string {
    return title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  }
}
