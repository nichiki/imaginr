// Tauri native dialog utilities

/**
 * Show an error message dialog
 */
export async function showError(message: string, title = 'エラー'): Promise<void> {
  const { message: showMessage } = await import('@tauri-apps/plugin-dialog');
  await showMessage(message, { title, kind: 'error' });
}

/**
 * Show an info message dialog
 */
export async function showInfo(message: string, title = '情報'): Promise<void> {
  const { message: showMessage } = await import('@tauri-apps/plugin-dialog');
  await showMessage(message, { title, kind: 'info' });
}

/**
 * Show a warning message dialog
 */
export async function showWarning(message: string, title = '警告'): Promise<void> {
  const { message: showMessage } = await import('@tauri-apps/plugin-dialog');
  await showMessage(message, { title, kind: 'warning' });
}

/**
 * Show a confirmation dialog
 * @returns true if user confirmed, false otherwise
 */
export async function showConfirm(
  message: string,
  options?: {
    title?: string;
    okLabel?: string;
    cancelLabel?: string;
    kind?: 'info' | 'warning' | 'error';
  }
): Promise<boolean> {
  const { ask } = await import('@tauri-apps/plugin-dialog');
  return await ask(message, {
    title: options?.title ?? '確認',
    kind: options?.kind ?? 'warning',
    okLabel: options?.okLabel ?? 'OK',
    cancelLabel: options?.cancelLabel ?? 'キャンセル',
  });
}
