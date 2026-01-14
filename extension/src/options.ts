// Q-Trans options (Azure OpenAI 用)

const endpointInput = document.getElementById('endpoint') as HTMLInputElement;
const deploymentInput = document.getElementById('deployment') as HTMLInputElement;
const apiVersionInput = document.getElementById('apiVersion') as HTMLInputElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

function showStatus(message: string, type: 'ok' | 'error' = 'ok'): void {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function init(): void {
  try {
    chrome.storage.sync.get(
      ['qtransAzureEndpoint', 'qtransAzureDeployment', 'qtransAzureApiVersion', 'qtransApiKey'],
      (result) => {
        if (chrome.runtime.lastError) {
          showStatus('設定の読み込みに失敗しました', 'error');
          return;
        }
        if (result.qtransAzureEndpoint) {
          endpointInput.value = result.qtransAzureEndpoint as string;
        }
        if (result.qtransAzureDeployment) {
          deploymentInput.value = result.qtransAzureDeployment as string;
        }
        if (result.qtransAzureApiVersion) {
          apiVersionInput.value = result.qtransAzureApiVersion as string;
        }
        if (result.qtransApiKey) {
          apiKeyInput.value = result.qtransApiKey as string;
        }
        showStatus('保存済みの設定を読み込みました', 'ok');
      }
    );
  } catch {
    showStatus('このブラウザでは storage が利用できません', 'error');
  }
}

function save(): void {
  const endpoint = endpointInput.value.trim();
  const deployment = deploymentInput.value.trim();
  const apiVersion = apiVersionInput.value.trim();
  const key = apiKeyInput.value.trim();

  if (!endpoint || !deployment || !apiVersion || !key) {
    showStatus('全ての項目を入力してください', 'error');
    return;
  }

  try {
    chrome.storage.sync.set(
      {
        qtransAzureEndpoint: endpoint,
        qtransAzureDeployment: deployment,
        qtransAzureApiVersion: apiVersion,
        qtransApiKey: key,
      },
      () => {
        if (chrome.runtime.lastError) {
          showStatus('保存に失敗しました', 'error');
          return;
        }
        showStatus('設定を保存しました', 'ok');
      }
    );
  } catch {
    showStatus('保存時にエラーが発生しました', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  saveBtn.addEventListener('click', save);
});
