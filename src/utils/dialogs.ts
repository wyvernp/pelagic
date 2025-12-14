import { ask, message } from '@tauri-apps/plugin-dialog';

/**
 * Show a confirmation dialog using Tauri's native dialog.
 * This provides a consistent, native-looking confirmation experience.
 */
export async function confirmDialog(
  title: string,
  messageText: string,
  options?: {
    okLabel?: string;
    cancelLabel?: string;
    kind?: 'info' | 'warning' | 'error';
  }
): Promise<boolean> {
  try {
    return await ask(messageText, {
      title,
      okLabel: options?.okLabel ?? 'Confirm',
      cancelLabel: options?.cancelLabel ?? 'Cancel',
      kind: options?.kind ?? 'warning',
    });
  } catch (error) {
    // Fallback to window.confirm if Tauri dialog fails
    console.warn('Tauri dialog failed, falling back to window.confirm:', error);
    return window.confirm(messageText);
  }
}

/**
 * Show a delete confirmation dialog with appropriate styling.
 */
export async function confirmDelete(
  itemType: string,
  count: number = 1
): Promise<boolean> {
  const itemName = count === 1 ? itemType : `${count} ${itemType}s`;
  return confirmDialog(
    'Confirm Deletion',
    `Are you sure you want to delete ${itemName}? This action cannot be undone.`,
    {
      okLabel: 'Delete',
      cancelLabel: 'Cancel',
      kind: 'warning',
    }
  );
}

/**
 * Show an info message dialog.
 */
export async function showMessage(
  title: string,
  messageText: string,
  kind: 'info' | 'warning' | 'error' = 'info'
): Promise<void> {
  try {
    await message(messageText, { title, kind });
  } catch (error) {
    // Fallback to alert
    console.warn('Tauri message failed, falling back to alert:', error);
    alert(messageText);
  }
}
