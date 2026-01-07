// Q-Trans content script
// 選択されたテキストを検知して翻訳チップを表示する

const QTRANS_CHIP_ID = '__qtrans_translation_chip';
let qtransHideTimeout = null;
let qtransLastText = '';

function removeExistingChip() {
  const existing = document.getElementById(QTRANS_CHIP_ID);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  if (qtransHideTimeout) {
    clearTimeout(qtransHideTimeout);
    qtransHideTimeout = null;
  }
}

function createChipElement(text, rect) {
  removeExistingChip();

  const chip = document.createElement('div');
  chip.id = QTRANS_CHIP_ID;
  chip.textContent = text;
  chip.style.position = 'fixed';
  chip.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  chip.style.top = `${rect.bottom + 8}px`;
  chip.style.maxWidth = '260px';
  chip.style.zIndex = '2147483647';
  chip.style.background = '#111827';
  chip.style.color = '#f9fafb';
  chip.style.padding = '6px 10px';
  chip.style.borderRadius = '6px';
  chip.style.fontSize = '12px';
  chip.style.fontFamily = '-apple-system, BlinkMacSystemFont, system-ui, sans-serif';
  chip.style.boxShadow = '0 8px 20px rgba(0,0,0,0.25)';
  chip.style.display = 'flex';
  chip.style.alignItems = 'center';
  chip.style.gap = '6px';
  chip.style.cursor = 'default';

  const close = document.createElement('span');
  close.textContent = '×';
  close.style.cursor = 'pointer';
  close.style.opacity = '0.7';
  close.style.fontWeight = 'bold';
  close.onclick = (e) => {
    e.stopPropagation();
    removeExistingChip();
  };

  chip.appendChild(close);
  document.body.appendChild(chip);

  // 自動で数秒後に消える
  qtransHideTimeout = setTimeout(() => {
    removeExistingChip();
  }, 8000);
}

async function loadApiKey() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(
        ['qtransAzureEndpoint', 'qtransAzureDeployment', 'qtransAzureApiVersion', 'qtransApiKey'],
        (result) => {
          resolve({
            endpoint: result.qtransAzureEndpoint || null,
            deployment: result.qtransAzureDeployment || null,
            apiVersion: result.qtransAzureApiVersion || null,
            apiKey: result.qtransApiKey || null,
          });
        }
      );
    } catch (e) {
      resolve({
        endpoint: null,
        deployment: null,
        apiVersion: null,
        apiKey: null,
      });
    }
  });
}

function getPageContext() {
  // ページのタイトルとメタ情報を取得
  const title = document.title || '';
  const metaDescription = document.querySelector('meta[name="description"]')?.content || '';

  // 見出し要素を取得（h1-h3）
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .slice(0, 5) // 最初の5つまで
    .map((h) => h.textContent.trim())
    .filter((text) => text.length > 0)
    .join(' | ');

  return {
    title,
    description: metaDescription,
    headings,
  };
}

function getSurroundingContext(selection) {
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  // 親要素を探す（段落やセクション）
  let parent = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

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

async function translateText(text, context = null) {
  const config = await loadApiKey();
  if (!config.apiKey || !config.endpoint || !config.deployment || !config.apiVersion) {
    return 'Azure OpenAI の設定が未完了です（拡張機能のオプションから設定してください）';
  }

  try {
    const url = `${config.endpoint.replace(/\/+$/, '')}/openai/deployments/${
      config.deployment
    }/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;

    // 文脈情報を構築
    let contextInfo = '';
    if (context) {
      const parts = [];
      if (context.page.title) parts.push(`ページタイトル: ${context.page.title}`);
      if (context.page.headings) parts.push(`見出し: ${context.page.headings}`);
      if (context.surrounding?.before) parts.push(`前の文脈: ${context.surrounding.before}`);
      if (context.surrounding?.after) parts.push(`後の文脈: ${context.surrounding.after}`);

      if (parts.length > 0) {
        contextInfo = `\n\n以下の文脈情報を参考にして、適切な翻訳を行ってください:\n${parts.join(
          '\n'
        )}`;
      }
    }

    const systemPrompt = `You are a professional translation engine specialized in technical and academic content. 
Detect the source language automatically. 
If the source is Japanese, translate it to natural, professional English. 
Otherwise, translate it to natural, professional Japanese.
When translating technical terms, maintain consistency with the context and use appropriate terminology.
Respond with translation only, without any explanations or additional text.${contextInfo}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3, // 少し温度を上げて文脈を考慮しやすくする
      }),
    });

    if (!res.ok) {
      console.error('Q-Trans API error', await res.text());
      return '翻訳 API エラーが発生しました';
    }

    const data = await res.json();
    const translation =
      data.choices?.[0]?.message?.content?.trim() || '翻訳結果を取得できませんでした';
    return translation;
  } catch (e) {
    console.error('Q-Trans fetch error', e);
    return 'ネットワークエラーにより翻訳できませんでした';
  }
}

let qtransSelectionTimeout = null;

async function handleSelectionChange() {
  if (qtransSelectionTimeout) {
    clearTimeout(qtransSelectionTimeout);
  }

  qtransSelectionTimeout = setTimeout(async () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      removeExistingChip();
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length === 0) {
      removeExistingChip();
      return;
    }

    // あまり長すぎる文は対象外（任意に 300 文字まで）
    if (text.length > 300) {
      removeExistingChip();
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
    const context = {
      page: pageContext,
      surrounding: surroundingContext,
    };

    createChipElement('翻訳中…', rect);
    const translated = await translateText(text, context);
    createChipElement(translated, rect);
  }, 350);
}

document.addEventListener('selectionchange', handleSelectionChange, {
  passive: true,
});

