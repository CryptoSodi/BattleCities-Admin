export function element<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const match = root.querySelector<T>(selector);
  if (!match) throw new Error(`Missing admin control: ${selector}`);
  return match;
}
export function action(label: string, onClick: () => void, danger = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label;
  button.className = `admin-button ${danger ? 'admin-button--danger' : 'admin-button--quiet'}`;
  button.addEventListener('click', onClick);
  return button;
}
export function status(root: HTMLElement, text: string, error = false): void {
  root.textContent = text;
  root.classList.toggle('is-error', error);
  root.setAttribute('role', error ? 'alert' : 'status');
}
export function errorText(error: unknown): string { return error instanceof Error ? error.message : 'Request failed. Please retry.'; }
