# 档案协议

调用 zhixing_archive(action="read") 读取档案；写入调用 action="apply", operation 为以下对象的 JSON 字符串。每次 expectedRevision 必须等于最新 revision。所有 id 为小写字母、数字和中划线。

1. 新主题：
```json
{"expectedRevision":0,"type":"create-topic","topic":{"id":"topic","title":"主题名称","goal":"能完成的具体任务","sources":["材料出处"],"models":[],"next":"一道具体诊断任务"}}
```
2. 模型草案或修订：
```json
{"expectedRevision":1,"type":"revise-model","topicId":"topic","author":"deepseek","reason":"修订依据","model":{"id":"model","kind":"discrimination","title":"如何判断","rule":"具体规则","conditions":["条件"],"input":"输入概念","output":"输出概念","examples":[],"counterexamples":[],"source":"材料页码或助手生成","status":"draft","diagram":{"outputCriteria":"输出分类标准","pairs":[{"label":"正例","input":"具体情境","output":"具体结果","reason":"对应规则的依据","source":"来源"}]}}}}
```
kind 为 discrimination 或 connection；connection 必须增加 relation 字段。status 为 draft、tested 或 disputed；tested 必须有真实作答证据，不表示全面掌握。版本由工具递增。diagram 可省略，pairs 最多30项，五个字段必填。author 只有在用户确实提出或确认时才写 learner。

3. 真实作答：
```json
{"expectedRevision":2,"type":"record-attempt","topicId":"topic","attempt":{"id":"attempt-001","modelId":"model","question":"题目","answer":"用户原答","support":"independent","context":"initial","outcome":"incorrect","feedback":"评价依据","source":"材料来源","reviewer":"deepseek","occurredAt":"真实ISO时间"}}
```
support: independent / hinted / explained。context: initial / new-context / delayed。outcome: correct / partial / incorrect / uncertain。delayed 必须附 retestOf 指向同模型已存在作答且真实相隔至少24小时。禁止未来时间。工具记录 modelVersion、recordedAt。原答不可改写。

4. 更正评价：
```json
{"expectedRevision":3,"type":"annotate-attempt","topicId":"topic","attemptId":"attempt-001","author":"deepseek","note":"更正依据"}
```
5. 下一步：
```json
{"expectedRevision":4,"type":"set-next","topicId":"topic","author":"deepseek","next":"换一个没有提示的新例子，检查能否注意到行为频率变化。"}
```

6. 用户明确要求迁移档案时：先读取其导出的 JSON，再 read 确认当前档案没有主题；调用 apply，operation 为 `{"expectedRevision":0,"type":"restore-empty","archive":完整导出对象}`。只能导入真实档案，示例 isDemo=true 会被拒绝。已有主题时不要清空或覆盖，提示用户保留两份数据；不要自行合并评分。
