// 常量定义
const LAST_UPDATED_TIMESTAMP = 1767527469806;

// 多语言支持
const translations = {
    'zh-CN': {
        // 应用标题和基本信息
        'appTitle': 'DeepSeek导出对话查看器（测试）',
        'lastUpdated': '最后更新时间：' + new Date(LAST_UPDATED_TIMESTAMP).toLocaleString('zh-CN') + ' | ',
        'projectHomepage': '项目主页',
        
        // 按钮文本
        'uploadJSON': '上传JSON',
        'toggleSidebar': '显示边栏',
        'hideSidebar': '隐藏边栏',
        'toggleContent': '显示内容',
        'hideContent': '隐藏内容',
        'darkMode': '深色模式',
        'lightMode': '浅色模式',
        'saveOffline': '离线保存',
        'printConversations': '打印对话（存在问题）',
        'closeConversations': '关闭对话',
        
        // 模态窗口
        'uploadModalTitle': '上传或输入JSON内容',
        'dropZoneText': '拖放JSON文件到此处或点击上传',
        'manualInputTitle': '或手动输入JSON内容：',
        'jsonInputPlaceholder': '在此处粘贴JSON内容...',
        'parseButton': '解析JSON',
        'helpText': '不知道如何获取JSON数据？',
        'viewInstructions': '查看说明',
        
        // 保存模态窗口
        'saveModalTitle': '保存选项',
        'saveCurrentPage': '保存当前网页（不保存已编辑的对话）',
        'downloadFromGitHub': '从 GitHub 下载最新版本（推荐）',
        'downloadFromGitee': '从 Gitee 下载最新版本（推荐）',
        'saveSnapshot': '保存阅读器快照（不推荐）',
        'saveEditedConversations': '保存已编辑的对话',
        'saveAsJSON': '保存对话为JSON',
        'saveWithSnapshot': '保存对话和阅读器快照（存在问题）',
        
        // 搜索和筛选
        'searchPlaceholder': '搜索对话标题或内容...',
        'searchResults': '找到 {count} 个匹配项',
        'startDate': '开始日期',
        'endDate': '结束日期',
        'sortNewest': '由新到旧',
        'sortOldest': '由旧到新',
        'sortTitle': '按标题排序',
        
        // 对话列表
        'conversationList': '对话列表',
        'conversationCount': '{count} 个对话',
        'noConversations': '尚未加载任何对话。请点击上方的"上传JSON"按钮。',
        'selectConversation': '选择左侧的对话以查看详情',
        'noTitle': '无标题对话',
        'editTitle': '编辑标题',
        'deleteConversation': '删除对话',
        
        // 对话详情
        'startTime': '开始: ',
        'endTime': '结束: ',
        'unknownType': '未知类型',
        'noContent': '无内容',
        'unknownDate': '未知日期',
        'unknownSource': '未知来源',
        
        // 分支导航
        'deleteBranch': '删除此分支',
        
        // 代码块
        'copyCode': '复制',
        'copied': '已复制!',
        'downloadCode': '下载',
        
        // 加载状态
        'loadingText': '正在处理数据...',
        
        // 确认对话框
        'confirmDeleteConversation': '确定要删除这个对话吗？此操作不可撤销。',
        'confirmDeleteBranch': '确定要删除这个分支吗？此操作不可撤销。',
        'confirmReset': '确定要关闭当前打开的对话吗？所有数据将会丢失。',
        
        // 错误消息
        'jsonParseError': 'JSON解析错误: ',
        'fileReadError': '文件读取错误',
        'invalidFileType': '请上传JSON文件',
        'noJSONContent': '请输入JSON内容',
        'noConversationsToSave': '没有对话可保存'
    },
    'en': {
        // 应用标题和基本信息
        'appTitle': 'DeepSeek Chat Reader(beta)',
        'lastUpdated': 'Last updated: ' + new Date(LAST_UPDATED_TIMESTAMP).toLocaleString('en-US') + ' | ',
        'projectHomepage': 'Project Homepage',
        
        // 按钮文本
        'uploadJSON': 'Upload JSON',
        'toggleSidebar': 'Show Sidebar',
        'hideSidebar': 'Hide Sidebar',
        'toggleContent': 'Show Content',
        'hideContent': 'Hide Content',
        'darkMode': 'Dark Mode',
        'lightMode': 'Light Mode',
        'saveOffline': 'Save Offline',
        'printConversations': 'Print Conversations (Issues)',
        'closeConversations': 'Close Conversations',
        
        // 模态窗口
        'uploadModalTitle': 'Upload or Input JSON Content',
        'dropZoneText': 'Drag and drop JSON file here or click to upload',
        'manualInputTitle': 'Or manually input JSON content:',
        'jsonInputPlaceholder': 'Paste JSON content here...',
        'parseButton': 'Parse JSON',
        'helpText': 'Don\'t know how to get JSON data?',
        'viewInstructions': 'View Instructions',
        
        // 保存模态窗口
        'saveModalTitle': 'Save Options',
        'saveCurrentPage': 'Save current page (without edited conversations)',
        'downloadFromGitHub': 'Download latest version from GitHub (Recommended)',
        'downloadFromGitee': 'Download latest version from Gitee (Recommended)',
        'saveSnapshot': 'Save reader snapshot (Not recommended)',
        'saveEditedConversations': 'Save edited conversations',
        'saveAsJSON': 'Save conversations as JSON',
        'saveWithSnapshot': 'Save conversations with reader snapshot (Issues)',
        
        // 搜索和筛选
        'searchPlaceholder': 'Search conversation titles or content...',
        'searchResults': 'Found {count} matches',
        'startDate': 'Start Date',
        'endDate': 'End Date',
        'sortNewest': 'Newest First',
        'sortOldest': 'Oldest First',
        'sortTitle': 'Sort by Title',
        
        // 对话列表
        'conversationList': 'Conversation List',
        'conversationCount': '{count} conversations',
        'noConversations': 'No conversations loaded yet. Please click the "Upload JSON" button above.',
        'selectConversation': 'Select a conversation from the left to view details',
        'noTitle': 'Untitled Conversation',
        'editTitle': 'Edit Title',
        'deleteConversation': 'Delete Conversation',
        
        // 对话详情
        'startTime': 'Start: ',
        'endTime': 'End: ',
        'unknownType': 'Unknown Type',
        'noContent': 'No content',
        'unknownDate': 'Unknown date',
        'unknownSource': 'Unknown source',
        
        // 分支导航
        'deleteBranch': 'Delete this branch',
        
        // 代码块
        'copyCode': 'Copy',
        'copied': 'Copied!',
        'downloadCode': 'Download',
        
        // 加载状态
        'loadingText': 'Processing data...',
        
        // 确认对话框
        'confirmDeleteConversation': 'Are you sure you want to delete this conversation? This action cannot be undone.',
        'confirmDeleteBranch': 'Are you sure you want to delete this branch? This action cannot be undone.',
        'confirmReset': 'Are you sure you want to close the current conversation? All data will be lost.',
        
        // 错误消息
        'jsonParseError': 'JSON parsing error: ',
        'fileReadError': 'File reading error',
        'invalidFileType': 'Please upload a JSON file',
        'noJSONContent': 'Please enter JSON content',
        'noConversationsToSave': 'No conversations to save'
    }
};