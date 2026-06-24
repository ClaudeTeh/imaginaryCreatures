/** Tiny DOM helpers to keep the UI code declarative and readable. */
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "html") {
      node.innerHTML = String(v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function statColor(stat: string): string {
  return (
    {
      health: "#6ce5b1",
      attack: "#ff8f6b",
      defense: "#7aa2ff",
      speed: "#ffce6b",
      energy: "#c39bff",
    }[stat] ?? "#9aa7c4"
  );
}
