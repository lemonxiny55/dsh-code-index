/**
 * UI strings for the settings card, registered with the host locale service
 * (which picks one dictionary per user). `zh` is also the fallback when no
 * locale service is available.
 */

export const zh = {
  description: '结构化仓库索引：符号搜索、仓库地图与调用图。',
  expand: '展开设置',
  collapse: '收起设置',
  autoInjectLabel: '自动注入仓库地图',
  autoInjectHint: '把精简的排名仓库地图注入系统提示词。',
  codeHealthLabel: '代码健康工具',
  codeHealthHint: '注册 code_health 工具，报告环依赖与孤儿模块（重启后生效）。',
  mapFilesLabel: '地图文件数',
  mapFilesHint: '仓库地图中最多展示的文件数。',
  discard: '放弃修改',
  save: '保存',
  settingsUnavailable: '设置服务不可用。',
}

export type LocaleKey = keyof typeof zh

export const en: Record<LocaleKey, string> = {
  description: 'Structured repository index: symbol search, repo map, and call graph.',
  expand: 'Expand settings',
  collapse: 'Collapse settings',
  autoInjectLabel: 'Auto-inject repo map',
  autoInjectHint: 'Inject a compact, ranked repo map into the system prompt.',
  codeHealthLabel: 'Code health tool',
  codeHealthHint: 'Register the code_health tool, which reports dependency cycles and orphan modules (takes effect after a restart).',
  mapFilesLabel: 'Repo map files',
  mapFilesHint: 'Maximum number of files shown in the repo map.',
  discard: 'Discard changes',
  save: 'Save',
  settingsUnavailable: 'Settings service unavailable.',
}
