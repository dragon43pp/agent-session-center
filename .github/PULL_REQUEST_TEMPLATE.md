## 关联 issue / Related issue

<!-- 例：Fixes #123，或 Closes #123。不关联就直接写「无」。 -->

Closes #

## 改了什么 / What changed

<!-- 一到三句话说清楚。改了行为就直说改了哪个行为，不要只说「优化了一下」。 -->

## 为什么 / Why

<!-- 说明动机：解决什么问题、参考了哪个 issue。 -->

## 界面改动必须贴截图 / UI changes require screenshots

<!-- 凡是改到界面（src/、主题、设置页、悬浮窗），这一段不能空。 -->

- [ ] 本 PR 不涉及界面改动
- 或：已附上改动前后截图（拖进评论框即可）

## 自测清单 / Self-check

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 改到 Observer / 终端层的，补充了能证明事件顺序与降级行为的 fixture 或 runtime 测试
- [ ] 没有提交 `node_modules/`、构建产物、用户数据或任何密钥
- [ ] 若涉及产物名 / 打包配置，已同步核对 `package.json` 与 `scripts/release-*.sh`、`scripts/release-*.ps1` 的名字一致

## 破坏性变更 / Breaking changes

<!-- 有就写，没有就写「无」。 -->
