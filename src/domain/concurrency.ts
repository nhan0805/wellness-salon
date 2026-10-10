export class AssignmentMutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T> | T) {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}
