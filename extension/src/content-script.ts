// Q-Trans content script
// 選択されたテキストを検知して翻訳チップを表示する

interface AzureConfig {
  endpoint: string | null;
  deployment: string | null;
  apiVersion: string | null;
  apiKey: string | null;
}

interface PageContext {
  title: string;
  description: string;
  headings: string;
}

interface SurroundingContext {
  before: string;
  after: string;
}

interface TranslationContext {
  page: PageContext;
  surrounding: SurroundingContext | null;
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

const QTRANS_CHIP_ID = '__qtrans_translation_chip';
let qtransHideTimeout: ReturnType<typeof setTimeout> | null = null;
let qtransLastText = '';

// 解説機能のために選択テキストと文脈を保持
let qtransCurrentSelection: {
  text: string;
  context: TranslationContext;
  rect: DOMRect;
} | null = null;

// IME入力中かどうかを追跡
let isComposing = false;

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    return true;
  }

  // contentEditable要素のチェック
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }

  return false;
}

function removeExistingChip(): void {
  const existing = document.getElementById(QTRANS_CHIP_ID);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  if (qtransHideTimeout) {
    clearTimeout(qtransHideTimeout);
    qtransHideTimeout = null;
  }
}

interface ChipOptions {
  showExplainButton?: boolean;
  isExplanation?: boolean;
}

function createChipElement(text: string, rect: DOMRect, options: ChipOptions = {}): void {
  removeExistingChip();

  const { showExplainButton = false, isExplanation = false } = options;

  const chip = document.createElement('div');
  chip.id = QTRANS_CHIP_ID;
  chip.style.position = 'fixed';
  chip.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  chip.style.top = `${rect.bottom + 8}px`;
  chip.style.maxWidth = isExplanation ? '360px' : '280px';
  chip.style.zIndex = '2147483647';
  chip.style.background = '#111827';
  chip.style.color = '#f9fafb';
  chip.style.padding = '8px 12px';
  chip.style.borderRadius = '8px';
  chip.style.fontSize = '12px';
  chip.style.fontFamily = '-apple-system, BlinkMacSystemFont, system-ui, sans-serif';
  chip.style.boxShadow = '0 8px 20px rgba(0,0,0,0.25)';
  chip.style.cursor = 'default';

  // コンテンツエリア
  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.alignItems = 'flex-start';
  content.style.gap = '8px';

  // テキスト部分
  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  textSpan.style.flex = '1';
  textSpan.style.lineHeight = '1.5';
  if (isExplanation) {
    textSpan.style.whiteSpace = 'pre-wrap';
  }
  content.appendChild(textSpan);

  // ボタンコンテナ
  const buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.alignItems = 'center';
  buttons.style.gap = '6px';
  buttons.style.flexShrink = '0';

  // 解説ボタン（?）
  if (showExplainButton && qtransCurrentSelection) {
    const explainBtn = document.createElement('span');
    explainBtn.textContent = '?';
    explainBtn.title = 'この単語/フレーズを解説';
    explainBtn.style.cursor = 'pointer';
    explainBtn.style.opacity = '0.7';
    explainBtn.style.fontWeight = 'bold';
    explainBtn.style.fontSize = '13px';
    explainBtn.style.width = '18px';
    explainBtn.style.height = '18px';
    explainBtn.style.display = 'flex';
    explainBtn.style.alignItems = 'center';
    explainBtn.style.justifyContent = 'center';
    explainBtn.style.borderRadius = '50%';
    explainBtn.style.background = 'rgba(255,255,255,0.15)';
    explainBtn.onmouseenter = (): void => {
      explainBtn.style.opacity = '1';
      explainBtn.style.background = 'rgba(255,255,255,0.25)';
    };
    explainBtn.onmouseleave = (): void => {
      explainBtn.style.opacity = '0.7';
      explainBtn.style.background = 'rgba(255,255,255,0.15)';
    };
    explainBtn.onclick = async (e: MouseEvent): Promise<void> => {
      e.stopPropagation();
      if (!qtransCurrentSelection) return;

      const { text: selectedText, context, rect: selectionRect } = qtransCurrentSelection;
      createChipElement('解説中…', selectionRect, { isExplanation: true });

      const explanation = await explainText(selectedText, context);
      createChipElement(explanation, selectionRect, { isExplanation: true });
    };
    buttons.appendChild(explainBtn);
  }

  // 閉じるボタン（×）
  const close = document.createElement('span');
  close.textContent = '×';
  close.style.cursor = 'pointer';
  close.style.opacity = '0.7';
  close.style.fontWeight = 'bold';
  close.onclick = (e: MouseEvent): void => {
    e.stopPropagation();
    removeExistingChip();
  };
  close.onmouseenter = (): void => {
    close.style.opacity = '1';
  };
  close.onmouseleave = (): void => {
    close.style.opacity = '0.7';
  };
  buttons.appendChild(close);

  content.appendChild(buttons);
  chip.appendChild(content);
  document.body.appendChild(chip);

  // 自動で消える（解説モードは長めに）
  const timeout = isExplanation ? 15000 : 8000;
  qtransHideTimeout = setTimeout(() => {
    removeExistingChip();
  }, timeout);
}

async function loadApiKey(): Promise<AzureConfig> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(
        ['qtransAzureEndpoint', 'qtransAzureDeployment', 'qtransAzureApiVersion', 'qtransApiKey'],
        (result) => {
          resolve({
            endpoint: (result.qtransAzureEndpoint as string) || null,
            deployment: (result.qtransAzureDeployment as string) || null,
            apiVersion: (result.qtransAzureApiVersion as string) || null,
            apiKey: (result.qtransApiKey as string) || null,
          });
        }
      );
    } catch {
      resolve({
        endpoint: null,
        deployment: null,
        apiVersion: null,
        apiKey: null,
      });
    }
  });
}

function getPageContext(): PageContext {
  // ページのタイトルとメタ情報を取得
  const title = document.title || '';
  const metaDescription =
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '';

  // 見出し要素を取得（h1-h3）
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .slice(0, 5) // 最初の5つまで
    .map((h) => h.textContent?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join(' | ');

  return {
    title,
    description: metaDescription,
    headings,
  };
}

function getSurroundingContext(selection: Selection): SurroundingContext | null {
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  // 親要素を探す（段落やセクション）
  let parent: Element | null =
    container.nodeType === Node.TEXT_NODE
      ? (container as Text).parentElement
      : (container as Element);

  while (parent && !['P', 'ARTICLE', 'SECTION', 'DIV', 'LI'].includes(parent.tagName)) {
    parent = parent.parentElement;
  }

  if (!parent) return null;

  // 親要素内のテキストを取得（選択部分を除く）
  const parentText = parent.textContent || '';
  const selectedText = selection.toString().trim();

  // 選択テキストの前後の文脈を抽出
  const selectedIndex = parentText.indexOf(selectedText);
  if (selectedIndex === -1) return null;

  const beforeText = parentText.substring(Math.max(0, selectedIndex - 200), selectedIndex).trim();
  const afterText = parentText
    .substring(selectedIndex + selectedText.length, selectedIndex + selectedText.length + 200)
    .trim();

  return {
    before: beforeText,
    after: afterText,
  };
}

async function callAzureOpenAI(systemPrompt: string, userContent: string): Promise<string> {
  const config = await loadApiKey();
  if (!config.apiKey || !config.endpoint || !config.deployment || !config.apiVersion) {
    return 'Azure OpenAI の設定が未完了です（拡張機能のオプションから設定してください）';
  }

  try {
    const url = `${config.endpoint.replace(/\/+$/, '')}/openai/deployments/${
      config.deployment
    }/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const res = await fetch(url, {
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

    if (!res.ok) {
      console.error('Q-Trans API error', await res.text());
      return 'API エラーが発生しました';
    }

    const data: AzureOpenAIResponse = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '結果を取得できませんでした';
  } catch (e) {
    console.error('Q-Trans fetch error', e);
    return 'ネットワークエラーが発生しました';
  }
}

function buildContextInfo(context: TranslationContext | null): string {
  if (!context) return '';

  const parts: string[] = [];
  if (context.page.title) parts.push(`ページタイトル: ${context.page.title}`);
  if (context.page.headings) parts.push(`見出し: ${context.page.headings}`);
  if (context.surrounding?.before) parts.push(`前の文脈: ${context.surrounding.before}`);
  if (context.surrounding?.after) parts.push(`後の文脈: ${context.surrounding.after}`);

  if (parts.length > 0) {
    return `\n\n文脈情報:\n${parts.join('\n')}`;
  }
  return '';
}

async function translateText(
  text: string,
  context: TranslationContext | null = null
): Promise<string> {
  const contextInfo = buildContextInfo(context);

  const systemPrompt = `You are a professional translation engine specialized in technical and academic content. 
Detect the source language automatically. 
If the source is Japanese, translate it to natural, professional English. 
Otherwise, translate it to natural, professional Japanese.
When translating technical terms, maintain consistency with the context and use appropriate terminology.
Respond with translation only, without any explanations or additional text.${
    contextInfo ? `\n\n以下の文脈情報を参考にして、適切な翻訳を行ってください:${contextInfo}` : ''
  }`;

  return callAzureOpenAI(systemPrompt, text);
}

async function explainText(text: string, context: TranslationContext): Promise<string> {
  const contextInfo = buildContextInfo(context);

  const systemPrompt = `あなたは技術ドキュメントの読解を助けるアシスタントです。
ユーザーが選択した単語やフレーズについて、その文脈における意味を簡潔に解説してください。

回答のルール:
- 2〜3文程度で簡潔に説明する
- その文脈での具体的な意味や役割を説明する
- 専門用語の場合は、初心者にもわかるように噛み砕いて説明する
- 必要に応じて「この文脈では〜」のように文脈に即した説明をする
- 日本語で回答する${contextInfo}`;

  const userContent = `「${text}」について、この文脈での意味を教えてください。`;

  return callAzureOpenAI(systemPrompt, userContent);
}

let qtransSelectionTimeout: ReturnType<typeof setTimeout> | null = null;

async function handleSelectionChange(): Promise<void> {
  if (qtransSelectionTimeout) {
    clearTimeout(qtransSelectionTimeout);
  }

  qtransSelectionTimeout = setTimeout(async () => {
    // IME入力中または入力フィールドにフォーカスがある場合はスキップ
    if (isComposing || isEditableElement(document.activeElement)) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      removeExistingChip();
      qtransCurrentSelection = null;
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length === 0) {
      removeExistingChip();
      qtransCurrentSelection = null;
      return;
    }

    // あまり長すぎる文は対象外（任意に 300 文字まで）
    if (text.length > 300) {
      removeExistingChip();
      qtransCurrentSelection = null;
      return;
    }

    // 前回と同じテキストなら再翻訳しない
    if (text === qtransLastText) {
      return;
    }
    qtransLastText = text;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.top === 0 && rect.bottom === 0)) {
      return;
    }

    // 文脈情報を取得
    const pageContext = getPageContext();
    const surroundingContext = getSurroundingContext(selection);
    const context: TranslationContext = {
      page: pageContext,
      surrounding: surroundingContext,
    };

    // 解説機能のために選択情報を保持
    qtransCurrentSelection = { text, context, rect };

    createChipElement('翻訳中…', rect);
    const translated = await translateText(text, context);
    createChipElement(translated, rect, { showExplainButton: true });
  }, 350);
}

document.addEventListener('selectionchange', handleSelectionChange, {
  passive: true,
});

// IME入力の開始・終了を追跡
document.addEventListener('compositionstart', () => {
  isComposing = true;
});

document.addEventListener('compositionend', () => {
  isComposing = false;
});
