import { SyncSourcePayload } from './LanSyncClient';

export class SourceImportBatch {
  imported: SyncSourcePayload[] = [];
  skipped: number = 0;
  failures: string[] = [];
  private scripts: Set<string>;

  constructor(existing: SyncSourcePayload[]) {
    this.scripts = new Set<string>(existing.map((source: SyncSourcePayload) => source.script.replace(/^\uFEFF/, '')));
  }

  add(file: string, raw: string): void {
    const script = raw.replace(/^\uFEFF/, '');
    if (!script.trim()) { this.fail(file, '文件内容为空'); return; }
    const header = script.match(/^\/\*[\s\S]+?\*\//)?.[0];
    if (!header) { this.fail(file, '缺少 LX 音源头部信息注释'); return; }
    if (this.scripts.has(script)) { this.skipped++; return; }
    this.imported.push({ id: `harmony-source-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: this.info(header, 'name') || '自定义音源', script: script,
      description: this.info(header, 'description'), version: this.info(header, 'version'),
      author: this.info(header, 'author'), homepage: this.info(header, 'homepage'),
      allowShowUpdateAlert: false, importedAt: Date.now() });
    this.scripts.add(script);
  }

  private info(header: string, key: string): string {
    return header.match(new RegExp(`^\\s?\\*\\s?@${key}\\s+([^\\r\\n]+)`, 'm'))?.[1]?.trim() ?? '';
  }
  fail(file: string, message: string): void { this.failures.push(`${file}：${message}`); }
  summary(): string { return `已导入 ${this.imported.length} 个音源，跳过 ${this.skipped} 个重复，${this.failures.length} 个失败`; }
  report(): string { return [this.summary()].concat(this.failures).join('\n'); }
}
