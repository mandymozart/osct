/**
 * A node asked for from the Tree's + (#337): the selected target's Inspector (`EntityPanel`) adds a node of the type as
 * its own *+ node* does – at once, or after its file is picked in the Library for a type that takes one – and selects it.
 * An ask waits until the Inspector takes it.
 */
class NodeAddRequests {
  asked = $state<string | null>(null);

  ask(type: string): void {
    this.asked = type;
  }

  /** The waiting node type, taken (null when none waits) */
  take(): string | null {
    const type = this.asked;
    this.asked = null;
    return type;
  }
}

export const nodeAdd = new NodeAddRequests();
