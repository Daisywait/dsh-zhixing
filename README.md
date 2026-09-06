# 知行 · dsh-zhixing

嵌入 DeepSeek Harness 的学习助手。用一个问题开始，在关联的学习会话中回答；助手记录你的理解和真实作答，学习页显示下一步。需要复盘时展开渐构靶图，查看概念、规则与实例的对应。

## 安装

需要已安装并配置模型的 DeepSeek Harness Web，兼容性基线为 `@deepseek-ai/dsh 0.1.2-rc.1`，Node.js 22 或更新。支持 Windows、macOS、Linux；实际桌面验证在 Windows 完成。

下载发布页的 `dsh-zhixing-0.3.0.tgz` 后运行：

```sh
dsh plugin --profile web add ./dsh-zhixing-0.3.0.tgz
```

重启 `dsh web`，用终端打印的认证网址打开页面。在任一已建立的会话中打开 **学习** 标签。首次新建会话时，也可以直接说“使用 zhixing-learning，帮我学习条件概率”。

无需 Codex，不需要另起面板服务器，不需要配置第二份模型密钥。学习页面和 dsh 使用同一地址与认证。

## 使用

1. 在“学习”页输入想弄明白的问题，点“从这里开始”。
2. 默认新建独立学习会话，请求进入新会话草稿，你确认发送后开始。也可以选择关联已有会话。
3. 回到学习页看下一步；点“我的理解”展开靶图和作答记录。

“继续练一题”回到主题的主要学习会话，准备草稿，不自动发送。已有草稿保留。新会话继承当前工作目录，模型由 dsh 的新会话默认配置决定。

展开“相关会话”可关联多个会话、跳转、设为主要会话或解除关联。解除关联不会删除聊天或学习记录。关联只建立入口，不自动读取或合并其他会话的聊天内容。顶部加号可开始新的学习主题。换电脑后找不到的会话会显示为不可用，可以重新关联。

模型草案和说明实例不是学习成绩；有提示答对与独立答对分开记录。

## 迁移与分享

**分享插件**：只分享本仓库或 `.tgz` 安装包。包中无个人档案、密钥、聊天记录或原书 PDF；接收者得到自己的空白档案。

**迁移自己的进度**：在旧电脑的真实学习空间点顶部下载图标，导出 `zhixing-archive.json`。新电脑安装插件后，把文件放入 dsh 可访问的工作区，再说：“使用 zhixing-learning，从这个文件恢复我的学习档案。”插件只允许恢复到没有主题的档案，拒绝把内置示例导入真实记录。

档案默认保存在 `${DSH_HOME:-~/.dsh}/storages/zhixing/data/archive.json`，与安装包分离，升级或卸载不会删除。备份目录为同级 `history/`。高级使用可在启动 dsh 前设置 `DSH_ZHIXING_HOME` 指定数据目录。

多人不要共用同一个数据目录。JSON 导出包含个人作答，应作为个人备份保存，不要上传公开仓库。

卸载：

```sh
dsh plugin --profile web remove dsh-zhixing
```

## 开发

```sh
npm install
npm test
npm pack
```

`lib/index.js` 注册原生技能、`zhixing_archive` 档案工具和同源只读路由；`lib/client.js` 注册对话中的学习标签；`public/` 为面板；`skills/` 为随包技能。档案通过版本检查、文件锁、备份和原子写入维护。

可单独运行 `node server.mjs` 预览界面，默认端口4317。独立预览只复制练习请求，dsh 内嵌版本才直接准备聊天草稿。

## 共建署名

由 [Daisywait](https://github.com/Daisywait) 与 GPT-6-Astra（通过 OpenAI Codex）协作开发。Daisywait 提出学习理念、产品需求与交互反馈，AI 协助界面设计、代码实现、测试和发布。

GPT-6-Astra 为 AI 协作署名，不代表独立 GitHub 账号或 OpenAI 官方维护。本仓库的 AI 共同作者记录使用 `gpt-6-astra@ai.invalid` 占位地址，不关联真实邮箱或账号。

## 依据与许可

学习方法依据于建国《学习观》的判别模型、联结模型和第34章渐构靶图。图表是依据图34-3的交互改编，未附书籍扫描图或完整原文。行为心理学示例为说明材料，非个人学习数据。

工作台视觉参考 [Aisland-SJL/dsh-worktable](https://github.com/Aisland-SJL/dsh-worktable)，本插件独立实现，不依赖安装该插件。图标来自 Lucide，见 `public/LUCIDE-LICENSE`。

程序 MIT 许可，可复制、修改和传播。原书著作权不在此许可范围。证据计数和结构测试不等同于教学效果验证。
