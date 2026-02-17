import { defineContentScript } from 'wxt/utils/define-content-script';
import '../src/content-script';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // 実処理は既存 content-script の副作用初期化を利用
  },
});
