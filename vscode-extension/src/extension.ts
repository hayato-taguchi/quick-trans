import * as vscode from 'vscode';

// ============================================================
// 型定義
// ============================================================

interface AzureConfig {
  endpoint: string;
  deployment: string;
  apiVersion: string;
  apiKey: string;
}

interface CodeContext {
  fileName: string;
  languageId: string;
  surroundingLines: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AzureOpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

// ============================================================
// 設定の読み込み
// ============================================================

function getConfig(): AzureConfig {
  const config = vscode.workspace.getConfiguration('qtrans');
  return {
    endpoint: config.get<string>('azureEndpoint') || '',
    deployment: config.get<string>('azureDeployment') || '',
    apiVersion: config.get<string>('azureApiVersion') || '2024-02-15-preview',
    apiKey: config.get<string>('azureApiKey') || '',
  };
}

function isConfigured(): boolean {
  const config = getConfig();
  return !!(config.endpoint && config.deployment && config.apiKey);
}

// ============================================================
// コンテキスト取得
// ============================================================

function getCodeContext(document: vscode.TextDocument, selection: vscode.Selection): CodeContext {
  const fileName = document.fileName.split('/').pop() || document.fileName;
  const languageId = document.languageId;

  // 選択範囲の前後5行を取得
  const startLine = Math.max(0, selection.start.line - 5);
  const endLine = Math.min(document.lineCount - 1, selection.end.line + 5);

  const lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineText = document.lineAt(i).text;
    if (i >= selection.start.line && i <= selection.end.line) {
      lines.push(`>>> ${lineText}`); // 選択行をマーク
    } else {
      lines.push(lineText);
    }
  }

  return {
    fileName,
    languageId,
    surroundingLines: lines.join('\n'),
  };
}

function buildContextInfo(context: CodeContext): string {
  const parts: string[] = [];
  parts.push(`ファイル: ${context.fileName}`);
  parts.push(`言語: ${context.languageId}`);
  if (context.surroundingLines) {
    parts.push(`周囲のコード:\n${context.surroundingLines}`);
  }
  return parts.join('\n');
}

// ============================================================
// Azure OpenAI API 呼び出し
// ============================================================

async function callAzureOpenAI(systemPrompt: string, userContent: string): Promise<string> {
  const config = getConfig();

  if (!config.apiKey || !config.endpoint || !config.deployment) {
    return 'Azure OpenAI の設定が未完了です（設定 → Q-Trans から設定してください）';
  }

  try {
    const url = `${config.endpoint.replace(/\/+$/, '')}/openai/deployments/${
      config.deployment
    }/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify({
        messages,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Q-Trans API error:', errorText);
      return `API エラー: ${response.status}`;
    }

    const data = (await response.json()) as AzureOpenAIResponse;
    return data.choices?.[0]?.message?.content?.trim() || '結果を取得できませんでした';
  } catch (e) {
    console.error('Q-Trans fetch error:', e);
    return 'ネットワークエラーが発生しました';
  }
}

// ============================================================
// 翻訳機能
// ============================================================

async function translateText(text: string, context: CodeContext | null = null): Promise<string> {
  const contextInfo = context ? buildContextInfo(context) : '';

  const systemPrompt = `You are a professional translation engine specialized in technical and programming content.
Detect the source language automatically.
If the source is Japanese, translate it to natural, professional English.
Otherwise, translate it to natural, professional Japanese.
When translating technical terms, maintain consistency with the context and use appropriate terminology.
Respond with translation only, without any explanations or additional text.${
    contextInfo
      ? `\n\n以下のコード文脈を参考にして、適切な翻訳を行ってください:\n${contextInfo}`
      : ''
  }`;

  return callAzureOpenAI(systemPrompt, text);
}

// ============================================================
// 解説機能
// ============================================================

async function explainText(text: string, context: CodeContext): Promise<string> {
  const contextInfo = buildContextInfo(context);

  const systemPrompt = `あなたはプログラミングとコードの読解を助けるアシスタントです。
ユーザーが選択したコードやテキストについて、その文脈における意味を簡潔に解説してください。

回答のルール:
- 2〜4文程度で簡潔に説明する
- その文脈での具体的な意味や役割を説明する
- プログラミング用語や技術用語の場合は、初心者にもわかるように噛み砕いて説明する
- コードの場合は、何をしているのかを説明する
- 日本語で回答する

コード文脈:
${contextInfo}`;

  const userContent = `「${text}」について、この文脈での意味を教えてください。`;

  return callAzureOpenAI(systemPrompt, userContent);
}

// ============================================================
// Hover Provider
// ============================================================

class TranslationHoverProvider implements vscode.HoverProvider {
  private cache = new Map<string, string>();

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const config = vscode.workspace.getConfiguration('qtrans');
    if (!config.get<boolean>('enableHoverTranslation')) {
      return null;
    }

    if (!isConfigured()) {
      return null;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return null;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      return null;
    }

    // ホバー位置が選択範囲内かチェック
    if (!selection.contains(position)) {
      return null;
    }

    const selectedText = document.getText(selection).trim();
    if (!selectedText || selectedText.length === 0) {
      return null;
    }

    const maxLength = config.get<number>('maxTextLength') || 300;
    if (selectedText.length > maxLength) {
      return null;
    }

    // キャッシュチェック
    const cacheKey = `${document.uri.toString()}:${selectedText}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return new vscode.Hover(new vscode.MarkdownString(`**Q-Trans 翻訳:**\n\n${cached}`));
    }

    // 翻訳を実行
    const context = getCodeContext(document, selection);
    const translated = await translateText(selectedText, context);

    // キャッシュに保存（最大100件）
    if (this.cache.size >= 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(cacheKey, translated);

    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**Q-Trans 翻訳:**\n\n${translated}\n\n`);
    markdown.appendMarkdown(
      `---\n*[解説](command:qtrans.explainSelection)* | *Cmd+Shift+E で解説*`
    );
    markdown.isTrusted = true;

    return new vscode.Hover(markdown, selection);
  }
}

// ============================================================
// コマンド: 翻訳
// ============================================================

async function translateSelectionCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('エディタが開かれていません');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('テキストを選択してください');
    return;
  }

  if (!isConfigured()) {
    const action = await vscode.window.showWarningMessage(
      'Q-Trans: Azure OpenAI の設定が必要です',
      '設定を開く'
    );
    if (action === '設定を開く') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'qtrans');
    }
    return;
  }

  const selectedText = editor.document.getText(selection).trim();
  const config = vscode.workspace.getConfiguration('qtrans');
  const maxLength = config.get<number>('maxTextLength') || 300;

  if (selectedText.length > maxLength) {
    vscode.window.showWarningMessage(`選択テキストが長すぎます（最大${maxLength}文字）`);
    return;
  }

  // ステータスバーに翻訳中を表示
  const statusMessage = vscode.window.setStatusBarMessage('$(sync~spin) Q-Trans: 翻訳中...');

  try {
    const context = getCodeContext(editor.document, selection);
    const translated = await translateText(selectedText, context);

    // 自動的にクリップボードにコピー
    await vscode.env.clipboard.writeText(translated);

    // ステータスバーに結果を表示（5秒で消える）
    statusMessage.dispose();
    vscode.window.setStatusBarMessage(`✓ ${translated}`, 5000);
  } catch {
    statusMessage.dispose();
    vscode.window.setStatusBarMessage('✗ 翻訳に失敗しました', 3000);
  }
}

// ============================================================
// コマンド: 解説
// ============================================================

async function explainSelectionCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('エディタが開かれていません');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('テキストを選択してください');
    return;
  }

  if (!isConfigured()) {
    const action = await vscode.window.showWarningMessage(
      'Q-Trans: Azure OpenAI の設定が必要です',
      '設定を開く'
    );
    if (action === '設定を開く') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'qtrans');
    }
    return;
  }

  const selectedText = editor.document.getText(selection).trim();
  const config = vscode.workspace.getConfiguration('qtrans');
  const maxLength = config.get<number>('maxTextLength') || 300;

  if (selectedText.length > maxLength) {
    vscode.window.showWarningMessage(`選択テキストが長すぎます（最大${maxLength}文字）`);
    return;
  }

  // ステータスバーに解説中を表示
  const statusMessage = vscode.window.setStatusBarMessage('$(sync~spin) Q-Trans: 解説中...');

  try {
    const context = getCodeContext(editor.document, selection);
    const explanation = await explainText(selectedText, context);

    statusMessage.dispose();

    // 結果をパネルで表示
    const panel = vscode.window.createWebviewPanel(
      'qtransExplanation',
      `Q-Trans: 「${selectedText.slice(0, 20)}${selectedText.length > 20 ? '...' : ''}」の解説`,
      vscode.ViewColumn.Beside,
      {}
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 20px;
            line-height: 1.6;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
          }
          .selected-text {
            background: var(--vscode-editor-selectionBackground);
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            margin-bottom: 16px;
            display: inline-block;
          }
          .explanation {
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div class="selected-text">${escapeHtml(selectedText)}</div>
        <div class="explanation">${escapeHtml(explanation)}</div>
      </body>
      </html>
    `;
  } catch {
    statusMessage.dispose();
    vscode.window.setStatusBarMessage('✗ 解説の取得に失敗しました', 3000);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// コマンド: クリップボード翻訳（チャットパネル等どこからでも使える）
// ============================================================

async function translateClipboardCommand(): Promise<void> {
  if (!isConfigured()) {
    const action = await vscode.window.showWarningMessage(
      'Q-Trans: Azure OpenAI の設定が必要です',
      '設定を開く'
    );
    if (action === '設定を開く') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'qtrans');
    }
    return;
  }

  // クリップボードからテキストを取得
  const clipboardText = await vscode.env.clipboard.readText();

  if (!clipboardText || clipboardText.trim().length === 0) {
    vscode.window.showWarningMessage('クリップボードにテキストがありません');
    return;
  }

  const text = clipboardText.trim();
  const config = vscode.workspace.getConfiguration('qtrans');
  const maxLength = config.get<number>('maxTextLength') || 300;

  if (text.length > maxLength) {
    vscode.window.showWarningMessage(`テキストが長すぎます（最大${maxLength}文字）`);
    return;
  }

  // ステータスバーに翻訳中を表示
  const statusMessage = vscode.window.setStatusBarMessage('$(sync~spin) Q-Trans: 翻訳中...');

  try {
    const translated = await translateText(text, null);

    // 自動的にクリップボードにコピー
    await vscode.env.clipboard.writeText(translated);

    // ステータスバーに結果を表示（5秒で消える）
    statusMessage.dispose();
    vscode.window.setStatusBarMessage(`✓ ${translated}`, 5000);
  } catch {
    statusMessage.dispose();
    vscode.window.setStatusBarMessage('✗ 翻訳に失敗しました', 3000);
  }
}

// ============================================================
// コマンド: クリップボード解説（チャットパネル等どこからでも使える）
// ============================================================

async function explainClipboardCommand(): Promise<void> {
  if (!isConfigured()) {
    const action = await vscode.window.showWarningMessage(
      'Q-Trans: Azure OpenAI の設定が必要です',
      '設定を開く'
    );
    if (action === '設定を開く') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'qtrans');
    }
    return;
  }

  // クリップボードからテキストを取得
  const clipboardText = await vscode.env.clipboard.readText();

  if (!clipboardText || clipboardText.trim().length === 0) {
    vscode.window.showWarningMessage('クリップボードにテキストがありません');
    return;
  }

  const text = clipboardText.trim();
  const config = vscode.workspace.getConfiguration('qtrans');
  const maxLength = config.get<number>('maxTextLength') || 300;

  if (text.length > maxLength) {
    vscode.window.showWarningMessage(`テキストが長すぎます（最大${maxLength}文字）`);
    return;
  }

  // ステータスバーに解説中を表示
  const statusMessage = vscode.window.setStatusBarMessage('$(sync~spin) Q-Trans: 解説中...');

  try {
    // クリップボード用の簡易コンテキスト
    const context: CodeContext = {
      fileName: 'clipboard',
      languageId: 'unknown',
      surroundingLines: '',
    };

    const explanation = await explainText(text, context);

    statusMessage.dispose();

    // 結果をパネルで表示
    const panel = vscode.window.createWebviewPanel(
      'qtransExplanation',
      `Q-Trans: 「${text.slice(0, 20)}${text.length > 20 ? '...' : ''}」の解説`,
      vscode.ViewColumn.Beside,
      {}
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 20px;
            line-height: 1.6;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
          }
          .selected-text {
            background: var(--vscode-editor-selectionBackground);
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            margin-bottom: 16px;
            display: inline-block;
            word-break: break-all;
          }
          .explanation {
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div class="selected-text">${escapeHtml(text)}</div>
        <div class="explanation">${escapeHtml(explanation)}</div>
      </body>
      </html>
    `;
  } catch {
    statusMessage.dispose();
    vscode.window.setStatusBarMessage('✗ 解説の取得に失敗しました', 3000);
  }
}

// ============================================================
// 拡張機能のアクティベーション
// ============================================================

export function activate(context: vscode.ExtensionContext): void {
  console.log('Q-Trans extension is now active');

  // Hover Provider の登録
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: '*', language: '*' },
    new TranslationHoverProvider()
  );
  context.subscriptions.push(hoverProvider);

  // コマンドの登録
  const translateCommand = vscode.commands.registerCommand(
    'qtrans.translateSelection',
    translateSelectionCommand
  );
  context.subscriptions.push(translateCommand);

  const explainCommand = vscode.commands.registerCommand(
    'qtrans.explainSelection',
    explainSelectionCommand
  );
  context.subscriptions.push(explainCommand);

  const clipboardCommand = vscode.commands.registerCommand(
    'qtrans.translateClipboard',
    translateClipboardCommand
  );
  context.subscriptions.push(clipboardCommand);

  const explainClipboardCmd = vscode.commands.registerCommand(
    'qtrans.explainClipboard',
    explainClipboardCommand
  );
  context.subscriptions.push(explainClipboardCmd);

  // 初回起動時に設定が未完了なら通知
  if (!isConfigured()) {
    vscode.window
      .showInformationMessage(
        'Q-Trans: Azure OpenAI の設定を行うと翻訳機能が使えます',
        '設定を開く'
      )
      .then((action) => {
        if (action === '設定を開く') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'qtrans');
        }
      });
  }
}

export function deactivate(): void {
  console.log('Q-Trans extension is now deactivated');
}
