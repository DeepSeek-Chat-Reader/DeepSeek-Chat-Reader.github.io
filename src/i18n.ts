/** Lightweight i18n: zh-CN / en dictionaries. */

type Dict = Record<string, string>;

const zhCN: Dict = {
  appTitle: 'DeepSeek导出对话查看器',
  projectHomepage: '项目主页',
  lastUpdated: '最后更新：2026-08-31 | ',
  uploadJSON: '上传JSON',
  batchSelect: '批量选择',
  toggleSidebar: '显示边栏',
  hideSidebar: '隐藏边栏',
  toggleContent: '显示内容',
  hideContent: '隐藏内容',
  darkMode: '深色模式',
  lightMode: '浅色模式',
  saveOffline: '保存',
  printConversations: '打印',
  printOptions: '打印选项',
  printNow: '打印',
  printExpandThink: '展开思考与搜索结果',
  printExpandThinkHint: '勾选后，思考内容和搜索来源会完整打印；不勾选则只打印问题与回答。',
  closeConversations: '关闭对话',

  uploadModalTitle: '上传或输入JSON内容',
  dropZoneText: '拖放JSON文件到此处或点击上传',
  manualInputTitle: '或手动输入JSON内容：',
  jsonInputPlaceholder: '在此处粘贴JSON内容...',
  parseButton: '解析JSON',
  helpText: '不知道如何获取JSON数据？',
  viewInstructions: '查看说明',

  saveModalTitle: '保存选项',
  saveCurrentPage: '保存当前网页（不保存已编辑的对话）',
  downloadFromGitHub: '从 GitHub 下载最新版本（推荐）',
  downloadFromGitee: '从 Gitee 下载最新版本（推荐）',
  saveSnapshot: '保存阅读器快照（不推荐）',
  saveEditedConversations: '保存已编辑的对话',
  saveAsJSON: '保存对话为JSON',
  saveWithSnapshot: '保存对话和阅读器快照',

  searchPlaceholder: '搜索对话标题或内容...',
  searchResults: '找到 {count} 个匹配项',
  startDate: '开始日期',
  endDate: '结束日期',
  sortByStartDate: '按开始日期',
  sortByLastDate: '按最后日期',
  sortTitle: '按标题排序',
  ascending: '升序',
  descending: '降序',

  conversationList: '对话列表',
  conversationCount: '{count} 个对话',
  noConversations: '尚未加载任何对话。请点击"上传JSON"按钮。',
  selectConversation: '选择左侧的对话以查看详情',
  noTitle: '无标题对话',
  editTitle: '编辑标题',
  deleteConversation: '删除对话',

  startTime: '开始: ',
  endTime: '结束: ',
  unknownType: '未知类型',
  noContent: '无内容',
  unknownDate: '未知日期',
  unknownSource: '未知来源',

  deleteBranch: '删除此分支',
  firstBranch: '第一个分支',
  lastBranch: '最后一个分支',
  defaultBranchDisplay: '默认显示分支：',

  copyCode: '复制',
  copied: '已复制!',
  downloadCode: '下载',
  copyMessage: '复制',
  thinking: '思考',
  response: '回答',
  request: '提问',
  search: '搜索',
  fileAttachments: '附件',
  browsedPages: '浏览页面',
  searchResultsTitle: '搜索结果',
  continueGenerating: '（内容未完成）',

  loadingText: '正在处理数据...',

  confirmDeleteConversation: '确定要删除这个对话吗？此操作不可撤销。',
  confirmDeleteBranch: '确定要删除这个分支吗？此操作不可撤销。',
  confirmReset: '确定要关闭当前打开的对话吗？所有数据将会丢失。',
  confirmBatchDelete: '确定要删除选中的 {count} 个对话吗？此操作不可撤销。',

  jsonParseError: 'JSON解析错误: ',
  fileReadError: '文件读取错误',
  invalidFileType: '请上传JSON文件',
  noJSONContent: '请输入JSON内容',
  noConversationsToSave: '没有对话可保存',

  selectAll: '全选',
  invertSelection: '反选',
  deleteSelected: '删除选中',
  cancelBatch: '取消批量',

  outline: '大纲',
  collapseOutline: '收起',
  expandOutline: '展开',
};

const en: Dict = {
  appTitle: 'DeepSeek Chat Reader',
  projectHomepage: 'Project Homepage',
  lastUpdated: 'Last updated: 2026-08-31 | ',
  uploadJSON: 'Upload JSON',
  batchSelect: 'Batch Select',
  toggleSidebar: 'Show Sidebar',
  hideSidebar: 'Hide Sidebar',
  toggleContent: 'Show Content',
  hideContent: 'Hide Content',
  darkMode: 'Dark Mode',
  lightMode: 'Light Mode',
  saveOffline: 'Save',
  printConversations: 'Print',
  printOptions: 'Print Options',
  printNow: 'Print',
  printExpandThink: 'Expand thinking & search results',
  printExpandThinkHint: 'When checked, thinking content and search sources are printed in full; otherwise only questions and answers are printed.',
  closeConversations: 'Close Conversations',

  uploadModalTitle: 'Upload or Input JSON Content',
  dropZoneText: 'Drag and drop JSON file here or click to upload',
  manualInputTitle: 'Or manually input JSON content:',
  jsonInputPlaceholder: 'Paste JSON content here...',
  parseButton: 'Parse JSON',
  helpText: 'How to get the JSON data?',
  viewInstructions: 'View Instructions',

  saveModalTitle: 'Save Options',
  saveCurrentPage: 'Save current page (without edited conversations)',
  downloadFromGitHub: 'Download latest version from GitHub (Recommended)',
  downloadFromGitee: 'Download latest version from Gitee (Recommended)',
  saveSnapshot: 'Save reader snapshot (Not recommended)',
  saveEditedConversations: 'Save edited conversations',
  saveAsJSON: 'Save conversations as JSON',
  saveWithSnapshot: 'Save conversations with reader snapshot',

  searchPlaceholder: 'Search conversation titles or content...',
  searchResults: 'Found {count} matches',
  startDate: 'Start Date',
  endDate: 'End Date',
  sortByStartDate: 'By Start Date',
  sortByLastDate: 'By Last Date',
  sortTitle: 'Sort by Title',
  ascending: 'Asc',
  descending: 'Desc',

  conversationList: 'Conversation List',
  conversationCount: '{count} conversations',
  noConversations: 'No conversations loaded yet. Click the "Upload JSON" button.',
  selectConversation: 'Select a conversation from the left to view details',
  noTitle: 'Untitled Conversation',
  editTitle: 'Edit Title',
  deleteConversation: 'Delete Conversation',

  startTime: 'Start: ',
  endTime: 'End: ',
  unknownType: 'Unknown Type',
  noContent: 'No content',
  unknownDate: 'Unknown date',
  unknownSource: 'Unknown source',

  deleteBranch: 'Delete this branch',
  firstBranch: 'First branch',
  lastBranch: 'Last branch',
  defaultBranchDisplay: 'Default branch:',

  copyCode: 'Copy',
  copied: 'Copied!',
  downloadCode: 'Download',
  copyMessage: 'Copy',
  thinking: 'Thinking',
  response: 'Response',
  request: 'Request',
  search: 'Search',
  fileAttachments: 'Attachments',
  browsedPages: 'Browsed pages',
  searchResultsTitle: 'Search results',
  continueGenerating: '(Incomplete)',

  loadingText: 'Processing data...',

  confirmDeleteConversation: 'Are you sure you want to delete this conversation? This action cannot be undone.',
  confirmDeleteBranch: 'Are you sure you want to delete this branch? This action cannot be undone.',
  confirmReset: 'Are you sure you want to close the current conversation? All data will be lost.',
  confirmBatchDelete: 'Are you sure you want to delete {count} selected conversations? This action cannot be undone.',

  jsonParseError: 'JSON parsing error: ',
  fileReadError: 'File reading error',
  invalidFileType: 'Please upload a JSON file',
  noJSONContent: 'Please enter JSON content',
  noConversationsToSave: 'No conversations to save',

  selectAll: 'Select All',
  invertSelection: 'Invert',
  deleteSelected: 'Delete Selected',
  cancelBatch: 'Cancel Batch',

  outline: 'Outline',
  collapseOutline: 'Collapse',
  expandOutline: 'Expand',
};

const dicts: Record<string, Dict> = { 'zh-CN': zhCN, en };

let current = 'zh-CN';

export function setLanguage(lang: string): void {
  current = dicts[lang] ? lang : 'zh-CN';
}

export function getLanguage(): string {
  return current;
}

/** Translate a key, substituting {param} placeholders. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const dict = dicts[current] ?? zhCN;
  let text = dict[key] ?? zhCN[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

/**
 * Apply translations to all elements with data-i18n / data-i18n-placeholder.
 * Returns nothing; call after DOM changes that introduce new i18n nodes.
 */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });
}
