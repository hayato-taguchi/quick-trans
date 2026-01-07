// Q-Trans options (Azure OpenAI 用)

const endpointInput = document.getElementById("endpoint");
const deploymentInput = document.getElementById("deployment");
const apiVersionInput = document.getElementById("apiVersion");
const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

function showStatus(message, type = "ok") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function init() {
  try {
    chrome.storage.sync.get(
      ["qtransAzureEndpoint", "qtransAzureDeployment", "qtransAzureApiVersion", "qtransApiKey"],
      (result) => {
      if (chrome.runtime.lastError) {
        showStatus("設定の読み込みに失敗しました", "error");
        return;
      }
        if (result.qtransAzureEndpoint) {
          endpointInput.value = result.qtransAzureEndpoint;
        }
        if (result.qtransAzureDeployment) {
          deploymentInput.value = result.qtransAzureDeployment;
        }
        if (result.qtransAzureApiVersion) {
          apiVersionInput.value = result.qtransAzureApiVersion;
        }
        if (result.qtransApiKey) {
          apiKeyInput.value = result.qtransApiKey;
        }
        showStatus("保存済みの設定を読み込みました", "ok");
      }
    );
  } catch (e) {
    showStatus("このブラウザでは storage が利用できません", "error");
  }
}

function save() {
  const endpoint = endpointInput.value.trim();
  const deployment = deploymentInput.value.trim();
  const apiVersion = apiVersionInput.value.trim();
  const key = apiKeyInput.value.trim();

  if (!endpoint || !deployment || !apiVersion || !key) {
    showStatus("全ての項目を入力してください", "error");
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
        showStatus("保存に失敗しました", "error");
        return;
      }
        showStatus("設定を保存しました", "ok");
      }
    );
  } catch (e) {
    showStatus("保存時にエラーが発生しました", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init();
  saveBtn.addEventListener("click", save);
});


