# Q-Trans Chrome拡張 Google認証ガイド

このドキュメントは、`extension` の Google OAuth 実装について、セットアップから運用までをまとめたものです。

## 1. 実装概要

- 認証方式: `chrome.identity.launchWebAuthFlow` を使った OAuth 2.0 (Implicit Flow)
- スコープ: `openid profile email`
- 取得データ: Google UserInfo (`name`, `email`, `picture` など)
- UI反映: ポップアップ右上にアバター表示、中央にログイン状態表示
- 実装ファイル:
  - `extension/src/popup/auth.ts`
  - `extension/src/popup/App.tsx`
  - `extension/manifest.json`

## 2. GCP 側セットアップ手順

## 2.1 OAuth同意画面の準備

1. Google Cloud Console で対象プロジェクトを作成/選択
2. 「OAuth 同意画面」を開く
3. User Type を選択（社内用途なら Internal、一般公開なら External）
4. アプリ名・サポートメールを設定
5. 必要スコープに `openid`, `profile`, `email` を追加
6. テスト公開の場合はテストユーザーを登録

## 2.2 OAuth クライアント (Chrome Extension) 作成

1. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
2. アプリの種類で「Chrome 拡張機能」を選択
3. 拡張機能 ID を入力
4. 作成後の Client ID を控える

拡張機能 ID は、`chrome://extensions` の対象拡張から確認できます。

## 2.3 リダイレクトURIの考え方

Chrome拡張の OAuth リダイレクト先は次の形式です。

- `https://<extension-id>.chromiumapp.org/`

`extension/src/popup/auth.ts` では `chrome.identity.getRedirectURL()` を使用しているため、実際の拡張 ID に合わせた URI が自動利用されます。

## 3. manifest.json 設定

`extension/manifest.json` の Google認証関連キー:

- `permissions`
  - `identity`: OAuthフロー起動に必須
  - `storage`: トークン/ユーザー情報の保存に利用
- `oauth2`
  - `client_id`: GCPで発行した Client ID を設定
  - `scopes`: `openid profile email`
- `host_permissions`
  - `https://www.googleapis.com/*`: UserInfo API 呼び出し
  - `https://oauth2.googleapis.com/*`: revoke API 呼び出し
- `action.default_popup`
  - `dist/popup/popup.html`: Reactポップアップの実体

現在の `client_id` はプレースホルダーです。必ず差し替えてください。

## 4. 認証フロー詳細

1. ポップアップ表示時に `loadAuthState()` で `chrome.storage.local` を読み込む
2. 未ログイン時、「Googleでログイン」押下で `signInWithGoogle()` 実行
3. `buildAuthUrl()` で OAuth URL を組み立て
4. `chrome.identity.launchWebAuthFlow()` を `interactive: true` で起動
5. リダイレクトURLのハッシュから `access_token` を抽出
6. `https://www.googleapis.com/oauth2/v3/userinfo` を Bearer 付きで呼ぶ
7. `access_token` と `user` を `chrome.storage.local` に保存
8. `App.tsx` が状態更新し、右上にアバター (`user.picture`) を描画
9. ログアウト時は revoke API を試行し、ローカル保存データを削除

## 5. トークン/ユーザー情報保持方針

- 保存先: `chrome.storage.local`
- 保存キー:
  - `qtransGoogleAccessToken`
  - `qtransGoogleUser`
- 保持期間: 明示ログアウトまたは手動削除まで
- クリアタイミング:
  - `signOutFromGoogle()` 実行時に常に削除
  - revoke API が失敗してもローカルデータ削除は継続

## 6. 失敗ケースと対処

## 6.1 ユーザーが認証をキャンセル

- 症状: `redirectUrl` が得られない/エラー返却
- 対処: UIへエラー表示し、再試行を促す

## 6.2 Client ID 未設定/不正

- 症状: 認証開始時に失敗
- 対処: `manifest.json` の `oauth2.client_id` を正しい値に更新

## 6.3 トークン期限切れ・無効

- 症状: UserInfo API が `401/403`
- 対処: ログアウト後に再ログイン。必要ならAPI失敗時に状態を破棄して再認証へ誘導

## 6.4 権限不足/同意画面未設定

- 症状: `access_denied` や scope関連エラー
- 対処: OAuth同意画面とテストユーザー設定、スコープ設定を再確認

## 6.5 ネットワーク/API障害

- 症状: fetch失敗、`5xx`
- 対処: UIに失敗理由を表示し、再試行導線を維持

## 7. 開発/本番運用チェックリスト

## 7.1 開発時

- [ ] 拡張IDを固定してテストする（ID変化に注意）
- [ ] `oauth2.client_id` が対象拡張ID向けであることを確認
- [ ] OAuth同意画面のテストユーザーに自分のアカウントを追加
- [ ] `npm run build` 後に `dist/popup/popup.html` が生成されることを確認

## 7.2 公開前

- [ ] 同意画面の公開ステータスと必要審査を確認
- [ ] プライバシーポリシーやユーザーデータ利用目的を明示
- [ ] 不要スコープを付与していないか確認
- [ ] エラー時のUI表示とログアウト導線を再確認

## 8. 実装/デバッグ時の補足

- 認証URL生成やリダイレクト判定は `extension/src/popup/auth.ts` に集約
- UIの状態遷移（loading / signed-in / signed-out）は `extension/src/popup/App.tsx` に集約
- 追加で厳格化するなら以下を検討
  - API失敗時に保存済みトークンを自動破棄
  - トークン有効期限の管理
  - バックエンド連携への移行（必要なら Authorization Code + PKCE）
