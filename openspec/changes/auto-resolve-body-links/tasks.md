## 1. 类型定义扩展

- [x] 1.1 在 `src/types.ts` 的 `SkillContent` 接口中新增 `linkedFiles: string[]` 字段

验证方式：TypeScript 编译通过，`SkillContent` 类型包含 `linkedFiles` 字段
测试文件：无需独立测试，后续任务会覆盖

## 2. Loader 链接提取

- [x] 2.1 在 `src/loader/index.ts` 中实现 `extractLinkedFiles(body: string, skillDir: string): Promise<string[]>` 私有方法：用正则 `\[([^\]]*)\]\(([^)]+)\)` 提取 body 中的 markdown 链接，过滤出相对路径（排除 `http://`、`https://`、`#` 开头），通过 `path.resolve(skillDir, relativePath)` 解析为绝对路径，用 `fs.access()` 验证文件存在性，返回去重后的绝对路径数组
- [x] 2.2 在 `loadFull()` 方法中调用 `extractLinkedFiles(result.body, skillDir)`，将结果赋值到 `SkillContent.linkedFiles`

验证方式：编写单元测试验证链接提取逻辑
测试文件：`test/loader.test.ts` — 新增 `extractLinkedFiles` 相关测试用例

## 3. read_resource 白名单扩展

- [x] 3.1 修改 `src/executor/tools.ts` 中 `createSkillTools()` 的 `read_resource` 路径校验逻辑：在现有的 `absolute.startsWith(resolvedDir)` 判断后，增加 `skill.linkedFiles.includes(absolute)` 白名单判断，两者满足其一即通过
- [x] 3.2 修改 `createSkillTools()` 中 `read_resource` 的注入条件：从 `skill.references.length > 0` 改为 `skill.references.length > 0 || skill.linkedFiles.length > 0`
- [x] 3.3 更新 `read_resource` 的 description 文本，增加对链接文件的说明，让 LLM 知道可以读取 body 中链接的文件

验证方式：编写单元测试验证白名单放行和非白名单拦截
测试文件：`test/executor.test.ts` — 新增 `read_resource linkedFiles` 相关测试用例

## 4. Engine 工具注入适配

- [x] 4.1 修改 `src/engine.ts` 中 `buildToolsForSkills()` 的注入条件：从 `skill.scripts.length > 0 || skill.references.length > 0` 改为 `skill.scripts.length > 0 || skill.references.length > 0 || skill.linkedFiles.length > 0`

验证方式：确认无脚本无引用但有链接文件的技能也能获得 `read_resource` 工具
测试文件：`test/integration.test.ts` — 可选，集成场景覆盖

## 5. 测试

- [x] 5.1 在 `test/loader.test.ts` 中新增测试用例：body 含相对路径链接 → `linkedFiles` 包含对应绝对路径
- [x] 5.2 在 `test/loader.test.ts` 中新增测试用例：body 含 HTTP 链接和锚点链接 → `linkedFiles` 不包含这些链接
- [x] 5.3 在 `test/loader.test.ts` 中新增测试用例：body 含指向不存在文件的链接 → `linkedFiles` 不包含该链接，不抛错
- [x] 5.4 在 `test/loader.test.ts` 中新增测试用例：body 无链接 → `linkedFiles` 为空数组
- [x] 5.5 在 `test/executor.test.ts` 中新增测试用例：`read_resource` 读取 `linkedFiles` 中的路径 → 返回文件内容
- [x] 5.6 在 `test/executor.test.ts` 中新增测试用例：`read_resource` 读取不在白名单中的 `../` 路径 → 返回 "Path traversal detected"

验证方式：`npx vitest run` 全部通过（现有 73 + 新增约 6 = ~79 个用例）
测试文件：`test/loader.test.ts`, `test/executor.test.ts`

## 6. 验收

- [x] 6.1 使用 `demo-hive-mind/skills/frontend-coding-standards` 技能端到端验证：加载技能后 `linkedFiles` 包含 `../frontend-standards/` 下 4 个 `.md` 文件的绝对路径，LLM 可通过 `read_resource` 读取

验证方式：在 demo 项目中运行测试请求，检查日志确认 `linkedFiles` 填充和 `read_resource` 调用成功
