---
name: eldeland-dev
description: エルデラント年代記（住人が自律して暮らすドット絵3Dファンタジー世界）の設計・ファイル構成・データ構造・新しい仕組みの足し方・試験方法・公開手順。このリポジトリでコードを書く・直す・試す・公開するときは必ず最初に読む。
---

# エルデラント年代記 開発の手引き

## 全体像
- ブラウザだけで動く。ビルドは不要。ES Modules と Three.js r170（`vendor/`、importmap で "three" を割り当て）を使う。
- 外部 API は使わない。住人の思考・会話はすべてルールベース。API 料金はかからない。
- 世界の状態はすべて `sim.S` に入り、IndexedDB に丸ごと保存される（`js/store.js`）。
- 時間：1歩 `sim.step(0.5)` は0.5分。1日は1440分で、2880歩。1倍速は現実1秒で2分。
- 大陸は160×160マス（`W`、`H`）。国は3つ（アルデリア、ヴェルムント、南の砂漠の国サハル）。王都・村・港町と、魔王城、ダンジョン（cave）、ピラミッド、遺跡、盗賊のアジト、鉱山、展望台がある。
- 歴史は280年分を生成する。住人は祖先・家系・記憶を持ち、自分を本物の人間だと思って暮らす。

## ファイルと役割
| ファイル | 役割 |
|---|---|
| `js/sim.js` | 本体の `Sim` クラス。newWorld と load、households、decide（行動の効用）、startAction、arrive、doWork、step、newHour、newDay、die、marry、birth、immigration、adventurerArrives を持つ |
| `js/world.js` | 地形生成。T.* タイル、町の区画、`tryPlace` と `makeHousePlacer`、`fields` と `pastures` |
| `js/history.js` | 280年の歴史、王朝、職業割り当て（`JOB_QUOTA`）、盗賊と囚人 |
| `js/data.js` | 職業 JOBS（約90種）、GOODS、SPECIES（60種）、KINGDOMS、RANKS、DEATH_CAUSES、ROLES |
| `js/society.js` | 戦闘（startFight、stepCombat）、犯罪、手配、逮捕、裁き。humanStats |
| `js/creatures.js` | 生き物の生成と移動、町に入れる種の制限（townMask）、進化、巣からの襲撃、ドロップ |
| `js/politics.js` | 王の判断、税、戦争、技術研究、魔王の覚醒と復活、勇者 |
| `js/danger.js` | 危険地図（8×8マスの区画）、tooDangerous、町の守り（defendTowns）、spotThreats |
| `js/items.js` | 武器・防具・道具・素材・消耗品、品質、装備（autoEquip）、初期装備（starterKit） |
| `js/guild.js` | ギルドの依頼（討伐・採集・探索・盗賊・賞金首・配達）、ランク F〜S、パーティー（partiesDaily、splitCoins、splitLoot） |
| `js/property.js` | 財布（p.purse）、持ち家と借家、家賃、追い出し、宿住まい、畑（hh.land）と小作、家畜の持ち主（c.keeper）、相続 |
| `js/speech.js` | 会話文の生成（話題40以上、身分と性別の話し方、敬語、呼びかけ、重複防止）、innerThought |
| `js/kin.js` | 続柄の計算 |
| `js/render.js` | 3D描画。地形は InstancedMesh、建物は材質ごとに結合、スプライト、昼夜、pick |
| `js/sprites.js` | 人と生き物の4方向×3コマ歩行ドット絵。個体ごとに違う見た目 |
| `js/interior.js` | 全建物とダンジョンの内装ビュー（InteriorView：open、update、pick、say、hit、close） |
| `js/ui.js` | パネル、吹き出し、ミニマップ、速報、詳細欄（人・生き物・建物）、ギルド・暮らし・国々のタブ、内装モーダル |
| `js/main.js` | 起動、フレームループ（sim は1フレーム30msまで）、イベントの振り分け |

## データの要点
- **人** `p`：
  - needs（7欲求：survival、sleep、hunger、lust、sloth、pleasure、esteem）
  - pers（O、C、E、A、N）、values（courage、ambition など）
  - memories（`{t, txt, emo, imp, k, about}`）、rel（`{a: 好感}`）
  - q（行動の好みの学習値）、skill、danger
  - inv と eq、purse、party、quest、qp（依頼の達成点）
  - hh、s（町）、rank、job
- **世帯** `S.households[id]`：
  - members、house（建物id）、money（家計）、food、land
  - 状態の印：street、inn、wander、bandits、royal
- **建物** `S.world.buildings[id]`：
  - type、x、z、w、d、door、hh（住んでいる世帯）
  - 財産の情報：owner（持ち主の世帯id）、value、rent、arrears
- **生き物** `S.creatures[id]`：
  - sp、hostile、role、lv、owner（町id）、keeper（世帯id）、inDungeon、named
- **その他**：`S.quests`、`S.advParties`、`S.dangerMap`、`S.towns[sid]`（stock、price、fund、shop、mats）、`S.kingdoms`

## 新しい仕組みの足し方（決まり）
1. できるだけ新しいモジュール（`js/xxx.js`）に書き、`xxxDaily(sim)` や `xxxHourly(sim)` を export する。
2. `sim.js` の `newDay()` や `newHour()` から呼ぶ。guildDaily、partiesDaily、propertyDaily の並びに足す。
3. 状態は遅延初期化する（`S.xxx = S.xxx || {}`）。**古いセーブで欠けていても動くこと**。load() で `if (!data.xxx) initXxx(this)` とする。
4. 住人の行動は、decide の `add(点数, type, place, 分数, extra)` で候補を足す。到着時の処理は `arrive`。ui.js の ACTION_LABEL と ACTION_GO、好みの名詞 PREF_LABEL に日本語ラベルを足す。
5. 出来事は次の使い分けで伝える。
   - `sim.pushLog(文, 'event', [id], pos)`：ログ
   - `sim.news(文, 重要度, pos)`：速報
   - `sim.chron(文, 国)`：年代記
   - `sim.remember(p, 文, {emo, imp, k})`：本人の記憶
   - `sim.gossip(p, 述語, emo, 聞き手, opt)`：噂
6. 重い処理は毎歩やらない。全員を回すループは、日ごとか時間ごとにする。

## 試験
- **ヘッドレス**：`node .claude/skills/eldeland-dev/scripts/headless.mjs 8`。8日分回し、財産・パーティー・依頼の統計と、関連ログを出す。1日あたり約7〜8秒かかる。
- **ブラウザ**：
  1. `python3 -m http.server 8124` を起動する。
  2. `node .claude/skills/eldeland-dev/scripts/uitest.mjs` を実行する。Playwright はグローバルの `/opt/node22/lib/node_modules/playwright`、Chromium は swiftshader を使う。
  3. ギルドのタブ、詳細欄、内装を開いて、pageerror を集め、ui.png と ui2.png を撮る。
- **スプライトの単体撮影**：`shot.mjs <モジュール> <出力png> <関数名>`。
- 画面で確かめるときは `window.__world = { sim, renderer, ui }` を使う。

## 公開（Artifact）
1. `python3 .claude/skills/eldeland-dev/scripts/build_artifact.py <scratchpad>/lindenberg.html` でページ本体を作る。index.html の body と、style.css をインラインにしたもの。
2. Artifact を publish する。既存の URL は https://claude.ai/artifact/Df1f1Z2YXeo7QQ4jHJZ2U6 。files には、スクリプトが出力した js/*.js と vendor/*.js を同じパスで渡す。**新しい js ファイルを足したら、files に入れ忘れないこと**。
