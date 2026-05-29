# 自定义策略组(Custom Proxy Groups)设计文档

- 日期:2026-05-29
- 状态:已评审定稿,待写实现计划
- 作者:Wayne Wu(经 Claude 协助 brainstorming)

## 1. 背景与目标

sublink-worker 目前会**自动**生成一批策略组:`⚡ 自动选择`(url-test 全部节点)、`🚀 节点选择`(手动 select)、可选的地区组、每条选中规则一个组、每条自定义规则 / 自定义规则集各一个组。这些组的成员**永远是全部节点**,用户既不能让一个组只包含**节点子集**(例如"仅香港节点"),也不能选择组的**类型**(url-test / fallback / …)。

本特性新增**自定义策略组**:让用户在 Web 表单里自行定义命名策略组,指定其**类型**与**成员**(节点名筛选 + 引用其它组),并让这些组成为一等的路由目标。

### 1.1 目标
- 用户可创建命名策略组,选择类型 `select` / `url-test` / `fallback` / `load-balance`。
- 成员来源两类并集:① 名称正则**筛选**命中的节点;② **引用**其它组(内置组 / 地区组 / 规则组 / 规则集名 / 其它自定义组)与 `DIRECT` / `REJECT`。
- 三种输出格式生效:Clash/mihomo、sing-box、Surge。
- **完全集成**:自定义组出现在「节点选择」成员、各规则/自定义规则/自定义规则集组的可选成员里,并作为「自定义规则」「自定义规则集」「漏网之鱼 Fall Back」的 outbound 目标。
- 完整**往返**:表单 → 分享 URL → 服务端输出;以及短码 / "Load from Code" 加载时回填表单。

### 1.2 非目标
- 不支持在表单里手选**单个**节点(填表时拿不到节点名;子集通过正则 `filter` 表达)。
- 不为自定义组自动生成路由规则(它只是出站目标;路由仍由规则/自定义规则/规则集决定)。
- v1 不暴露 mihomo `load-balance` 的 `strategy`(用客户端默认),留作后续可选项。
- 不支持 `relay`、`ssid`、`smart` 等平台专有组类型。

## 2. 术语
- **节点(node/proxy)**:订阅解析出来的单个代理,`getProxyList()` 返回其显示名。
- **组(group)**:Clash 的 `proxy-groups[]`、sing-box 的 group 型 `outbounds[]`(`selector`/`urltest`)、Surge 的字符串策略组。
- **引用(ref)**:作为成员写入组的另一组名或 `DIRECT`/`REJECT`。
- **保留名**:`DIRECT` `REJECT` `REJECT-DROP` `REJECT-TINYGIF` `REJECT-NO-DROP` `PASS`(见 `BaseConfigBuilder` 的 `RESERVED_OUTBOUNDS`)。

## 3. 数据模型

每个自定义策略组是一个 JSON 对象,经分享 URL 参数 `customProxyGroups`(JSON 数组)传递,服务端用现有 `parseJsonArray` 解析(与 `customRuleSets` 一致)。

```json
{
  "name": "🇭🇰 香港自动",
  "type": "url-test",
  "filter": "香港|HK|🇭🇰|Hong",
  "excludeFilter": "官网|剩余|过期",
  "proxies": ["⚡ 自动选择", "DIRECT"],
  "testUrl": "http://www.gstatic.com/generate_204",
  "interval": 300
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 用户字面量;在所有组里唯一;非保留名;emoji 直接写进 name。 |
| `type` | 是 | `select` \| `url-test` \| `fallback` \| `load-balance`。非法值 → 退化为 `select`。 |
| `filter` | 否 | 正则字符串,匹配节点名以纳入成员。非法正则 → 视为未填。 |
| `excludeFilter` | 否 | 正则字符串,从 `filter` 命中里排除。非法正则 → 视为未填。 |
| `proxies` | 否 | 字符串数组,引用其它组 / `DIRECT` / `REJECT`。 |
| `testUrl` | 否 | 仅 `url-test`/`fallback` 用;默认复用现有自动选择组的 URL。 |
| `interval` | 否 | 仅 `url-test`/`fallback` 用;默认 `300`。 |

前端行对象额外带一个内部 `__uid`(UI key),序列化进隐藏 input 时剥离(`JSON.stringify(rows,(k,v)=>k==='__uid'?undefined:v)`),与 `CustomRuleSets` 一致。

## 4. 成员解析(构建时,服务端,三端共用)

采用**方案 A:构建时解析**。最终成员列表:

```
members = uniq( matchedNodes(filter, excludeFilter, proxyList)  ∪  resolvedRefs(proxies) )
```

- **节点筛选**:`proxyList = getProxyList()`(三端均返回真实节点显示名)。
  `matched = proxyList.filter(n => filterRe.test(n) && !(excludeRe && excludeRe.test(n)))`。
  无 `filter` 时不纳入任何节点(只用 refs)。
- **引用解析**:复用既有 `this.t('outboundNames.' + ref)` 机制——
  - 内置/规则名(在 `outboundNames` 字典里)→ 翻译后的实际组名(如 `Node Select` → `🚀 节点选择`);
  - 自定义名(规则集名 / 其它自定义组名,不在字典里)→ translator 回退返回字面量;
  - `DIRECT` / `REJECT` → 原样。
- **无效引用**:指向不存在的组/节点的引用直接丢弃(参照 `mergeUserProxyGroups` 的 `validRefs` 过滤做法)。
- **自引用**:成员里等于自身 `name` 的引用去除。
- **去重**:保序去重。

抽取共享 helper(新文件 `src/builders/helpers/customProxyGroups.js`):
```
resolveCustomProxyGroupMembers({ group, proxyList, validRefs, translator }) -> string[]
mapGroupType(userType, platform) -> nativeType        // 见第 5 节
```
`validRefs` 由各 builder 在 `addCustomProxyGroups` 时构造:`{ ...proxyList, 内置组名(翻译后), 地区组名, 规则组名, 规则集名, 其它自定义组名, DIRECT, REJECT }`。

## 5. 跨平台类型映射(降级)

| 用户选择 | Clash/mihomo | sing-box | Surge |
|---|---|---|---|
| `select` | `select` | `selector` | `select` |
| `url-test` | `url-test` | `urltest` | `url-test` |
| `fallback` | `fallback` | `urltest` ⚠️ | `fallback` |
| `load-balance` | `load-balance` | `urltest` ⚠️ | `url-test` ⚠️ |

⚠️ = 该端无原生类型,降级到最接近的**自动**类型。降级在 `mapGroupType()` 集中实现,并在代码注释与文档说明语义差异(`fallback` 是有序故障转移,降级成 `urltest` 后变为按延迟自动选择)。只有 Clash 三种自动类型全原生。

`testUrl`/`interval` 按**最终(降级后)类型**写出:除 `select`/`selector` 外的所有自动类型(`url-test`/`urltest`/`fallback`/`load-balance`)都写;`select` 不写。

## 6. 完全集成

1. **进入成员列表**:自定义组名插入到「节点选择」成员,以及各规则组 / 自定义规则组 / 自定义规则集组的可选成员里,位置在主锚点(`Auto Select`/`Node Select`)之后、原始节点之前。实现:成员 helper 增参 `customProxyGroupNames`。
2. **作为 outbound 目标**:`自定义规则`、`自定义规则集`、`Fall Back` 的 outbound 下拉新增 optgroup 列出自定义组名;服务端解析这些 outbound 时按第 4 节规则解析到对应组。
3. **不产生规则**:自定义组本身不写入 `rules`。

## 7. 空组处理

若某自定义组解析后成员为空(`filter` 未命中且无有效 ref):
- **丢弃该组**(不写入输出);
- 所有指向它的引用(节点选择成员、规则/规则集/自定义规则的 outbound、Fall Back、前端下拉)**过滤掉或改写为全局 Fall Back 出站**;
- 服务端静默处理(与保留名 / 无效规则集"静默跳过"一致)。

理由:本仓库历史上多次因空组出 bug(`issue-366-empty-auto-select`、`issue-370-empty-clash-output`),丢弃最安全且行为可预测。

## 8. 校验与边界

| 情形 | 处理 |
|---|---|
| `name` 为空 | 跳过该条 |
| `name` 是保留名 | 跳过(与现有 reserved-outbound 行为一致) |
| `name` 与已有任意组(内置/地区/规则/规则集/别的自定义组)重名 | 去重:后者跳过 |
| `type` 非法 | 退化为 `select` |
| `filter`/`excludeFilter` 非法正则 | 忽略该正则 |
| `proxies` 含无效/自引用 | 过滤掉 |
| 解析后空组 | 见第 7 节 |
| `fallback_outbound` = 某自定义组名 | 服务端在 builder 内按"已知组名集合"校验;存在则用,不存在退回 `Node Select`(保持现有 `EvilInjection` 注入测试为绿) |

**Fall Back 校验放宽**:现状 `parseFallbackOutbound` 仅接受 `{Node Select, DIRECT, REJECT}`。改为:`parseFallbackOutbound` 接受这三者**或任意非空字符串**(不在此处拒绝),把真正的存在性校验下沉到 builder——builder 只会引用它**确认存在**的组名,无效目标退回 `Node Select`。这样自定义组可作 Fall Back,且注入字符串永不出现在输出里。前端 `populateFormFromUrl`(line 691)与 Fall Back 下拉同步放宽到"自定义组名亦合法"。

## 9. 架构改动(服务端)

### 9.1 `src/builders/BaseConfigBuilder.js`
- 构造器尾部新增 `customProxyGroups = []`,存 `this.customProxyGroups`。
- `addSelectors()`:**开头**先算 `this.customProxyGroupNames`(经第 8 节校验/去重后的有效名列表),透传给后续所有成员构建(node-select / 规则组 / 自定义规则组 / 规则集组 / Fall Back),使它们的可选成员都含自定义组名;**最后**(在 `addFallBackGroup` 之后、`mergeUserProxyGroups` 之前)调用 `this.addCustomProxyGroups(proxyList)` 真正产出这些组。
  - **为何"名字先算、组后发"**:成员列表只需要组**名**(提前算好即可),与组对象是否已 push 无关;而自定义组**自身**的引用需要对照"所有已存在的组"做有效性校验,所以要等其它组(规则组/地区组/规则集组/Fall Back)都发完之后再发,`validRefSet` 才完整。数组里的先后顺序不影响 Clash/sing-box/Surge 客户端按名解析。
- 新增 `addCustomProxyGroups(proxyList) {}`(默认 no-op,子类覆写)。
- `mergeUserProxyGroups`(base-config 透传)顺序不变,仍在最后,可继续微调自定义组。

### 9.2 `src/builders/helpers/groupBuilder.js`
- `buildNodeSelectMembers` / `buildSelectorMembers` / `buildCustomRuleMembers` 各增可选参数 `customProxyGroupNames = []`,插入在主锚点之后、节点/地区之前。

### 9.3 `src/builders/helpers/customProxyGroups.js`(新)
- `resolveCustomProxyGroupMembers(...)`、`mapGroupType(...)`、空组判定。

### 9.4 三个 builder
各实现 `addCustomProxyGroups(proxyList)`:遍历 `this.customProxyGroups` → 校验 → `mapGroupType` → `resolveCustomProxyGroupMembers` → 空组丢弃 → 按本端格式 push 组;并在各自调用成员 helper 处传入 `this.customProxyGroupNames`。
- `ClashConfigBuilder`:push `{ type, name, proxies, [url, interval] }`。
- `SingboxConfigBuilder`:push `{ type:selector|urltest, tag, outbounds, [url, interval] }`。
- `SurgeConfigBuilder`:用 `createProxyGroup(name, type, options[, extras])` 拼字符串行。

### 9.5 `src/app/createApp.jsx`
- `/clash`、`/singbox`、`/surge`:`const customProxyGroups = parseJsonArray(c.req.query('customProxyGroups'))`,作为构造器**最后一个**实参传入。
- `parseFallbackOutbound` 按第 8 节放宽。

## 10. 前端

### 10.1 新组件 `src/components/CustomProxyGroups.jsx`(仿 `CustomRuleSets.jsx`)
- 表单模式(增删行)+ JSON 模式;隐藏 `input name="customProxyGroups"`,序列化剥离 `__uid`。
- 每行字段:`name`、`type`(下拉)、`filter`、`excludeFilter`(高级)、成员多选、`testUrl`+`interval`(仅 `url-test`/`fallback` 显示)。
- 成员多选选项 = 内置组(Node Select/Auto Select/Fall Back)+ 地区组(若启用)+ 已选规则名 + 规则集名 + **其它**自定义组名 + DIRECT/REJECT。
- 监听 `restore-custom-proxy-groups` 重建行(重生成 `__uid`);成员引用**原样保留**,不做破坏性重置。
- 暴露 `customProxyGroupNames()` 访问器(镜像 `customRuleSetNames()`)。

### 10.2 `src/components/Form.jsx`
- 在「自定义规则集」section 之后插入 `<CustomProxyGroups/>`。
- Fall Back 下拉新增 `customProxyGroupNames()` optgroup。

### 10.3 `src/components/CustomRules.jsx` & `CustomRuleSets.jsx`
- outbound 下拉各新增一个 `customProxyGroupNames()` optgroup(插在「自定义规则集」与「Surge Devices」之间)。

### 10.4 `src/components/formLogic.js`
- **两处**正向序列化(`submitForm` 约 439 行 + 另一处约 257 行):读隐藏 input,`Array.isArray && length>0` 时 `params.append('customProxyGroups', JSON.stringify(...))`。
- `populateFormFromUrl`:在 **surgeDevices 之后、customRuleSets 之前**提取 `customProxyGroups`,`dispatch('restore-custom-proxy-groups',{detail:{groups}})`。
- line 691 fallback 恢复校验:放宽到接受自定义组名。
- line 717"展开高级"OR 条件加入 `customProxyGroups`。

### 10.5 `src/i18n/index.js`
- 新增该 section 的中/英文案(标题、字段标签、类型选项、占位符、optgroup 标签 `outboundCustomProxyGroups` 等)。

## 11. 场景恢复(往返)

恢复顺序(`populateFormFromUrl`,"声明先于消费者"):
```
config → selectedRules → surgeDevices → customProxyGroups(新) → customRuleSets → customRules → fallback_outbound
```
把 `customProxyGroups` 放在 `customRuleSets`/`customRules` 之前,确保后者 outbound 下拉在 `validateOutbounds()` 时已能看到自定义组名;自定义组**自身**成员对规则集名的引用则靠服务端构建时兜底过滤,规避循环依赖。

## 12. 分享 URL 参数

新增参数:`customProxyGroups`(JSON 数组,URL 编码)。仅在非空时写入。与 `customRules`/`customRuleSets` 同一套编解码。

## 13. 测试计划(TDD)

新增 `test/`(沿用现有 vitest 风格):
- **helper 单元**(`custom-proxy-groups-members.test.js`):`filter` 命中、`excludeFilter` 排除、引用解析(内置翻译/自定义字面量/DIRECT-REJECT)、无效/自引用过滤、空组判定、`mapGroupType` 三端映射。
- **builder 三端**(`custom-proxy-groups-builders.test.js`):`select`/`url-test`/`fallback`/`load-balance` 在 Clash/sing-box/Surge 的产出与降级;成员含筛选节点 + 引用;`testUrl`/`interval` 仅自动类型写出。
- **集成往返**(`custom-proxy-groups-e2e.test.js`,仿 `restore-new-features.test.js`):`customProxyGroups` 经 URL → 三端输出含正确组;自定义组作为 customRules / customRuleSets / Fall Back 的 outbound 生效;空组被丢弃且引用回退;`__uid` 被剥离不影响服务端。
- **校验**:保留名/重名/非法 type/非法正则/`fallback_outbound=自定义组名` 与注入字符串。

## 14. 受影响文件清单

**改:**
- `src/builders/BaseConfigBuilder.js`
- `src/builders/ClashConfigBuilder.js`
- `src/builders/SingboxConfigBuilder.js`
- `src/builders/SurgeConfigBuilder.js`
- `src/builders/helpers/groupBuilder.js`
- `src/app/createApp.jsx`
- `src/components/Form.jsx`
- `src/components/CustomRules.jsx`
- `src/components/CustomRuleSets.jsx`
- `src/components/formLogic.js`
- `src/i18n/index.js`

**新增:**
- `src/builders/helpers/customProxyGroups.js`
- `src/components/CustomProxyGroups.jsx`
- `test/custom-proxy-groups-members.test.js`
- `test/custom-proxy-groups-builders.test.js`
- `test/custom-proxy-groups-e2e.test.js`

## 0. 实现最终形态(与下文原始设计的差异)

> 经人工验证迭代后,UI/成员模型做了简化(原始 §1–§14 为设计期记录,保留备查):
> - **成员仅"引用"**:不在 UI 暴露节点名正则(`filter`/`excludeFilter`)。"节点选择"(Node Select)即代表全部节点,需要节点子集时引用地区/规则/规则集组即可。服务端仍兼容 `filter` 字段(向后兼容,UI 不产生)。
> - **不暴露测试 URL/间隔**:与内置「自动选择」一致,url-test/fallback 用统一默认(`http://www.gstatic.com/generate_204` + `300`),不在表单开放配置。
> - **成员选择器**:原生 `<select>` 包在 `<label>` 内(点框内任意处展开下拉),已选项以可点删除的标签显示在框内,标签显示译名;新增 Surge **设备(`DEVICE:`)** 可选项,仅在 Surge 生效(Clash/sing-box 丢弃)。
> - 其余(类型映射、完全集成、空组处理、往返、端点、测试)与下文一致。

## 15. 已确认决策
1. 成员 = 名称正则**筛选** + **引用其它组**(filter + refs)。
2. 支持类型:`select` / `url-test` / `fallback` / `load-balance`(后两者在 sing-box/Surge 按表降级)。
3. **完全集成**:进入节点选择 + 各规则/规则集/自定义规则的成员与 outbound 下拉 + **Fall Back**(放宽校验)。
4. 三端均生效:Clash/mihomo、sing-box、Surge。
5. `filter` 落地用**方案 A 构建时服务端解析**(三端一致、Surge 友好)。
6. 空组**丢弃 + 引用回退** Fall Back。
7. 保留 `excludeFilter`;`load-balance` 的 `strategy` 暂不暴露(YAGNI)。
8. 完整往返,含短码/"Load from Code"恢复。
