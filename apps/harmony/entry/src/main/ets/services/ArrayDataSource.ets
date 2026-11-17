export class ArrayDataSource<T> implements IDataSource {
  private items: T[] = [];
  private listeners: DataChangeListener[] = [];
  private identity: ((item: T) => string) | null = null;
  constructor(items: T[] = [], identity: ((item: T) => string) | null = null) {
    this.items = items;
    this.identity = identity;
  }
  totalCount(): number { return this.items.length; }
  getData(index: number): T { return this.items[index]; }
  registerDataChangeListener(listener: DataChangeListener): void {
    if (!this.listeners.includes(listener)) this.listeners.push(listener);
  }
  unregisterDataChangeListener(listener: DataChangeListener): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) this.listeners.splice(index, 1);
  }
  reset(items: T[]): void {
    if (this.items === items) return;
    // Preserve existing LazyForEach nodes and the active scroll gesture as pages arrive.
    const added: number[] = [];
    const changed: number[] = [];
    let previous = 0;
    for (let index = 0; index < items.length; index++) {
      const oldItem = this.items[previous];
      if (previous < this.items.length && (items[index] === oldItem ||
        (this.identity !== null && this.identity(items[index]) === this.identity(oldItem)))) {
        if (items[index] !== oldItem) changed.push(index);
        previous++;
      } else added.push(index);
    }
    const retainsPrevious = previous === this.items.length;
    this.items = items;
    for (const listener of this.listeners) {
      if (retainsPrevious) {
        for (const index of added) listener.onDataAdd(index);
        for (const index of changed) listener.onDataChange(index);
      } else {
        listener.onDataReloaded();
      }
    }
  }
}
